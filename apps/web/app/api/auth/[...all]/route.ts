import { getAuth } from '@/server/auth';

export const dynamic = 'force-dynamic';

async function handle(req: Request) {
  const auth = await getAuth();
  return auth.handler(req);
}

export const GET = handle;
export const POST = handle;
