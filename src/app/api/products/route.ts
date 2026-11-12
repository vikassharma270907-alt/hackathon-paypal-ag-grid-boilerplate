import { NextResponse } from 'next/server';
import { getProducts, createProduct } from '@/lib/products-data';
import { denyUnlessAuthorized, rejectOversizedBody } from '@/lib/api-guard';
import { sanitizeProductInput } from '@/lib/entity-input';

export async function GET() {
  try {
    const products = getProducts();
    return NextResponse.json({ totalCount: products.length, products });
  } catch (error: unknown) {
    console.error('[products] list failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to list products' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const denied = denyUnlessAuthorized(req);
    if (denied) return denied;
    const tooLarge = rejectOversizedBody(req, 32_768);
    if (tooLarge) return tooLarge;

    const body = await req.json().catch(() => null);
    const clean = sanitizeProductInput(body);
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

    const newProduct = createProduct(clean.value);
    return NextResponse.json({ success: true, product: newProduct }, { status: 201 });
  } catch (error: unknown) {
    console.error('[products] create failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
