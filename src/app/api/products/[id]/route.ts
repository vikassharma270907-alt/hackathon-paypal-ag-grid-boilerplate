import { NextResponse } from 'next/server';
import { getProductById, updateProduct, deleteProduct } from '@/lib/products-data';
import { denyUnlessAuthorized, rejectOversizedBody } from '@/lib/api-guard';
import { sanitizeProductInput } from '@/lib/entity-input';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const product = getProductById(params.id);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error: unknown) {
    console.error('[products] fetch failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const denied = denyUnlessAuthorized(req);
    if (denied) return denied;
    const tooLarge = rejectOversizedBody(req, 32_768);
    if (tooLarge) return tooLarge;

    const params = await props.params;
    const body = await req.json().catch(() => null);
    const clean = sanitizeProductInput(body);
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

    const updated = updateProduct(params.id, clean.value);
    if (!updated) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, product: updated });
  } catch (error: unknown) {
    console.error('[products] update failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const denied = denyUnlessAuthorized(req, { strict: true });
    if (denied) return denied;
    const params = await props.params;
    const ok = deleteProduct(params.id);
    if (!ok) {
      return NextResponse.json({ error: 'Product not found or already deleted' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: `Product ${params.id} deleted` });
  } catch (error: unknown) {
    console.error('[products] delete failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
