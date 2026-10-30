/**
 * Spreads chunk integration over frames. Streaming hands over several chunks
 * at once (three fetches resolve together), and building each one's meshes,
 * collision and graphs in the same frame stacked into long frames. Tasks run
 * in arrival order until the frame's budget is spent; at least one runs every
 * frame so the queue always drains.
 */
export class IntegrationQueue {
  private readonly tasks: Array<() => void> = [];
  private head = 0;
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  push(task: () => void): void {
    this.tasks.push(task);
  }

  get size(): number {
    return this.tasks.length - this.head;
  }

  /** Runs queued tasks for up to `budgetMs`. Returns how many ran. A throwing task is dropped and reported. */
  run(budgetMs: number, onError?: (err: unknown) => void): number {
    const until = this.now() + budgetMs;
    let ran = 0;
    while (this.head < this.tasks.length) {
      if (ran > 0 && this.now() >= until) break;
      const task = this.tasks[this.head];
      this.head++;
      ran++;
      try {
        task();
      } catch (err) {
        onError?.(err);
      }
    }
    if (this.head === this.tasks.length) {
      this.tasks.length = 0;
      this.head = 0;
    } else if (this.head > 256) {
      this.tasks.splice(0, this.head);
      this.head = 0;
    }
    return ran;
  }

  clear(): void {
    this.tasks.length = 0;
    this.head = 0;
  }
}
