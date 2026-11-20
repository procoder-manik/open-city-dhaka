# GTM: Great Thief Mostofa — "Bangladesh's Most Wanted"

Repo: [procoder-manik/open-city-dhaka](https://github.com/procoder-manik/open-city-dhaka)

*Working title. The name is set in [brand.config.json](brand.config.json) and can be changed anytime ([how](docs/09-BRANDING.md)).*

> **Continuing this project? Read [PROGRESS.md](PROGRESS.md) first, then [AGENTS.md](AGENTS.md).**

Browser-based open-world action-comedy set in Dhaka, starting with Mohammadpur. Plays on **mobile, tablet, laptop and desktop** (installable PWA, landscape "Game Lock" on phones). Inspired by the open-world crime genre; original characters, map, art and story.

## Planning docs
1. [PRD](docs/01-PRD.md): what we are building and why
2. [Architecture](docs/02-ARCHITECTURE.md): tech stack, repo layout, engine, backend, DB, security
3. [Roadmap](docs/03-ROADMAP.md): phases 0–9, done-criteria, decisions needed
4. [Game Design](docs/04-GAME-DESIGN.md): story, characters, missions, map, systems
5. [Research & Risks](docs/05-RESEARCH.md)
6. [Platforms & Mobile](docs/06-PLATFORMS-MOBILE.md): phone/tablet/desktop, Game Lock, touch controls, PWA
7. [Feature Checklist](docs/07-FEATURE-CHECKLIST.md): everything a full open-world game needs, by phase (living backlog)
8. [Extending](docs/08-EXTENDING.md): how to add or improve features, maps, missions later
9. [Branding](docs/09-BRANDING.md): name, renaming checklist, candidates

## Run it
```bash
pnpm install
pnpm dev        # open http://localhost:3000 → Play
```
Other commands: `pnpm build`, `pnpm start`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`, `pnpm budget`.

## Repo layout
- `apps/web`: Next.js site + game page (`/play`) + API
- `packages/engine`: the game engine (three.js + Rapier)
- `packages/shared`: brand config loader, shared schemas
- `packages/content`: game data (quality presets; later missions, vehicles, weapons)
- `tools/asset-pipeline`, `tools/map-builder`: build tools

Status: **Phase 0 (foundation) done. Next: Phase 1 "feel" vertical slice.** Details in [PROGRESS.md](PROGRESS.md).
