import { NextResponse } from 'next/server';
import { getUserById, updateUser, deleteUser } from '@/lib/users-data';
import { checkOperatorAccess, denyUnlessAuthorized, rejectOversizedBody } from '@/lib/api-guard';
import { sanitizeUserInput } from '@/lib/entity-input';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const user = getUserById(params.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (error: unknown) {
    console.error('[users] fetch failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const denied = denyUnlessAuthorized(req);
    if (denied) return denied;
    const tooLarge = rejectOversizedBody(req, 16_384);
    if (tooLarge) return tooLarge;

    const params = await props.params;
    const body = await req.json().catch(() => null);
    const clean = sanitizeUserInput(body, { allowAdminRole: checkOperatorAccess(req, { strict: true }).operator });
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

    const updated = updateUser(params.id, clean.value);
    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, user: updated });
  } catch (error: unknown) {
    console.error('[users] update failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const denied = denyUnlessAuthorized(req, { strict: true });
    if (denied) return denied;
    const params = await props.params;
    const ok = deleteUser(params.id);
    if (!ok) {
      return NextResponse.json({ error: 'User not found or already deleted' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: `User ${params.id} deleted` });
  } catch (error: unknown) {
    console.error('[users] delete failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
