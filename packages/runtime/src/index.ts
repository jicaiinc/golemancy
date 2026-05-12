import { OpenAIAgentsRuntimeEngine } from "./openai-agents";

export type {
  ResolvedRuntimeProviderConfig,
  RunEventDraft,
  RuntimeEngine,
  RuntimeEngineDescriptor,
  RuntimeEventSink,
  RuntimeRunRequest,
  RuntimeRunResult,
} from "./types";
export { RuntimeEngineError, createRunEventDraft } from "./types";
export { RuntimeEngineRegistry } from "./registry";
export { OpenAIAgentsRuntimeEngine, emitMappedEvent, toAgentInput } from "./openai-agents";

export const initialRuntimeEngines = [new OpenAIAgentsRuntimeEngine()];
