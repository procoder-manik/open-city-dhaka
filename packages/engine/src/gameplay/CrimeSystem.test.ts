import { describe, expect, it } from 'vitest';
import {
  bribeCost,
  commitCrime,
  headlineFor,
  newCrimeState,
  payBribe,
  redeemGoodDeeds,
  stars,
  tickCrime,
  totalCrimes,
} from './CrimeSystem';

describe('CrimeSystem', () => {
  it('raises stars with crimes and caps at 5', () => {
    const s = newCrimeState();
    commitCrime(s, 'snatch');
    expect(stars(s)).toBe(1);
    for (let i = 0; i < 10; i++) commitCrime(s, 'snatch');
    expect(stars(s)).toBe(5);
    expect(totalCrimes(s)).toBe(11);
  });

  it('cools down one star after 30 s without crimes', () => {
    const s = newCrimeState();
    for (let k = 0; k < 4; k++) commitCrime(s, 'snatch'); // 4 × 0.5 = 2 stars
    expect(stars(s)).toBe(2);
    for (let t = 0; t < 31; t++) tickCrime(s, 1);
    expect(stars(s)).toBe(1);
  });

  it('bribe clears wanted only if you can pay', () => {
    const s = newCrimeState();
    for (let k = 0; k < 4; k++) commitCrime(s, 'snatch');
    expect(bribeCost(s)).toBe(200);
    expect(payBribe(s, 100)).toBe(0);
    expect(stars(s)).toBe(2);
    expect(payBribe(s, 1000)).toBe(200);
    expect(stars(s)).toBe(0);
  });

  it('good deeds wipe crimes off the record (3 points each)', () => {
    const s = newCrimeState();
    commitCrime(s, 'snatch');
    commitCrime(s, 'grab');
    expect(redeemGoodDeeds(s, 7)).toBe(6);
    expect(totalCrimes(s)).toBe(0);
  });

  it('has headlines with the hero placeholder', () => {
    expect(headlineFor('snatch', 0)).toContain('{hero}');
  });
});
