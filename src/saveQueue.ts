// At most one queued snapshot per record, even when writes lag behind drawing.
// A running write owns its snapshot; a newer edit to that key runs afterwards.
export class SaveQueue {
  private work = new Map<string, () => Promise<void>>();
  private running?: Promise<void>;
  constructor(private onError: (error: unknown) => void) {}
  enqueue(key: string, write: () => Promise<void>): Promise<void> {
    this.work.set(key, write);
    if (!this.running) {
      this.running = Promise.resolve().then(async () => {
        try {
          while (this.work.size) {
            const [key, task] = this.work.entries().next().value!;
            this.work.delete(key);
            try {
              await task();
            } catch (error) {
              this.onError(error);
            }
          }
        } finally {
          this.running = undefined;
        }
      });
    }
    return this.running;
  }
}
