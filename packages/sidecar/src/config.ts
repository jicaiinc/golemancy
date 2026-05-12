import { homedir } from 'node:os';
import { join } from 'node:path';
import { NATIVE_HOST_DIR_NAME, NATIVE_HOST_RUNTIME_FILENAME } from '@golemancy/protocol';

export type SidecarConfig = {
  readonly host: string;
  readonly port: number;
  readonly version: string;
  readonly nativeHostRuntimePath: string;
  readonly dbPath: string;
};

export function loadConfig(overrides: Partial<SidecarConfig> = {}): SidecarConfig {
  const home = homedir();
  const dataDir = join(home, NATIVE_HOST_DIR_NAME);
  return {
    host: overrides.host ?? '127.0.0.1',
    port: overrides.port ?? 0,
    version: overrides.version ?? readPackageVersion(),
    nativeHostRuntimePath:
      overrides.nativeHostRuntimePath ?? join(dataDir, NATIVE_HOST_RUNTIME_FILENAME),
    dbPath: overrides.dbPath ?? join(dataDir, 'golemancy.sqlite'),
  };
}

function readPackageVersion(): string {
  return process.env.GOLEMANCY_VERSION ?? '0.2.0-rebuild.0';
}
