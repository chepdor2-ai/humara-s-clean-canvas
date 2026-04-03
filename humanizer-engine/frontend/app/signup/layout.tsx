import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up — Create Your Free Account',
  description: 'Create a free Humara account. Get 500 words to try the AI humanizer with no credit card required.',
  alternates: { canonical: 'https://humara.ai/signup' },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
