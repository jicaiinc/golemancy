import { eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { settings } from '../schema/settings.js';

export class SettingsRepo {
  constructor(private readonly db: GolemancyDb) {}

  async get(key: string): Promise<string | undefined> {
    const row = await this.db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }
}
