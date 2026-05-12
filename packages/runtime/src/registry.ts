import type { ProviderTransport } from "@golemancy/shared";
import type { RuntimeEngine, RuntimeRunRequest } from "./types";
import { RuntimeEngineError } from "./types";

export class RuntimeEngineRegistry {
  readonly #engines = new Map<string, RuntimeEngine>();

  constructor(engines: RuntimeEngine[] = []) {
    for (const engine of engines) {
      this.register(engine);
    }
  }

  register(engine: RuntimeEngine): void {
    const id = engine.descriptor.id;
    if (this.#engines.has(id)) {
      throw new RuntimeEngineError(`Runtime engine already registered: ${id}`, "engine_duplicate", { id });
    }
    this.#engines.set(id, engine);
  }

  list(): RuntimeEngine[] {
    return [...this.#engines.values()];
  }

  get(id: string): RuntimeEngine | undefined {
    return this.#engines.get(id);
  }

  resolve(request: RuntimeRunRequest, preferredEngineId?: string): RuntimeEngine {
    if (preferredEngineId) {
      const engine = this.#engines.get(preferredEngineId);
      if (!engine) {
        throw new RuntimeEngineError(`Runtime engine not found: ${preferredEngineId}`, "engine_not_found", {
          preferredEngineId,
        });
      }
      if (!engine.canRun(request)) {
        throw new RuntimeEngineError(
          `Runtime engine ${preferredEngineId} cannot run provider transport ${request.provider.transport}`,
          "engine_transport_mismatch",
          { preferredEngineId, transport: request.provider.transport },
        );
      }
      return engine;
    }

    const engine = this.list().find((candidate) => candidate.canRun(request));
    if (!engine) {
      throw new RuntimeEngineError(
        `No runtime engine registered for provider transport ${request.provider.transport}`,
        "engine_unavailable",
        { transport: request.provider.transport },
      );
    }
    return engine;
  }

  hasTransport(transport: ProviderTransport): boolean {
    return this.list().some((engine) => engine.descriptor.supportedTransports.includes(transport));
  }

  async dispose(): Promise<void> {
    for (const engine of this.#engines.values()) {
      await engine.dispose?.();
    }
  }
}
