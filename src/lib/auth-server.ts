import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, readSessionToken, type SessionUser } from './auth';

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}
