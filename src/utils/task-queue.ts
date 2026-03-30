import { logger } from './logger.js';

/**
 * Simple in-memory task queue with concurrency limit.
 * Prevents unbounded parallel processing of fire-and-forget webhooks.
 */
export class TaskQueue {
  private running = 0;
  private queue: Array<() => Promise<void>> = [];
  private warnThreshold: number;

  constructor(private concurrency: number, warnThreshold = 50) {
    this.warnThreshold = warnThreshold;
  }

  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    if (this.queue.length > this.warnThreshold) {
      logger.warn({ pending: this.queue.length, active: this.running }, 'Task queue backlog growing');
    }
    this.drain();
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      task().finally(() => {
        this.running--;
        this.drain();
      });
    }
  }

  get pending(): number { return this.queue.length; }
  get active(): number { return this.running; }
}
