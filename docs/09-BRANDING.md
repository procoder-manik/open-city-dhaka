# Branding & Renaming

Current working title: **GTM: Great Thief Mostofa** (tagline *"Bangladesh's Most Wanted"*). The name **is not final** and can be changed at any time.

## How the name stays changeable
- The name lives in **one file only: `/brand.config.json`**. It holds several ready **name presets** (`gtm`, `mvp`, `gtb`, `mwm`…) and one `"active"` key.
- **To switch the whole game to another name, change one line:** `"active": "gtm"` → `"active": "gtb"` → the game becomes **GTB: Gaye Tel Beshi** everywhere (site, menus, loading screen, PWA icon name, edition "GTB: Mohammadpur").
- To add a brand-new name: copy a preset block, give it a new key, fill it in, set `"active"` to it.
- Code imports it through `packages/shared/brand.ts`. Website title, meta/SEO tags, PWA manifest, loading screen, main menu, credits and in-game text all read from it.
- **Rule:** never hard-code the game name in code, UI text or dialogue. In dialogue/i18n files use the placeholder `{game}` or `{hero}`.
- Logo, icons and splash images live in `apps/web/public/brand/`, so swapping them is a file replacement.
- Database, URLs and package names use neutral ids (`game`, `@game/engine`), never the brand, so a rename needs no migration.

## Renaming checklist
1. In `brand.config.json` set `"active"` to the preset you want (or add a new preset).
2. Put that preset's logo, favicon, PWA icons and OG image in `apps/web/public/brand/<preset>/` (each name keeps its own logo folder, so switching back is instant).
3. Rebuild & deploy. Manifest, titles and menus update automatically.
4. If the domain changes: add the new domain, 301-redirect the old one.
5. Update `README.md`, `PROGRESS.md` (decision log).

## Edition naming
`{shortName}: {edition}` → **GTM: Mohammadpur**, later **GTM: Dhaka**, **GTM: Cox's Bazar**.

## Name candidates kept for later
| Name | Meaning |
|---|---|
| GTM: Great Thief Mostofa (**active**, preset `gtm`) | Named after the hero, so it works for all of Bangladesh; sounds like the genre without copying it ("Thief", not "Theft") |
| MVP: Mostofa Vs Pulish (**ready**, preset `mvp`) | Hero Mostofa vs the police; "MVP" also means Most Valuable Player |
| GTB: Gaye Tel Beshi (**ready**, preset `gtb`) | "Too much oil on the body": someone itching for trouble. Closest in sound to GTA |
| MWM: Most Wanted Mastan (preset `mwm`) | Dhaka's most wanted gangster |
| MVP: Mastan Vs Pulish | Gangster vs police |
| Ferari: Dhaka's Most Wanted | "Ferari ashami" (absconder) + Ferrari car pun |
| Hulia | Bangla for a police "wanted" notice |

Avoid: "GTA", "Grand Thief …" (too close), "Grand Theft …", "Grand … Auto", Rockstar logo font/style.

## Website links (donate, feedback, socials)
`/site.config.json` → `donateUrl`, `donateNote`, `feedbackFormUrl` (Google Form), `facebookUrl`, `youtubeUrl`. HTTPS only; `null` hides the button. Shown on the landing page and in the pause menu.
