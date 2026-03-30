import { db } from '../db/connection.js';
import { executionLogs } from '../db/schema.js';
import { eq, desc, and, gte, lte, lt, sql, count, avg, or, ilike, ne } from 'drizzle-orm';
import type { CreateExecutionLog, ExecutionLogResult, LogFilters, LogStats } from '../types/execution-log.types.js';
import { logger } from '../utils/logger.js';

export async function startExecution(data: CreateExecutionLog): Promise<string> {
  const [log] = await db.insert(executionLogs).values({
    eventType: data.eventType,
    source: data.source,
    direction: data.direction,
    status: 'pending',
    inputData: data.inputData,
    conversationId: data.conversationId,
    contactId: data.contactId,
    metadata: data.metadata ?? {},
  }).returning({ id: executionLogs.id });

  return log.id;
}

export async function completeExecution(logId: string, result: ExecutionLogResult): Promise<void> {
  await db.update(executionLogs)
    .set({
      status: result.status,
      outputData: result.outputData ?? null,
      errorMessage: result.errorMessage ?? null,
      durationMs: result.durationMs,
      updatedAt: new Date(),
    })
    .where(eq(executionLogs.id, logId));
}

export async function withExecutionLog<T>(
  data: CreateExecutionLog,
  fn: () => Promise<T>,
): Promise<T> {
  const startTime = Date.now();
  const logId = await startExecution(data);

  try {
    const result = await fn();
    await completeExecution(logId, {
      id: logId,
      status: 'success',
      outputData: result,
      durationMs: Date.now() - startTime,
    });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ logId, error: errorMessage }, 'Execution failed');
    await completeExecution(logId, {
      id: logId,
      status: 'error',
      errorMessage,
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
}

export async function queryLogs(filters: LogFilters) {
  const conditions = [];

  if (filters.eventType) {
    conditions.push(eq(executionLogs.eventType, filters.eventType));
  }
  if (filters.status) {
    conditions.push(eq(executionLogs.status, filters.status));
  }
  if (filters.direction) {
    conditions.push(eq(executionLogs.direction, filters.direction));
  }
  if (filters.conversationId) {
    conditions.push(eq(executionLogs.conversationId, filters.conversationId));
  }
  if (filters.chatType) {
    conditions.push(sql`${executionLogs.metadata}->>'chatType' = ${filters.chatType}`);
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        sql`${executionLogs.inputData}::text ILIKE ${term}`,
        sql`${executionLogs.outputData}::text ILIKE ${term}`,
        ilike(executionLogs.eventType, term),
        sql`${executionLogs.metadata}::text ILIKE ${term}`,
      )!,
    );
  }
  if (filters.dateFrom) {
    conditions.push(gte(executionLogs.createdAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    conditions.push(lte(executionLogs.createdAt, new Date(filters.dateTo)));
  }

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const offset = (page - 1) * limit;

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db.select()
      .from(executionLogs)
      .where(where)
      .orderBy(desc(executionLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() })
      .from(executionLogs)
      .where(where),
  ]);

  return {
    data,
    total: totalResult[0].count,
    page,
    limit,
    totalPages: Math.ceil(totalResult[0].count / limit),
  };
}

export async function getLogById(id: string) {
  const [log] = await db.select()
    .from(executionLogs)
    .where(eq(executionLogs.id, id))
    .limit(1);
  return log ?? null;
}

export async function getLogStats(): Promise<LogStats> {
  // Run all 3 queries in parallel instead of sequentially (3 full scans → 3 concurrent scans)
  const [totalsResult, byStatusRows, byEventRows] = await Promise.all([
    db.select({
      totalLogs: count(),
      avgDurationMs: avg(executionLogs.durationMs),
    }).from(executionLogs),

    db.select({
      status: executionLogs.status,
      count: count(),
    }).from(executionLogs).groupBy(executionLogs.status),

    db.select({
      eventType: executionLogs.eventType,
      count: count(),
    }).from(executionLogs).groupBy(executionLogs.eventType),
  ]);

  const totals = totalsResult[0];

  const byStatus: Record<string, number> = {};
  for (const row of byStatusRows) {
    byStatus[row.status] = row.count;
  }

  const byEventType: Record<string, number> = {};
  for (const row of byEventRows) {
    byEventType[row.eventType] = row.count;
  }

  return {
    totalLogs: totals.totalLogs,
    byStatus,
    byEventType,
    avgDurationMs: Number(totals.avgDurationMs ?? 0),
  };
}

export async function cleanupOldLogs(retentionDays: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Error logs are kept twice as long for debugging
  const errorCutoffDate = new Date();
  errorCutoffDate.setDate(errorCutoffDate.getDate() - retentionDays * 2);

  const result = await db.delete(executionLogs)
    .where(
      or(
        and(lt(executionLogs.createdAt, cutoffDate), ne(executionLogs.status, 'error')),
        and(lt(executionLogs.createdAt, errorCutoffDate), eq(executionLogs.status, 'error')),
      ),
    )
    .returning({ id: executionLogs.id });

  const deleted = result.length;
  if (deleted > 0) {
    logger.info({ deleted, retentionDays, cutoffDate, errorCutoffDate }, 'Old execution logs cleaned up');
  }
  return deleted;
}
