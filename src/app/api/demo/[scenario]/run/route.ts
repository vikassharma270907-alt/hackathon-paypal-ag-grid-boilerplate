import { NextRequest, NextResponse } from "next/server";
import { executeJudgeDemoScenario } from "@/lib/demo-engine";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ scenario: string }> }
) {
  try {
    const { scenario } = await context.params;
    const normalizedScenario = scenario.toUpperCase() as "CLEAN" | "TAMPERED" | "PARTIAL";

    if (!["CLEAN", "TAMPERED", "PARTIAL"].includes(normalizedScenario)) {
      return NextResponse.json(
        { error: `Invalid scenario '${scenario}'. Must be 'CLEAN', 'TAMPERED', or 'PARTIAL'.` },
        { status: 400 }
      );
    }

    const result = await executeJudgeDemoScenario(normalizedScenario);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute scenario" },
      { status: 500 }
    );
  }
}
