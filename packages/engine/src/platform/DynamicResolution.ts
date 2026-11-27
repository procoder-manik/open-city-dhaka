/**
 * Lowers render resolution when frames are slow and raises it when there is headroom,
 * so every device holds its target FPS. Pure logic — the renderer applies `scale`.
 */
export class DynamicResolution {
  private avgMs: number;
  private cooldown = 0;
  scale: number;

  constructor(
    private targetFps: number,
    private min: number,
    private readonly max: number,
    private readonly stepSize = 0.05,
    /** Frames to wait between adjustments so changes don't oscillate. */
    private readonly settleFrames = 30,
  ) {
    this.scale = max;
    this.avgMs = 1000 / targetFps;
  }

  get minScale(): number {
    return this.min;
  }

  /** Allow a lower floor (weak-GPU fallback). */
  setMin(min: number) {
    this.min = Math.min(this.min, min);
    this.cooldown = 0;
  }

  get averageFrameMs(): number {
    return this.avgMs;
  }

  /** Feed the last frame's duration in ms. Returns true if `scale` changed. */
  sample(frameMs: number): boolean {
    this.avgMs = this.avgMs * 0.9 + Math.min(frameMs, 250) * 0.1;
    if (this.cooldown > 0) {
      this.cooldown--;
      return false;
    }
    const budget = 1000 / this.targetFps;
    let next = this.scale;
    if (this.avgMs > budget * 1.15) next = Math.max(this.min, this.scale - this.stepSize);
    else if (this.avgMs < budget * 0.8) next = Math.min(this.max, this.scale + this.stepSize);
    if (next === this.scale) return false;
    this.scale = Math.round(next * 100) / 100;
    this.cooldown = this.settleFrames;
    return true;
  }

  reset(targetFps: number, scale = this.max) {
    this.targetFps = targetFps;
    this.scale = Math.min(this.max, Math.max(this.min, scale));
    this.avgMs = 1000 / targetFps;
    this.cooldown = this.settleFrames;
  }
}
