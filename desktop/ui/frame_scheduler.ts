/** Cooperative, bounded acquisition for visible device panels. */
export class FrameScheduler {
  private active: string | null = null;
  private waiting: string[] = [];

  acquire(id: string): boolean {
    if (this.active === id) return false;
    if (!this.waiting.includes(id)) this.waiting.push(id);
    if (this.active !== null || this.waiting[0] !== id) return false;
    this.waiting.shift();
    this.active = id;
    return true;
  }

  release(id: string): void {
    if (this.active === id) this.active = null;
  }

  cancel(id: string): void {
    this.waiting = this.waiting.filter(waiter => waiter !== id);
    // An in-flight request must release its own slot, even after its panel closes.
  }
}

/** Actual successful presentation cadence, not an advertised target FPS. */
export class FrameMetrics {
  private samples: { at: number; latency: number; bytes: number }[] = [];

  record(at: number, latency: number, bytes: number): void {
    this.samples.push({ at, latency, bytes });
    this.samples = this.samples.filter(sample => at - sample.at <= 5000).slice(-120);
  }

  reset(): void { this.samples = []; }

  snapshot(): { fps: number | null; averageMs: number; averageBytes: number } {
    const count = this.samples.length;
    if (!count) return { fps: null, averageMs: 0, averageBytes: 0 };
    const elapsed = this.samples[count - 1].at - this.samples[0].at;
    return {
      fps: count > 1 && elapsed > 0 ? (count - 1) * 1000 / elapsed : null,
      averageMs: this.samples.reduce((sum, sample) => sum + sample.latency, 0) / count,
      averageBytes: this.samples.reduce((sum, sample) => sum + sample.bytes, 0) / count,
    };
  }
}
