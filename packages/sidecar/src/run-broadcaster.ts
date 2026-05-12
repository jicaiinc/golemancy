import type { RunEvent } from '@golemancy/shared';

export type BroadcastListener = (event: RunEvent, sequence: number) => void;

export class RunBroadcaster {
  private readonly subs = new Set<BroadcastListener>();
  private terminal: { event: RunEvent; sequence: number } | null = null;
  public ended = false;

  subscribe(listener: BroadcastListener): () => void {
    if (this.ended && this.terminal) {
      listener(this.terminal.event, this.terminal.sequence);
      return () => undefined;
    }
    this.subs.add(listener);
    return () => this.subs.delete(listener);
  }

  emit(event: RunEvent, sequence: number): void {
    if (event.type === 'done' || event.type === 'error') {
      this.terminal = { event, sequence };
    }
    for (const sub of this.subs) {
      sub(event, sequence);
    }
  }

  close(): void {
    this.ended = true;
    this.subs.clear();
  }
}
