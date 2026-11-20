import type { Metadata } from 'next';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'লগইন' };
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const google = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <LoginForm googleEnabled={google} />;
}
