import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up — Create Your Free Account',
  description: 'Create a free HumaraGPT account. Get 500 words to try the AI humanizer with no credit card required.',
  alternates: { canonical: 'https://www.humaragpt.com/signup' },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
