import { describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY, checkHeroText, fillHero, formatHero } from './identity';

describe('hero identity', () => {
  it('defaults to গ্রেট থিফ মোস্তফা', () => {
    expect(formatHero(DEFAULT_IDENTITY)).toBe('গ্রেট থিফ মোস্তফা');
  });

  it('accepts funny Bangla names and titles', () => {
    expect(checkHeroText('রংবাজ', 'title')).toEqual({ ok: true, value: 'রংবাজ' });
    expect(checkHeroText('  কালু   মিয়া ', 'name')).toEqual({ ok: true, value: 'কালু মিয়া' });
  });

  it('rejects too short/long, links, abuse and real public figures', () => {
    expect(checkHeroText('ক', 'name').ok).toBe(false);
    expect(checkHeroText('ক'.repeat(30), 'name').ok).toBe(false);
    expect(checkHeroText('visit www.x.com', 'name').ok).toBe(false);
    expect(checkHeroText('Fuck', 'title').ok).toBe(false);
    expect(checkHeroText('হাসিনা', 'name').ok).toBe(false);
  });

  it('fills {hero} and {heroName} placeholders', () => {
    const id = { title: 'রংবাজ', name: 'উমুক' };
    expect(fillHero('এইটা তো {hero}! {heroName} ভাই!', id)).toBe('এইটা তো রংবাজ উমুক! উমুক ভাই!');
  });
});
