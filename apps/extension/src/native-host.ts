export type NativeHostConnection = {
  send(message: unknown): void;
  disconnect(): void;
};

export type NativeHostOptions = {
  hostName: string;
  onMessage(message: unknown): void;
  onDisconnect(error: chrome.runtime.LastError | undefined): void;
};

export function connectNativeHost({
  hostName,
  onMessage,
  onDisconnect,
}: NativeHostOptions): NativeHostConnection {
  const port = chrome.runtime.connectNative(hostName);
  port.onMessage.addListener((msg) => {
    try {
      onMessage(msg);
    } catch (err) {
      console.error('[golemancy] native message handler threw', err);
    }
  });
  port.onDisconnect.addListener(() => {
    onDisconnect(chrome.runtime.lastError);
  });

  return {
    send(message) {
      try {
        port.postMessage(message);
      } catch (err) {
        console.error('[golemancy] native postMessage failed', err);
      }
    },
    disconnect() {
      port.disconnect();
    },
  };
}
