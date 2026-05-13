import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const transcriptionRecords = sqliteTable('transcription_records', {
  id: text('id').primaryKey(), // TranscriptionId (UUID)
  status: text('status').notNull().default('pending'), // 'pending' | 'success' | 'failed'
  audioFileId: text('audio_file_id').notNull(), // UUID of saved audio file
  audioDurationMs: integer('audio_duration_ms').notNull(),
  audioSizeBytes: integer('audio_size_bytes').notNull(),
  text: text('text'), // transcribed text
  error: text('error'), // error message
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  projectId: text('project_id'), // optional
  conversationId: text('conversation_id'), // optional
  usedInMessage: integer('used_in_message').notNull().default(0), // boolean as int
  createdAt: text('created_at').notNull(),
})
