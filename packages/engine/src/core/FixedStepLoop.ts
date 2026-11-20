/**
 * Fixed-timestep accumulator. Simulation always advances in equal `step` slices
 * (deterministic physics/AI), rendering runs at whatever rate the device allows.
 */
export class FixedStepLoop {
  private accumulator = 0;

  constructor(
    readonly step = 1 / 60,
    /** Max sim steps per frame — prevents the "spiral of death" on slow devices. */
    readonly maxSteps = 5,
  ) {}

  /**
   * Feed real elapsed seconds. Returns how many fixed steps to simulate now and the
   * interpolation alpha (0..1) between the last two sim states for rendering.
   */
  advance(elapsedSeconds: number): { steps: number; alpha: number } {
    const dt = Math.min(Math.max(elapsedSeconds, 0), this.step * this.maxSteps);
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSteps) {
      this.accumulator -= this.step;
      steps++;
    }
    if (steps === this.maxSteps) this.accumulator = Math.min(this.accumulator, this.step);
    return { steps, alpha: this.accumulator / this.step };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
