export type BrowserAction =
  | { kind: 'click'; selector: string }
  | { kind: 'scroll'; x: number; y: number }
  | { kind: 'type'; selector: string; text: string }
  | { kind: 'navigate'; url: string }
  | { kind: 'extract'; selector?: string }
  | { kind: 'screenshot' };

export type BrowserActionRequest = {
  readonly profileId: string;
  readonly action: BrowserAction;
  readonly timeoutMs?: number;
};

export type BrowserActionResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export interface BrowserBridgeClient {
  execute(req: BrowserActionRequest, signal: AbortSignal): Promise<BrowserActionResult>;
  listProfiles(): Promise<ReadonlyArray<{ id: string; name: string; online: boolean }>>;
}
