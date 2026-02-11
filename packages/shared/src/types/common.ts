// Branded ID types for compile-time safety
type Brand<T, B extends string> = T & { readonly __brand: B }

export type ProjectId = Brand<string, 'ProjectId'>
export type AgentId = Brand<string, 'AgentId'>
export type ConversationId = Brand<string, 'ConversationId'>
export type MessageId = Brand<string, 'MessageId'>
export type TaskId = Brand<string, 'TaskId'>
export type ArtifactId = Brand<string, 'ArtifactId'>
export type MemoryId = Brand<string, 'MemoryId'>
export type SkillId = Brand<string, 'SkillId'>
export type ToolId = Brand<string, 'ToolId'>
export type CronJobId = Brand<string, 'CronJobId'>

// Helper to create branded IDs
export function createId<T extends string>(value: string): Brand<string, T> {
  return value as Brand<string, T>
}

// Pagination
export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// Timestamps mixin
export interface Timestamped {
  createdAt: string
  updatedAt: string
}
