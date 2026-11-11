import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = evidenceStore.reconciliations.get(id);

    if (!result) {
      return NextResponse.json(
        { error: `Reconciliation result '${id}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retrieve reconciliation result" },
      { status: 500 }
    );
  }
}
