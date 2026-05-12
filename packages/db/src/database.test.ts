import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from ".";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("openDatabase", () => {
  it("opens SQLite and applies explicit migrations once", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "golemancy-db-"));
    tempDirs.push(dataDir);

    const first = openDatabase({ dataDir });
    expect(first.migrationStatus.applied).toBe(1);
    expect(first.migrationStatus.schemaVersion).toBe(1);
    first.close();

    const second = openDatabase({ dataDir });
    expect(second.migrationStatus.applied).toBe(0);
    expect(second.migrationStatus.schemaVersion).toBe(1);
    second.close();
  });
});
