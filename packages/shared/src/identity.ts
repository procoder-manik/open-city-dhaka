/** Hero identity: default "গ্রেট থিফ মোস্তফা"; signed-in players may customise. */
export interface HeroIdentity {
  /** Title / nickname shown before the name (may be empty). */
  title: string;
  name: string;
}

export const DEFAULT_IDENTITY: HeroIdentity = { title: 'গ্রেট থিফ', name: 'মোস্তফা' };

/** Ready-made funny titles; players can also type their own. */
export const HERO_TITLES = [
  'গ্রেট থিফ',
  'রংবাজ',
  'গ্যাংস্টার',
  'মাস্তান',
  'টপ টেরর',
  'চোরের ওস্তাদ',
  'এলাকার ভাই',
  'ডন',
  'বস',
  'কিলার স্মাইল',
] as const;

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const TITLE_MAX = 18;

/** Blocked words/names (abuse, slurs, real public figures). Extend in moderation. */
const BLOCKED = [
  // abuse (Bangla/Banglish/English) — keep the list in one place, server uses it too
  'চুদ',
  'খানকি',
  'মাগি',
  'বাল',
  'শুয়োর',
  'কুত্তার বাচ্চা',
  'chod',
  'khanki',
  'magi',
  'fuck',
  'shit',
  'bitch',
  // real politicians / public figures (no impersonation)
  'হাসিনা',
  'খালেদা',
  'ইউনূস',
  'তারেক',
  'hasina',
  'khaleda',
  'yunus',
  'tarique',
];

export type NameCheck = { ok: true; value: string } | { ok: false; reason: string };

/** Zero-width space (U+200B) and BOM (U+FEFF), built from code points to keep the source plain ASCII. */
const ZERO_WIDTH = new RegExp(`[${String.fromCharCode(0x200b, 0xfeff)}]`, 'g');

function clean(s: string): string {
  return s
    .normalize('NFC')
    .replace(ZERO_WIDTH, '') // zero-width space / BOM tricks (keep ZWJ/ZWNJ: Bangla conjuncts need them)
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkHeroText(raw: string, kind: 'name' | 'title'): NameCheck {
  const v = clean(raw);
  const max = kind === 'name' ? NAME_MAX : TITLE_MAX;
  if (kind === 'name' && v.length < NAME_MIN) return { ok: false, reason: 'নাম কমপক্ষে ২ অক্ষর' };
  if (v.length > max) return { ok: false, reason: `সর্বোচ্চ ${max} অক্ষর` };
  if (/https?:|www\.|\.com|@/i.test(v)) return { ok: false, reason: 'লিংক বা ইমেইল দেওয়া যাবে না' };
  if (/[<>{}[\]\\]/.test(v)) return { ok: false, reason: 'এই চিহ্নগুলো ব্যবহার করা যাবে না' };
  const lower = v.toLowerCase();
  if (BLOCKED.some((w) => lower.includes(w)))
    return { ok: false, reason: 'এই নাম ব্যবহার করা যাবে না' };
  return { ok: true, value: v };
}

export function formatHero(id: HeroIdentity): string {
  return id.title ? `${id.title} ${id.name}` : id.name;
}

/** Replace {hero} (full: title + name) and {heroName} (name only) in text. */
export function fillHero(text: string, id: HeroIdentity): string {
  return text.replaceAll('{hero}', formatHero(id)).replaceAll('{heroName}', id.name);
}
