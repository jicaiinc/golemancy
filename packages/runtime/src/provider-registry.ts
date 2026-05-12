import type { ProviderConfig, ProviderId, RuntimeEngineKind } from '@golemancy/shared';
import type { RuntimeEngine } from './engine.js';

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, ProviderConfig>();
  private readonly engines = new Map<RuntimeEngineKind, RuntimeEngine>();

  registerProvider(config: ProviderConfig): void {
    this.providers.set(config.id, config);
  }

  registerEngine(engine: RuntimeEngine): void {
    this.engines.set(engine.kind, engine);
  }

  getProvider(id: ProviderId): ProviderConfig | undefined {
    return this.providers.get(id);
  }

  listProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  resolveEngine(provider: ProviderConfig): RuntimeEngine | undefined {
    return this.engines.get(provider.engine);
  }
}
