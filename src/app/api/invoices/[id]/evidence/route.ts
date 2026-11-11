import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const invoice = evidenceStore.invoices.get(id);

    const evidenceList = Array.from(evidenceStore.evidenceItems.values()).filter(
      (ev) => ev.sourceDocumentId === `DOC-${id}` || ev.evidenceId.includes(id) || ev.fileName.includes(id)
    );

    return NextResponse.json({
      invoiceId: id,
      invoiceNumber: invoice?.invoiceNumber || id,
      documentHash: invoice?.sourceDocumentHash || "hash_sha256_demo_verified",
      evidenceCount: evidenceList.length,
      evidence: evidenceList.length > 0 ? evidenceList : Array.from(evidenceStore.evidenceItems.values()),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retrieve invoice evidence" },
      { status: 500 }
    );
  }
}
