# 12 — Deploy & launch checklist

The site is one Next.js app (`apps/web`) + a free PostgreSQL database. Recommended free stack:
**Vercel** (hosting) + **Neon** (PostgreSQL). Any Node 20+ host works (Render, Railway, a VPS).

## 1. Database (Neon, free)

1. Create a project at https://neon.tech → copy the **pooled** connection string
   (`postgresql://…-pooler…/neondb?sslmode=require`).
2. That's it — tables are created automatically on first request (`server/db/index.ts`
   runs an idempotent bootstrap SQL). No migration step needed.
3. Paste it into `apps/web/.env.local` as `DATABASE_URL=…` and run `pnpm db:check` — it connects
   (without printing the string) and lists the tables. Then `pnpm dev`, sign up once at
   `/login`, and run `pnpm db:check` again: the tables (`user`, `profile`, `save_slot`, …) appear.

## 2. Environment variables

Copy `apps/web/.env.example` → `apps/web/.env.local` for local use; set the same in the
Vercel dashboard (Project → Settings → Environment Variables) for production.

| Variable                                    | Required          | What                                                                                                                  |
| ------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | **yes** (prod)    | Neon connection string. Without it, dev uses an embedded PGlite DB in `.data/`.                                       |
| `BETTER_AUTH_SECRET`                        | **yes** (prod)    | 32+ random chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`                          |
| `BETTER_AUTH_URL`                           | yes (prod)        | Public site URL, e.g. `https://gtm.example.com`                                                                       |
| `NEXT_PUBLIC_SITE_URL`                      | recommended       | Same URL (share cards, sitemap). Or set `siteUrl` in `site.config.json`.                                              |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional          | Enables "Google দিয়ে লগইন". Redirect URI: `https://<site>/api/auth/callback/google`                                    |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`  | optional, local   | Only for `pnpm voice:gen` (pre-generating NPC voices). Never needed on the server.                                    |

Never commit `.env.local` (it is git-ignored).

## 3. Vercel

1. Import the GitHub repo → **Root Directory: `apps/web`** → Framework: Next.js.
2. Install command: `pnpm install` (Vercel detects pnpm from the lockfile). Build: default.
   Add the env var `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the exact pnpm version pinned in
   the root `package.json` (`packageManager`).
3. Add the env vars above → Deploy.
4. Domain: Project → Domains → add yours (free `*.vercel.app` works too).

Headers (COOP/COEP credentialless, CSP, HSTS) are set in `apps/web/next.config.ts` — no
extra config needed.

## 4. Owner content (no code)

- `site.config.json`: `siteUrl`, `donateUrl` (bKash/Nagad page or link), `feedbackFormUrl`
  (Google Form), `facebookUrl`, `youtubeUrl`. `null` hides a button.
- `brand.config.json`: switch the active game name preset (`gtm`, `gtb`, …). After changing
  logos run `pnpm assets:icons` to regenerate PNG icons + the share image.
- Voices: put `AZURE_SPEECH_KEY`/`REGION` in `apps/web/.env.local`, run `pnpm voice:gen`,
  commit `apps/web/public/assets/voice/`. Without it, NPCs use the device's speech voice.

## 5. Pre-launch checks

```
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @game/web build
pnpm e2e            # Playwright smoke tests (starts its own server on :3100)
```

- Open `/`, `/play`, `/login`, `/leaderboard`, `/privacy`, `/terms`, `/credits`.
- Phone test: Android Chrome + iPhone Safari, landscape, "Add to Home Screen".
- Sign up → set hero name → play → reload → progress restored → delete account.

## 6. After launch

- Watch Vercel logs for `[auth]` / `[map]` / `[physics]` warnings.
- Neon free tier sleeps when idle; the first request after a nap takes ~1 s.
- Leaderboards read client saves (clamped server-side) — treat them as "for fun". For
  competitive boards, move scoring server-side first (see `08-EXTENDING.md`).
