# Instructions for AI agents & developers

This project may be worked on by different AIs (Claude, Codex, Gemini, Cursor…) and humans across many sessions. Follow these rules so nobody loses track.

## Start of every session
1. `git pull` to get the latest `main`.
2. Read **`PROGRESS.md`** (where work stopped, next step, open questions).
3. Read the docs relevant to the next step:
   - `docs/03-ROADMAP.md`: phase tasks & done-criteria
   - `docs/02-ARCHITECTURE.md`: stack, folders, rules
   - `docs/06-PLATFORMS-MOBILE.md`: every feature must work on phone, tablet & desktop
   - `docs/08-EXTENDING.md`: how features/content are structured
   - `docs/04-GAME-DESIGN.md`, `docs/01-PRD.md`: what to build
4. Continue from **"▶ NEXT STEP"** in `PROGRESS.md`. Do not restart or rewrite finished work without a reason written in the Decisions log.

## While working
- Work in small steps; keep the build green (`pnpm typecheck && pnpm lint && pnpm test`).
- Every gameplay feature needs: keyboard/mouse + touch + gamepad input, and a setting in quality presets if it costs performance.
- Content (missions, vehicles, weapons, dialogue, presets) goes in `packages/content` as data, not hard-coded.
- No real living people, real political parties, or copied GTA assets/names/logos (PRD §9).
- Never commit secrets. Use `.env.local` (git-ignored) and update `.env.example`.

## End of every session (or when your limit/context is running out) — mandatory
1. Update **`PROGRESS.md`**:
   - Status snapshot (date, who, phase, %)
   - Tick finished tasks; write the exact **▶ NEXT STEP** (file + function + what's left)
   - Add new decisions, known issues, and a Session log row
2. If you changed plans/features, update the matching doc in `docs/`.
3. Commit with a clear message (e.g. `feat(engine): touch joystick` / `docs: update progress`) and `git push` to GitHub.

## Commit style
`type(scope): summary` with type ∈ feat, fix, perf, refactor, docs, test, chore, content.
