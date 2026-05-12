import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

export type SidecarStatus =
  | { status: 'starting' }
  | { status: 'ready'; url: string; token: string; pid: number }
  | { status: 'restarting'; attempt: number; reason: string }
  | { status: 'failed'; reason: string }
  | { status: 'stopped' };

const SIDECAR_EVENT = 'sidecar_state';

export async function fetchSidecarStatus(): Promise<SidecarStatus> {
  return invoke<SidecarStatus>('sidecar_runtime');
}

export function useSidecarStatus(): SidecarStatus {
  const [status, setStatus] = useState<SidecarStatus>({ status: 'starting' });

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const initial = await fetchSidecarStatus();
        if (!cancelled) setStatus(initial);
      } catch {
        // ignore — event listener will update
      }
      unlisten = await listen<SidecarStatus>(SIDECAR_EVENT, (event) => {
        setStatus(event.payload);
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return status;
}
