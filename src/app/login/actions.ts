'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

export async function credentialsSignIn(formData: FormData): Promise<void> {
  const callbackUrl = (formData.get('callbackUrl') as string | null) ?? '/';
  try {
    // Pass credentials explicitly so that redirectTo lands in options (2nd arg),
    // not authorizationParams (3rd arg). When formData is the 2nd arg, Auth.js
    // extracts redirectTo from inside it — but our field is named callbackUrl,
    // so it would fall back to the Referer header (the login page itself).
    await signIn('credentials', {
      username: formData.get('username') as string,
      password: formData.get('password') as string,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Auth.js v5 throws CredentialsSignin (and other AuthErrors) from signIn()
      // on invalid credentials — redirect to the login page with the error type
      // so the UI can show the error banner. The login page already handles
      // ?error=CredentialsSignin via searchParams.
      redirect(`/login?error=${error.type}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    // Re-throw anything else (including NEXT_REDIRECT from a successful signIn)
    // so Next.js can handle the navigation.
    throw error;
  }
}

export async function oidcSignIn(): Promise<void> {
  await signIn('oidc', { redirectTo: '/' });
}
