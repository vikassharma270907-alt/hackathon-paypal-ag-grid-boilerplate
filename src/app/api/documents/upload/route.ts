import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { evidenceStore } from "@/lib/evidence-store";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData().catch(async () => null);
    let fileName = "invoice.pdf";
    let fileSizeBytes = 1024;
    let fileHash = "";

    if (formData) {
      const file = formData.get("file") as File | null;
      if (file) {
        fileName = file.name;
        fileSizeBytes = file.size;
        const arrayBuf = await file.arrayBuffer();
        fileHash = crypto.createHash("sha256").update(Buffer.from(arrayBuf)).digest("hex");
      }
    }

    if (!fileHash) {
      fileHash = crypto.createHash("sha256").update(`sample-doc-${Date.now()}`).digest("hex");
    }

    const documentId = `DOC-${Date.now().toString(36).toUpperCase()}`;

    evidenceStore.recordAudit(
      "DOCUMENT_INGESTION",
      "UPLOAD_DOCUMENT",
      "CommercialDocument",
      documentId,
      fileHash,
      { fileName, fileSizeBytes, mimeType: "application/pdf" }
    );

    return NextResponse.json({
      documentId,
      fileName,
      fileSizeBytes,
      fileHash,
      status: "INGESTED_READY_FOR_EXTRACTION",
      uploadedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Document upload failed" },
      { status: 500 }
    );
  }
}
