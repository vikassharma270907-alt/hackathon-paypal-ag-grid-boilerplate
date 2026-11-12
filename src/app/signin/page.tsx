import { redirect } from 'next/navigation';

export default async function SignInRedirect({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const q = new URLSearchParams();
  if (error) q.set('error', error);
  if (next) q.set('next', next);
  const qs = q.toString();
  redirect(`/login${qs ? `?${qs}` : ''}`);
}
