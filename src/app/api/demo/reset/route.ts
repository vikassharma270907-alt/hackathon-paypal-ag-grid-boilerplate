import { NextResponse } from "next/server";
import { resetDemoState } from "@/lib/demo-engine";

export async function POST() {
  try {
    const result = resetDemoState();
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset demo state" },
      { status: 500 }
    );
  }
}
