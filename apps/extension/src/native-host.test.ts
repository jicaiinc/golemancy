import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectNativeHost } from './native-host.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extension native host connection', () => {
  it('wraps Chrome Native Messaging with send, message, and disconnect handlers', () => {
    const messages: Array<(message: unknown) => void> = [];
    const disconnects: Array<() => void> = [];
    const port = {
      onMessage: {
        addListener: (listener: (message: unknown) => void) => messages.push(listener),
      },
      onDisconnect: {
        addListener: (listener: () => void) => disconnects.push(listener),
      },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    };
    const connectNative = vi.fn(() => port);
    vi.stubGlobal('chrome', {
      runtime: {
        connectNative,
        lastError: undefined,
      },
    });

    const onMessage = vi.fn();
    const onDisconnect = vi.fn();
    const connection = connectNativeHost({
      hostName: 'com.golemancy.bridge',
      onMessage,
      onDisconnect,
    });

    expect(connectNative).toHaveBeenCalledWith('com.golemancy.bridge');
    messages[0]!({ ok: true });
    expect(onMessage).toHaveBeenCalledWith({ ok: true });

    connection.send({ ping: true });
    expect(port.postMessage).toHaveBeenCalledWith({ ping: true });

    disconnects[0]!();
    expect(onDisconnect).toHaveBeenCalledWith(undefined);

    connection.disconnect();
    expect(port.disconnect).toHaveBeenCalled();
  });
});
