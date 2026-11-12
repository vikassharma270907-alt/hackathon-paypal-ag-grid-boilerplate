import type { Metadata } from 'next';
import { AuthCard } from '@/app/components/auth-card';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return <AuthCard mode="login" error={error} next={next} />;
}
