// End-to-end account check against the running site (default http://localhost:3000):
// sign up → hero name → cloud save → load → leaderboard → change password → sign in → delete.
// Creates a throw-away test account and deletes it at the end.
// Usage: node scripts/db-roundtrip.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://localhost:3000';
const email = `roundtrip-${Date.now()}@example.test`;
const pass1 = `Test-${Math.random().toString(36).slice(2)}-A1!`;
const pass2 = `Test-${Math.random().toString(36).slice(2)}-B2!`;
let cookie = '';
let failed = false;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: BASE,
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [kv] = c.split(';');
    const [k] = kv.split('=');
    const rest = cookie
      .split('; ')
      .filter((x) => x && !x.startsWith(`${k}=`))
      .join('; ');
    cookie = [rest, kv].filter(Boolean).join('; ');
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    // empty
  }
  return { status: res.status, json };
}
const ok = (cond, label, extra = '') => {
  console.info(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failed = true;
};

const t0 = Date.now();
let r = await call('GET', '/api/health');
ok(r.status === 200, 'health', JSON.stringify(r.json));

r = await call('POST', '/api/auth/sign-up/email', { email, password: pass1, name: 'Roundtrip' });
ok(r.status === 200 && !!cookie, 'sign up', `status ${r.status}`);

r = await call('PUT', '/api/profile', { title: 'রংবাজ', name: 'টেস্টু' });
ok(r.status === 200, 'set hero name', `status ${r.status}`);
r = await call('GET', '/api/profile');
ok(r.json?.name === 'টেস্টু', 'read hero name back', JSON.stringify(r.json));

const data = {
  taka: 4321,
  notoriety: 12,
  publicLove: 3,
  hour: 14.5,
  crime: { heat: 1, record: { snatch: 2 } },
  missions: ['a1-tea-debt'],
};
r = await call('PUT', '/api/save?slot=1', { data });
ok(r.status === 200, 'cloud save', `status ${r.status}`);
r = await call('GET', '/api/save?slot=1');
ok(r.json?.data?.taka === 4321, 'load save back', `taka ${r.json?.data?.taka}`);

r = await call('GET', '/api/leaderboard?board=taka');
const rows = r.json?.rows ?? r.json?.top ?? r.json;
ok(
  r.status === 200 && JSON.stringify(rows).includes('টেস্টু'),
  'leaderboard shows the hero (no email)',
  JSON.stringify(rows).includes('@') ? 'EMAIL LEAKED' : 'no emails',
);

r = await call('POST', '/api/auth/change-password', {
  currentPassword: pass1,
  newPassword: pass2,
  revokeOtherSessions: false,
});
ok(r.status === 200, 'change password', `status ${r.status}`);

cookie = '';
r = await call('POST', '/api/auth/sign-in/email', { email, password: pass2 });
ok(r.status === 200 && !!cookie, 'sign in with the new password', `status ${r.status}`);

r = await call('POST', '/api/auth/delete-user', { password: pass2 });
ok(r.status === 200, 'delete account (cleanup)', `status ${r.status}`);
cookie = '';
r = await call('POST', '/api/auth/sign-in/email', { email, password: pass2 });
ok(r.status !== 200, 'deleted account can no longer sign in', `status ${r.status}`);

console.info(`${failed ? 'FAILED' : 'ALL OK'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
