export const AnalyticsEvents = {
  // App lifecycle
  APP_OPENED: 'app_opened',
  APP_ACTIVE: 'app_active',
  ROUTE_VIEWED: 'route_viewed',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Provider
  PROVIDER_TESTED: 'provider_tested',
  SPEECH_PROVIDER_TESTED: 'speech_provider_tested',

  // Project
  PROJECT_CREATED: 'project_created',
  PROJECT_CREATED_FROM_TEMPLATE: 'project_created_from_template',
  PROJECT_SELECTED: 'project_selected',

  // Entities
  AGENT_CREATED: 'agent_created',
  TEAM_CREATED: 'team_created',
  SKILL_CREATED: 'skill_created',
  SKILL_IMPORTED: 'skill_imported',
  MCP_SERVER_CREATED: 'mcp_server_created',
  MCP_SERVER_TESTED: 'mcp_server_tested',
  CRON_JOB_CREATED: 'cron_job_created',
  CRON_JOB_TRIGGERED: 'cron_job_triggered',

  // Permissions
  PERMISSIONS_MODE_CHANGED: 'permissions_mode_changed',

  // Chat
  CONVERSATION_CREATED: 'conversation_created',
  CONVERSATION_TARGET_SWITCHED: 'conversation_target_switched',
  CHAT_MESSAGE_SUBMITTED: 'chat_message_submitted',
  CHAT_RESPONSE_COMPLETED: 'chat_response_completed',
  CHAT_RESPONSE_FAILED: 'chat_response_failed',
  CHAT_COMPACTION_REQUESTED: 'chat_compaction_requested',
  CHAT_COMPACTION_COMPLETED: 'chat_compaction_completed',

  // Voice
  VOICE_RECORDING_STARTED: 'voice_recording_started',
  VOICE_TRANSCRIPTION_COMPLETED: 'voice_transcription_completed',
  VOICE_TRANSCRIPTION_FAILED: 'voice_transcription_failed',
  VOICE_TRANSCRIPTION_RETRIED: 'voice_transcription_retried',
} as const

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents]
