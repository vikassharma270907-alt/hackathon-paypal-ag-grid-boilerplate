import { NextRequest, NextResponse } from 'next/server';
import { MCP_TOOLS, SERVER_NAME, callReadOnlyTool, isForbiddenTool } from '@/lib/mcp-restock';

type JsonRpcId = string | number | null;

function ok(id: JsonRpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}

function fail(id: JsonRpcId, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Server descriptor: proves the surface is read-only. */
export async function GET() {
  return NextResponse.json({
    server: SERVER_NAME,
    protocol: 'MCP over Streamable HTTP (JSON-RPC 2.0)',
    readOnly: true,
    moneyMovingToolsExposed: 0,
    tools: MCP_TOOLS.map((t) => t.name),
  });
}

export async function POST(req: NextRequest) {
  let body: { id?: JsonRpcId; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
  try {
    body = await req.json();
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  const id = body.id ?? null;

  switch (body.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: '1.0.0' },
      });

    case 'tools/list':
      return ok(id, { tools: MCP_TOOLS });

    case 'tools/call': {
      const name = body.params?.name ?? '';
      if (isForbiddenTool(name)) {
        return fail(
          id,
          -32000,
          `SECURITY ERROR: tool '${name}' is not available. This MCP server is strictly read-and-propose only; money movement and approvals happen only in the owner UI.`
        );
      }
      if (!MCP_TOOLS.some((t) => t.name === name)) {
        return fail(id, -32601, `Unknown tool '${name}'`);
      }
      try {
        const result = callReadOnlyTool(name, body.params?.arguments);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (err) {
        return fail(id, -32602, err instanceof Error ? err.message : 'Invalid params');
      }
    }

    default:
      return fail(id, -32601, `Method not found: ${String(body.method)}`);
  }
}
