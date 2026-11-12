import type { Metadata } from 'next';
import { AuthCard } from '@/app/components/auth-card';

export const metadata: Metadata = { title: 'Sign up' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return <AuthCard mode="signup" error={error} next={next} />;
}
