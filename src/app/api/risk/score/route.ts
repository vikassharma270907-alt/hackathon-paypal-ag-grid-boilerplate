import { NextRequest, NextResponse } from "next/server";
import { evaluateAdvancedMLRisk } from "@/lib/ml-intelligence";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = evaluateAdvancedMLRisk({
      transactionId: body.transactionId || "TX-PROPOSAL-001",
      amount: Number(body.amount || 2450.0),
      unitPrice: Number(body.unitPrice || 245.0),
      quantity: Number(body.quantity || 10),
      category: body.category || "Cloud Hardware",
      isNewSupplier: Boolean(body.isNewSupplier),
      carrierDelivered: body.carrierDelivered !== false,
      channel3MeanPrice: Number(body.channel3MeanPrice || 242.0),
      channel3StdPrice: Number(body.channel3StdPrice || 12.0),
      historicalSupplierOrderCount: Number(body.historicalSupplierOrderCount || 10),
      historicalDisputeRate: Number(body.historicalDisputeRate || 0.0),
      reconciliationDiscrepancy: Boolean(body.reconciliationDiscrepancy),
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to score transaction risk" },
      { status: 500 }
    );
  }
}
