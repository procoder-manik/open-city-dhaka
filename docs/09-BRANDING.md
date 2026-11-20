# Branding & Renaming

Current working title: **MVP: Mostofa Vs Pulish** (tagline *"Dhaka's Most Wanted"*). The name **is not final** and can be changed at any time.

## How the name stays changeable
- The name lives in **one file only: `/brand.config.json`** (short name, full name, Bangla name, tagline, hero name, edition, slug, domain).
- Code imports it through `packages/shared/brand.ts`. Website title, meta/SEO tags, PWA manifest, loading screen, main menu, credits and in-game text all read from it.
- **Rule:** never hard-code the game name in code, UI text or dialogue. In dialogue/i18n files use the placeholder `{game}` or `{hero}`.
- Logo, icons and splash images live in `apps/web/public/brand/`, so swapping them is a file replacement.
- Database, URLs and package names use neutral ids (`game`, `@game/engine`), never the brand, so a rename needs no migration.

## Renaming checklist
1. Edit `brand.config.json`.
2. Replace files in `apps/web/public/brand/` (logo, favicon, PWA icons, OG image).
3. Rebuild & deploy. Manifest, titles and menus update automatically.
4. If the domain changes: add the new domain, 301-redirect the old one.
5. Update `README.md`, `PROGRESS.md` (decision log).

## Edition naming
`{shortName}: {edition}` → **MVP: Mohammadpur**, later **MVP: Dhaka**, **MVP: Cox's Bazar**.

## Name candidates kept for later
| Name | Meaning |
|---|---|
| MVP: Mostofa Vs Pulish (current) | Hero Mostofa vs the police; "MVP" also means Most Valuable Player |
| MWM: Most Wanted Mastan | Dhaka's most wanted gangster |
| MVP: Mastan Vs Pulish | Gangster vs police |
| Ferari: Dhaka's Most Wanted | "Ferari ashami" (absconder) + Ferrari car pun |
| Hulia | Bangla for a police "wanted" notice |

Avoid: "GTA", "Grand Theft …", "Grand … Auto", Rockstar logo font/style.
