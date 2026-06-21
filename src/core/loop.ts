// Fixed-timestep game loop with time-dilation support.
//
// The sim always steps at a fixed dt for determinism (physics, replays, Daily).
// `timeScale` (driven by slow-mo / the snap / Overcharge) stretches how much
// wall-clock time maps to sim time, WITHOUT changing the integration dt — so a
// perfect release reads as bullet-time but the orbit math stays exact.

export type StepFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private readonly dt = 1 / 120;     // sim step (seconds)
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  /** 1 = real time, <1 = slow-mo. Eased toward `targetScale` each frame. */
  timeScale = 1;
  targetScale = 1;
  private scaleEase = 8; // higher = snappier return to target

  constructor(private step: StepFn, private render: RenderFn) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      let wall = (now - this.last) / 1000;
      this.last = now;
      if (wall > 0.25) wall = 0.25; // clamp tab-switch spikes

      // ease the time scale toward its target
      const k = 1 - Math.exp(-this.scaleEase * wall);
      this.timeScale += (this.targetScale - this.timeScale) * k;

      this.acc += wall * this.timeScale;
      let steps = 0;
      while (this.acc >= this.dt && steps < 8) {
        this.step(this.dt);
        this.acc -= this.dt;
        steps++;
      }
      this.render(this.acc / this.dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Punch into slow-mo, then drift back to normal. */
  slowmo(scale: number): void {
    this.timeScale = scale;
    this.targetScale = 1;
  }
}
