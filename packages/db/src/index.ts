import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { DatabaseSync } from "node:sqlite";
import { schema } from "./schema";

export type GolemancyDatabase = SqliteRemoteDatabase<typeof schema>;

export interface OpenDatabaseOptions {
  dataDir: string;
  filename?: string;
  migrationsDir?: string;
}

export interface MigrationStatus {
  applied: number;
  schemaVersion: number;
}

export interface OpenedDatabase {
  client: DatabaseSync;
  db: GolemancyDatabase;
  path: string;
  migrationStatus: MigrationStatus;
  close: () => void;
}

const migrationTable = "_golemancy_migrations";

export function defaultMigrationsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const sourceDir = dirname(currentFile);
  const candidates = [
    resolve(sourceDir, "../migrations"),
    resolve(sourceDir, "../../migrations"),
    resolve(process.cwd(), "packages/db/migrations"),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Unable to locate database migrations. Checked: ${candidates.join(", ")}`);
  }

  return found;
}

export function openDatabase(options: OpenDatabaseOptions): OpenedDatabase {
  mkdirSync(options.dataDir, { recursive: true });

  const databasePath = join(options.dataDir, options.filename ?? "golemancy.sqlite");
  const client = new DatabaseSync(databasePath);
  client.exec("PRAGMA foreign_keys = ON;");
  client.exec("PRAGMA journal_mode = WAL;");

  const migrationStatus = migrateDatabase(client, options.migrationsDir ?? defaultMigrationsDir());
  const db = drizzle(createNodeSqliteDrizzleAdapter(client), { schema });

  return {
    client,
    db,
    path: databasePath,
    migrationStatus,
    close: () => client.close(),
  };
}

function createNodeSqliteDrizzleAdapter(client: DatabaseSync) {
  return async (sql: string, params: any[], method: "run" | "all" | "values" | "get") => {
    const statement = client.prepare(sql);

    if (method === "run") {
      const result = statement.run(...params);
      return { rows: [result] };
    }

    if (method === "get") {
      const row = statement.get(...params);
      return { rows: row ? [row] : [] };
    }

    if (method === "values") {
      return { rows: statement.all(...params).map((row) => Object.values(row as Record<string, unknown>)) };
    }

    return { rows: statement.all(...params) };
  };
}

export function migrateDatabase(client: DatabaseSync, migrationsDir: string): MigrationStatus {
  client.exec(`
    CREATE TABLE IF NOT EXISTS ${migrationTable} (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const appliedRows = client.prepare(`SELECT id FROM ${migrationTable}`).all() as Array<{ id: string }>;
  const applied = new Set(appliedRows.map((row) => row.id));
  let appliedCount = 0;

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const now = new Date().toISOString();

    client.exec("BEGIN;");
    try {
      client.exec(sql);
      client.prepare(`INSERT INTO ${migrationTable} (id, applied_at) VALUES (?, ?)`).run(file, now);
      client.exec("COMMIT;");
      appliedCount += 1;
    } catch (error) {
      client.exec("ROLLBACK;");
      throw error;
    }
  }

  const versionRow = client.prepare(`SELECT COUNT(*) as count FROM ${migrationTable}`).get() as { count: number };
  return {
    applied: appliedCount,
    schemaVersion: versionRow.count,
  };
}

export { schema };
export { MessageRepository, ProjectRepository, RunRepository, ThreadRepository } from "./repositories";
export type {
  AppendRunEventInput,
  CreateMessageInput,
  CreateProjectInput,
  CreateRunRecordInput,
  CreateThreadInput,
  MessageRecord,
  ProjectRecord,
  RunRecord,
  ThreadRecord,
} from "./repositories";
