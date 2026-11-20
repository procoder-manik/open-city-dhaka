import type { Metadata } from 'next';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'আমার অ্যাকাউন্ট' };
export const dynamic = 'force-dynamic';

export default function AccountPage() {
  const google = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <LoginForm googleEnabled={google} />;
}
