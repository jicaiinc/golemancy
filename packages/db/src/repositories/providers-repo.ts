import { eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { providers, type ProviderRow } from '../schema/providers.js';

export class ProvidersRepo {
  constructor(private readonly db: GolemancyDb) {}

  async list(): Promise<ProviderRow[]> {
    return this.db.select().from(providers).all();
  }

  async get(id: string): Promise<ProviderRow | undefined> {
    return this.db.select().from(providers).where(eq(providers.id, id)).get();
  }
}
