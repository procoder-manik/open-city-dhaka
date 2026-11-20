/** Crime record, Wanted level (0–5), bribes and good-deed redemption. Pure logic. */
export type CrimeKind = 'snatch' | 'grab' | 'threaten' | 'vehicleTheft' | 'crash';

const STAR_WEIGHT: Record<CrimeKind, number> = {
  snatch: 1,
  grab: 0.5,
  threaten: 0.3,
  vehicleTheft: 0.5,
  crash: 0.2,
};

/** Seconds without new crimes before one star cools off. */
const COOL_DOWN = 90;
export const MAX_STARS = 5;
export const BRIBE_PER_STAR = 300;
export const GOOD_POINTS_PER_CRIME = 3;

export interface CrimeState {
  /** Fractional wanted level 0..5 (HUD shows Math.ceil when > 0.05). */
  heat: number;
  record: Record<CrimeKind, number>;
  calm: number;
}

export function newCrimeState(): CrimeState {
  return {
    heat: 0,
    record: { snatch: 0, grab: 0, threaten: 0, vehicleTheft: 0, crash: 0 },
    calm: 0,
  };
}

export function stars(s: CrimeState): number {
  return s.heat < 0.05 ? 0 : Math.min(MAX_STARS, Math.ceil(s.heat - 0.001));
}

export function totalCrimes(s: CrimeState): number {
  return Object.values(s.record).reduce((a, b) => a + b, 0);
}

export function commitCrime(s: CrimeState, kind: CrimeKind): void {
  s.record[kind] += 1;
  s.heat = Math.min(MAX_STARS, s.heat + STAR_WEIGHT[kind]);
  s.calm = 0;
}

export function tickCrime(s: CrimeState, dt: number): void {
  if (s.heat <= 0) return;
  s.calm += dt;
  if (s.calm >= COOL_DOWN) {
    s.heat = Math.max(0, s.heat - 1);
    s.calm = 0;
  }
}

export function bribeCost(s: CrimeState): number {
  return stars(s) * BRIBE_PER_STAR;
}

/** Pay the OC: clears the wanted level if `money` covers it. Returns the money spent (0 = refused). */
export function payBribe(s: CrimeState, money: number): number {
  const cost = bribeCost(s);
  if (cost <= 0 || money < cost) return 0;
  s.heat = 0;
  s.calm = 0;
  return cost;
}

/** Spend good-deed points to remove crimes from the record. Returns points spent. */
export function redeemGoodDeeds(s: CrimeState, points: number): number {
  let spent = 0;
  const order: CrimeKind[] = ['snatch', 'vehicleTheft', 'grab', 'threaten', 'crash'];
  while (points - spent >= GOOD_POINTS_PER_CRIME) {
    const k = order.find((c) => s.record[c] > 0);
    if (!k) break;
    s.record[k] -= 1;
    spent += GOOD_POINTS_PER_CRIME;
  }
  return spent;
}

const HEADLINES: Partial<Record<CrimeKind, string[]>> = {
  snatch: [
    'ব্রেকিং: মোহাম্মদপুরে {hero}-এর ছিনতাই! পুলিশ খুঁজছে',
    'আবারও {hero}! দিনে-দুপুরে মানিব্যাগ উধাও',
    'এলাকাবাসী আতঙ্কে: "{heroName} আসলে পকেট সামলান"',
  ],
  vehicleTheft: [
    'তাজমহল রোডে গাড়ি চুরি, সন্দেহের তীর {hero}-এর দিকে',
    'মালিক বলছেন: "চাবি ছাড়াই গাড়ি নিয়ে গেল {heroName}!"',
  ],
  grab: [
    'চায়ের দোকানে বিল না দিয়ে উধাও {hero}',
    'হালিম খেয়ে টাকা না দেওয়ার অভিযোগ {heroName}-এর বিরুদ্ধে',
  ],
  threaten: ['{hero}-এর হুমকিতে দোকান বন্ধ', 'রিকশাওয়ালাকে হুমকি, ভাইরাল ভিডিওতে {heroName}'],
  crash: ['বেপরোয়া ড্রাইভিং: দেয়ালের সাথে গাড়ির "প্রেম", চালক {hero}'],
};

export function headlineFor(kind: CrimeKind, pick: number): string | null {
  const list = HEADLINES[kind];
  if (!list?.length) return null;
  return list[Math.floor(pick * list.length) % list.length]!;
}
