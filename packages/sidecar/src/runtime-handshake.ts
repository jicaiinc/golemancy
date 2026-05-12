import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NativeHostRuntime } from '@golemancy/protocol';

export type HandshakeWriteOptions = {
  readonly path: string;
  readonly runtime: NativeHostRuntime;
};

export async function writeNativeHostRuntime({
  path,
  runtime,
}: HandshakeWriteOptions): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  await writeFile(tmpPath, JSON.stringify(runtime, null, 2), { mode: 0o600 });
  const { rename } = await import('node:fs/promises');
  await rename(tmpPath, path);
}

export async function clearNativeHostRuntime(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}
