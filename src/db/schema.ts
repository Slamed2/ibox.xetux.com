import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const executionLogs = pgTable('execution_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  source: varchar('source', { length: 50 }).notNull(),
  direction: varchar('direction', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  inputData: jsonb('input_data').notNull(),
  outputData: jsonb('output_data'),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  conversationId: varchar('conversation_id', { length: 100 }),
  contactId: varchar('contact_id', { length: 100 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_exec_logs_event_type').on(table.eventType),
  index('idx_exec_logs_status').on(table.status),
  index('idx_exec_logs_created_at').on(table.createdAt),
  index('idx_exec_logs_conversation_id').on(table.conversationId),
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatwootId: integer('chatwoot_id').unique().notNull(),
  chatwootAccountId: integer('chatwoot_account_id').notNull(),
  inboxId: integer('inbox_id'),
  contactId: integer('contact_id'),
  status: varchar('status', { length: 50 }),
  assigneeId: integer('assignee_id'),
  teamId: integer('team_id'),
  labels: jsonb('labels').default([]),
  customAttributes: jsonb('custom_attributes').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_conversations_chatwoot_id').on(table.chatwootId),
  index('idx_conversations_status').on(table.status),
]);

export const botConfig = pgTable('bot_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 255 }).unique().notNull(),
  value: jsonb('value').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
