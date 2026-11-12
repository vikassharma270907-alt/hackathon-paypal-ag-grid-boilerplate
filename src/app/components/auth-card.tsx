import Link from 'next/link';
import { PlayCircle } from 'lucide-react';

const ERRORS: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured yet. Use guest demo mode.',
  google_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Sign-in session expired. Please try again.',
  token_exchange_failed: 'Google sign-in failed. Please try again.',
  userinfo_failed: 'Could not read your Google profile. Please try again.',
  email_unverified: 'Your Google email is not verified.',
  google_error: 'Something went wrong with Google sign-in.',
};

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function AuthCard({
  mode,
  error,
  next,
}: {
  mode: 'login' | 'signup';
  error?: string;
  next?: string;
}) {
  const isSignup = mode === 'signup';
  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  const title = isSignup ? 'Create your account' : 'Welcome back';
  const googleLabel = isSignup ? 'Sign up with Google' : 'Sign in with Google';

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-[#121215] p-6 space-y-5 shadow-xl shadow-black/40">
        <div className="space-y-1 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="size-8 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-950 border border-zinc-700/80 flex items-center justify-center text-white font-black text-xs">
              VS
            </span>
            <span className="font-bold text-sm">VeriSettle OS</span>
          </Link>
          <h1 className="text-lg font-semibold pt-2">{title}</h1>
          <p className="text-xs text-zinc-400">
            {isSignup ? 'Sign up to use the proof-gated settlement workspace.' : 'Sign in to continue to your workspace.'}
          </p>
        </div>

        {error && ERRORS[error] ? (
          <p role="alert" className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {ERRORS[error]}
          </p>
        ) : null}

        <div className="space-y-3">
          <a
            href={`/api/auth/google${q}`}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
          >
            <GoogleLogo />
            {googleLabel}
          </a>

          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800" />
            or
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          <a
            href={`/api/auth/guest${q}`}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <PlayCircle className="size-4" aria-hidden="true" />
            Continue as Guest (Demo)
          </a>
          <p className="text-center text-[11px] text-zinc-500">
            Guest mode needs no account. Sandbox data only; the session expires after 2 hours.
          </p>
        </div>

        <p className="text-center text-xs text-zinc-400">
          {isSignup ? (
            <>Already have an account? <Link href="/login" className="text-white underline">Log in</Link></>
          ) : (
            <>New here? <Link href="/signup" className="text-white underline">Sign up</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
