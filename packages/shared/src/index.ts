export type ISODateTime = string;

export type ID = string;

export type RuntimeEnvironment = "development" | "production" | "test";

export type RuntimeHealth = "ok" | "degraded" | "error";

export type ProviderTransport =
  | "openai-responses"
  | "openai-chat-compatible"
  | "ai-sdk-adapter"
  | "custom-model"
  | "cli-agent";

export type ToolMode = "auto" | "native" | "prompted" | "disabled";

export interface RuntimeComponentStatus {
  name: string;
  status: RuntimeHealth;
  detail?: string;
  checkedAt: ISODateTime;
}
