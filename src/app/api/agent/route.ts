import { NextRequest, NextResponse } from "next/server";
import { toolSearch, executeTool, COSMOS_TOOL_CATALOG } from "@/lib/mcp-gateway";
import { checkOperatorAccess, rejectOversizedBody } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  try {
    const tooLarge = rejectOversizedBody(req, 16_384);
    if (tooLarge) return tooLarge;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
    }
    const {
      action = "SEARCH", // "SEARCH" or "EXECUTE"
      intentQuery = "",
      callerRole: requestedRole = "buyer_agent",
      toolName = "",
      arguments: toolArgs = {},
      approvalDigest = "",
    } = body;

    if (typeof requestedRole !== "string" || typeof intentQuery !== "string" || typeof toolName !== "string") {
      return NextResponse.json({ error: "callerRole, intentQuery and toolName must be strings." }, { status: 400 });
    }
    if (toolArgs === null || typeof toolArgs !== "object" || Array.isArray(toolArgs)) {
      return NextResponse.json({ error: "arguments must be an object." }, { status: 400 });
    }
    // The role is self-asserted by the caller, so it can never grant "admin". Only a caller that
    // proves the operator key may act as admin.
    let callerRole = requestedRole;
    if (requestedRole === "admin" && !checkOperatorAccess(req, { strict: true }).operator) {
      return NextResponse.json({ error: "The admin role requires operator credentials." }, { status: 403 });
    }
    // Unknown roles fall back to the least-privileged agent role. Non-admin roles only reach
    // read-only and proposal tools; nothing here moves money.
    if (requestedRole !== "admin" && !["buyer_agent", "treasury_agent", "dispute_agent"].includes(requestedRole)) {
      callerRole = "buyer_agent";
    }

    if (action === "SEARCH") {
      const searchResult = toolSearch(intentQuery, callerRole);
      return NextResponse.json({
        action: "SEARCH",
        callerRole,
        query: intentQuery,
        toolCount: searchResult.count,
        tools: searchResult.tools,
        metaTools: [
          COSMOS_TOOL_CATALOG.find((t) => t.name === "tool_search"),
          COSMOS_TOOL_CATALOG.find((t) => t.name === "execute_tool"),
        ],
      });
    }

    if (action === "EXECUTE") {
      if (!toolName) {
        return NextResponse.json({ error: "toolName is required for EXECUTE action" }, { status: 400 });
      }

      const execution = await executeTool(toolName, toolArgs, approvalDigest, callerRole);

      if (!execution.success) {
        return NextResponse.json(
          {
            error: execution.error,
            audit: execution.audit,
          },
          { status: 403 }
        );
      }

      return NextResponse.json({
        action: "EXECUTE",
        toolName,
        result: execution.result,
        audit: execution.audit,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    console.error("[agent] failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Agent request failed" }, { status: 500 });
  }
}

