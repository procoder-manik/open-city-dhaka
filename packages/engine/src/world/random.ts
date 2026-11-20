/** Deterministic PRNG so the same street is generated every time. */
export function seededRandom(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
