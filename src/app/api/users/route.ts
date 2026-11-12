import { NextResponse } from 'next/server';
import { getUsers, createUser } from '@/lib/users-data';
import { checkOperatorAccess, denyUnlessAuthorized, rejectOversizedBody } from '@/lib/api-guard';
import { sanitizeUserInput } from '@/lib/entity-input';

export async function GET() {
  try {
    const users = getUsers();
    return NextResponse.json({ totalCount: users.length, users });
  } catch (error: unknown) {
    console.error('[users] list failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const denied = denyUnlessAuthorized(req);
    if (denied) return denied;
    const tooLarge = rejectOversizedBody(req, 16_384);
    if (tooLarge) return tooLarge;

    const body = await req.json().catch(() => null);
    const clean = sanitizeUserInput(body, { allowAdminRole: checkOperatorAccess(req, { strict: true }).operator });
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

    const newUser = createUser(clean.value);
    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error: unknown) {
    console.error('[users] create failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
