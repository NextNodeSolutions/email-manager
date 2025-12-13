/**
 * SQLite-backed email queue
 * Persistent queue implementation with automatic lifecycle management
 * Uses native node:sqlite module (Node 22.5+)
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type {
	EmailMessage,
	EmailProvider,
	EmailQueue,
	JobFilterOptions,
	QueueBackendConfig,
	QueueEventHandler,
	QueueEventType,
	QueueJob,
	QueueOptions,
	QueueStats,
	SendResult,
} from '../types/index.js'
import { queueLogger } from '../utils/logger.js'
import type { BatchMonitor } from './batch-monitor.js'
import { createBatchMonitor } from './batch-monitor.js'

/**
 * SQLite backend configuration
 */
type SQLiteBackendConfig = Extract<QueueBackendConfig, { backend: 'sqlite' }>

/**
 * Database row type for email_queue table
 */
interface QueueRow {
	id: string
	batch_id: string | null
	message: string
	status: string
	attempts: number
	max_retries: number
	created_at: number
	last_attempt_at: number | null
	scheduled_for: number | null
	result: string | null
	error: string | null
}

/**
 * Default queue options
 */
const DEFAULT_OPTIONS = {
	concurrency: 5,
	maxRetries: 3,
	retryDelay: 1000,
	maxRetryDelay: 60000,
	rateLimit: 10,
	batchSize: 10,
}

/**
 * Default retention period (7 days in hours)
 */
const DEFAULT_RETENTION_HOURS = 168

/**
 * Cleanup interval (1 hour in milliseconds)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Module-level shutdown handler singleton
 * Prevents MaxListenersExceededWarning when multiple queues are created
 */
interface ShutdownableQueue {
	shutdown: () => Promise<void>
}
const activeQueues = new Set<ShutdownableQueue>()
let globalShutdownRegistered = false

const registerGlobalShutdownHandler = (): void => {
	if (globalShutdownRegistered) return

	const handler = (): void => {
		for (const queue of activeQueues) {
			void queue.shutdown()
		}
	}

	process.on('SIGTERM', handler)
	process.on('SIGINT', handler)
	globalShutdownRegistered = true
}

/**
 * Simple delay utility
 */
const delay = (ms: number): Promise<void> =>
	new Promise(resolve => setTimeout(resolve, ms))

/**
 * Convert database row to QueueJob
 */
const rowToJob = (row: QueueRow): QueueJob => ({
	id: row.id,
	batchId: row.batch_id ?? undefined,
	message: JSON.parse(row.message) as EmailMessage,
	status: row.status as QueueJob['status'],
	attempts: row.attempts,
	maxRetries: row.max_retries,
	createdAt: new Date(row.created_at),
	lastAttemptAt: row.last_attempt_at
		? new Date(row.last_attempt_at)
		: undefined,
	scheduledFor: row.scheduled_for ? new Date(row.scheduled_for) : undefined,
	result: row.result ? (JSON.parse(row.result) as SendResult) : undefined,
	error: row.error ?? undefined,
})

/**
 * Create a SQLite-backed email queue
 *
 * Features:
 * - Persistent storage across restarts
 * - Auto-restore interrupted jobs on init
 * - Auto-shutdown on SIGTERM/SIGINT
 * - Auto-cleanup of old completed/failed jobs
 * - Batch progress monitoring
 *
 * @param provider - Email provider for sending
 * @param options - Queue configuration options
 * @param backendConfig - SQLite-specific configuration
 * @returns EmailQueue instance
 */
export const createSQLiteQueue = (
	provider: EmailProvider,
	backendConfig: SQLiteBackendConfig,
	options: QueueOptions = {},
): EmailQueue => {
	const config = { ...DEFAULT_OPTIONS, ...options }
	const retentionHours =
		backendConfig.retentionHours ?? DEFAULT_RETENTION_HOURS
	const eventHandlers = new Map<QueueEventType, Set<QueueEventHandler>>()

	let db: DatabaseSync
	let isRunning = false
	let isPaused = false
	let activeCount = 0
	let lastSendTime = 0
	let cleanupInterval: NodeJS.Timeout | null = null

	// Queue instance reference for global shutdown handler
	let queueInstance: ShutdownableQueue | null = null

	// Batch monitor for progress tracking
	let batchMonitor: BatchMonitor | null = null
	if (options.onProgress || options.onComplete || options.webhookUrl) {
		batchMonitor = createBatchMonitor(options)
	}

	/**
	 * Ensure database directory exists
	 */
	const ensureDirectory = (): void => {
		const dir = dirname(backendConfig.databasePath)
		if (dir && !existsSync(dir)) {
			mkdirSync(dir, { recursive: true })
		}
	}

	/**
	 * Initialize database and schema
	 */
	const initializeDatabase = (): void => {
		ensureDirectory()
		db = new DatabaseSync(backendConfig.databasePath)

		// Enable WAL mode for better concurrency
		db.exec('PRAGMA journal_mode = WAL')

		// Create schema
		db.exec(`
			CREATE TABLE IF NOT EXISTS email_queue (
				id TEXT PRIMARY KEY,
				batch_id TEXT,
				message TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				attempts INTEGER NOT NULL DEFAULT 0,
				max_retries INTEGER NOT NULL DEFAULT 3,
				created_at INTEGER NOT NULL,
				last_attempt_at INTEGER,
				scheduled_for INTEGER,
				result TEXT,
				error TEXT
			);

			CREATE INDEX IF NOT EXISTS idx_status ON email_queue(status);
			CREATE INDEX IF NOT EXISTS idx_batch ON email_queue(batch_id);
			CREATE INDEX IF NOT EXISTS idx_scheduled ON email_queue(scheduled_for)
				WHERE status = 'pending';
		`)

		queueLogger.info('SQLite queue initialized', {
			details: { path: backendConfig.databasePath },
		})
	}

	/**
	 * Restore interrupted jobs (processing -> pending)
	 * Called automatically on initialization
	 */
	const restoreInterruptedJobs = (): number => {
		const result = db
			.prepare(
				`
				UPDATE email_queue
				SET status = 'pending'
				WHERE status IN ('processing', 'retrying')
			`,
			)
			.run()

		const recovered = Number(result.changes)
		if (recovered > 0) {
			queueLogger.info('Restored interrupted jobs', {
				details: { count: recovered },
			})
		}

		return recovered
	}

	/**
	 * Cleanup old completed/failed jobs
	 * Called automatically on interval
	 */
	const cleanupOldJobs = (): number => {
		const cutoffTime = Date.now() - retentionHours * 60 * 60 * 1000

		const result = db
			.prepare(
				`
				DELETE FROM email_queue
				WHERE status IN ('completed', 'failed')
				AND created_at < ?
			`,
			)
			.run(cutoffTime)

		const deleted = Number(result.changes)
		if (deleted > 0) {
			queueLogger.info('Cleaned up old jobs', {
				details: { count: deleted },
			})
		}

		return deleted
	}

	/**
	 * Graceful shutdown
	 * Called automatically on SIGTERM/SIGINT
	 */
	const gracefulShutdown = async (): Promise<void> => {
		// Remove from global shutdown registry
		if (queueInstance) {
			activeQueues.delete(queueInstance)
		}

		queueLogger.info('Graceful shutdown initiated')

		isRunning = false

		// Wait for active jobs to complete (max 30 seconds)
		const maxWait = 30000
		const startTime = Date.now()

		while (activeCount > 0 && Date.now() - startTime < maxWait) {
			await delay(100)
		}

		if (activeCount > 0) {
			queueLogger.warn('Shutdown timeout, some jobs may be interrupted', {
				details: { activeCount },
			})
		}

		// Stop cleanup interval
		if (cleanupInterval) {
			clearInterval(cleanupInterval)
			cleanupInterval = null
		}

		// Close database
		if (db) {
			db.close()
		}

		queueLogger.info('Graceful shutdown complete')
	}

	/**
	 * Start cleanup scheduler
	 */
	const startCleanupScheduler = (): void => {
		if (cleanupInterval) return

		// Run initial cleanup
		cleanupOldJobs()

		// Schedule periodic cleanup
		cleanupInterval = setInterval(() => {
			cleanupOldJobs()
		}, CLEANUP_INTERVAL_MS)

		// Don't prevent process exit
		cleanupInterval.unref()
	}

	/**
	 * Emit event to all registered handlers
	 */
	const emit = <T>(event: QueueEventType, data: T): void => {
		const handlers = eventHandlers.get(event)
		handlers?.forEach(handler => {
			try {
				handler(data)
			} catch {
				// Silently ignore handler errors
			}
		})
	}

	/**
	 * Calculate exponential backoff delay with jitter
	 */
	const calculateBackoff = (attempt: number): number => {
		const baseDelay = config.retryDelay * 2 ** (attempt - 1)
		const jitter = baseDelay * Math.random() * 0.25
		return Math.min(baseDelay + jitter, config.maxRetryDelay)
	}

	/**
	 * Wait for rate limit
	 */
	const waitForRateLimit = async (): Promise<void> => {
		const minInterval = 1000 / config.rateLimit
		const elapsed = Date.now() - lastSendTime
		if (elapsed < minInterval) {
			await delay(minInterval - elapsed)
		}
		lastSendTime = Date.now()
	}

	/**
	 * Type guard to check if value is a QueueRow
	 */
	const isQueueRow = (value: unknown): value is QueueRow => {
		if (typeof value !== 'object' || value === null) return false
		if (
			!('id' in value) ||
			!('message' in value) ||
			!('status' in value) ||
			!('attempts' in value) ||
			!('max_retries' in value) ||
			!('created_at' in value)
		) {
			return false
		}
		return (
			typeof value.id === 'string' &&
			typeof value.message === 'string' &&
			typeof value.status === 'string' &&
			typeof value.attempts === 'number' &&
			typeof value.max_retries === 'number' &&
			typeof value.created_at === 'number'
		)
	}

	/**
	 * Get next pending job from database
	 */
	const getNextPendingJob = (): QueueRow | undefined => {
		const now = Date.now()

		const row = db
			.prepare(
				`
				SELECT * FROM email_queue
				WHERE status = 'pending'
				AND (scheduled_for IS NULL OR scheduled_for <= ?)
				ORDER BY created_at ASC
				LIMIT 1
			`,
			)
			.get(now)

		return isQueueRow(row) ? row : undefined
	}

	/**
	 * Update job status in database
	 */
	const updateJobStatus = (
		id: string,
		status: string,
		updates: Partial<{
			attempts: number
			lastAttemptAt: number
			result: string
			error: string
		}> = {},
	): void => {
		const setClauses = ['status = ?']
		const params: (string | number)[] = [status]

		if (updates.attempts !== undefined) {
			setClauses.push('attempts = ?')
			params.push(updates.attempts)
		}
		if (updates.lastAttemptAt !== undefined) {
			setClauses.push('last_attempt_at = ?')
			params.push(updates.lastAttemptAt)
		}
		if (updates.result !== undefined) {
			setClauses.push('result = ?')
			params.push(updates.result)
		}
		if (updates.error !== undefined) {
			setClauses.push('error = ?')
			params.push(updates.error)
		}

		params.push(id)

		db.prepare(
			`UPDATE email_queue SET ${setClauses.join(', ')} WHERE id = ?`,
		).run(...params)
	}

	/**
	 * Type guard for stats row
	 */
	const isStatsRow = (
		value: unknown,
	): value is { status: string; count: number } => {
		if (typeof value !== 'object' || value === null) return false
		if (!('status' in value) || !('count' in value)) return false
		return (
			typeof value.status === 'string' && typeof value.count === 'number'
		)
	}

	/**
	 * Get synchronous stats
	 */
	const getStatsSync = (): QueueStats => {
		const rawRows = db
			.prepare(
				`SELECT status, COUNT(*) as count FROM email_queue GROUP BY status`,
			)
			.all()

		const stats: QueueStats = {
			total: 0,
			pending: 0,
			processing: 0,
			completed: 0,
			failed: 0,
			retrying: 0,
		}

		for (const rawRow of rawRows) {
			if (!isStatsRow(rawRow)) continue
			stats.total += rawRow.count
			switch (rawRow.status) {
				case 'pending':
					stats.pending = rawRow.count
					break
				case 'processing':
					stats.processing = rawRow.count
					break
				case 'completed':
					stats.completed = rawRow.count
					break
				case 'failed':
					stats.failed = rawRow.count
					break
				case 'retrying':
					stats.retrying = rawRow.count
					break
			}
		}

		return stats
	}

	/**
	 * Process next job in queue
	 */
	const processNext = (): void => {
		if (!isRunning || isPaused) return
		if (activeCount >= config.concurrency) return

		const row = getNextPendingJob()
		if (!row) {
			if (activeCount === 0) {
				emit('queue:drained', { stats: getStatsSync() })
			}
			return
		}

		activeCount += 1
		processJob(row.id, row)
	}

	/**
	 * Handle successful job completion
	 */
	const handleJobSuccess = (
		jobId: string,
		job: QueueJob,
		result: { success: true; messageId: string },
	): void => {
		updateJobStatus(jobId, 'completed', {
			result: JSON.stringify(result),
		})

		const updatedJob = { ...job, status: 'completed' as const, result }
		emit('job:completed', { job: updatedJob, result })

		if (job.batchId && batchMonitor) {
			batchMonitor.recordSuccess(job.batchId)
		}
	}

	/**
	 * Handle job retry scheduling
	 */
	const handleJobRetry = (
		jobId: string,
		job: QueueJob,
		errorMessage: string,
		newAttempts: number,
	): void => {
		const backoffDelay = calculateBackoff(newAttempts)

		updateJobStatus(jobId, 'retrying', { error: errorMessage })
		emit('job:retry', { job, nextRetryIn: backoffDelay })

		setTimeout(() => {
			if (isRunning && !isPaused) {
				updateJobStatus(jobId, 'pending')
				processNext()
			}
		}, backoffDelay)
	}

	/**
	 * Handle permanent job failure
	 */
	const handleJobFailure = (
		jobId: string,
		job: QueueJob,
		errorMessage: string,
	): void => {
		updateJobStatus(jobId, 'failed', { error: errorMessage })
		emit('job:failed', { job, error: errorMessage })

		if (job.batchId && batchMonitor) {
			batchMonitor.recordFailure(job.batchId)
		}
	}

	/**
	 * Process a single job
	 */
	const processJob = async (jobId: string, row: QueueRow): Promise<void> => {
		const job = rowToJob(row)

		updateJobStatus(jobId, 'processing', {
			attempts: job.attempts + 1,
			lastAttemptAt: Date.now(),
		})

		emit('job:processing', { job })

		try {
			await waitForRateLimit()
			const result = await provider.send(job.message)

			if (result.success) {
				handleJobSuccess(jobId, job, result)
			} else {
				throw new Error(result.error.message)
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			const newAttempts = job.attempts + 1

			if (newAttempts < job.maxRetries) {
				handleJobRetry(jobId, job, errorMessage, newAttempts)
			} else {
				handleJobFailure(jobId, job, errorMessage)
			}
		} finally {
			activeCount -= 1
			processNext()
		}
	}

	// Initialize database and auto-restore
	initializeDatabase()
	restoreInterruptedJobs()
	startCleanupScheduler()

	// Register for global shutdown handler (singleton pattern)
	queueInstance = { shutdown: gracefulShutdown }
	activeQueues.add(queueInstance)
	registerGlobalShutdownHandler()

	return {
		async add(
			message: EmailMessage,
			addOptions: { scheduledFor?: Date; batchId?: string } = {},
		): Promise<QueueJob> {
			const id = randomUUID()
			const now = Date.now()

			db.prepare(
				`
				INSERT INTO email_queue (
					id, batch_id, message, status, attempts, max_retries,
					created_at, scheduled_for
				) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)
			`,
			).run(
				id,
				addOptions.batchId ?? null,
				JSON.stringify(message),
				config.maxRetries,
				now,
				addOptions.scheduledFor?.getTime() ?? null,
			)

			const job: QueueJob = {
				id,
				batchId: addOptions.batchId,
				message,
				status: 'pending',
				attempts: 0,
				maxRetries: config.maxRetries,
				createdAt: new Date(now),
				scheduledFor: addOptions.scheduledFor,
			}

			emit('job:added', { job })

			if (isRunning && !isPaused) {
				processNext()
			}

			return job
		},

		async addBatch(messages: EmailMessage[]): Promise<QueueJob[]> {
			const batchId = randomUUID()
			const jobs: QueueJob[] = []

			// Start batch monitoring
			if (batchMonitor) {
				batchMonitor.startBatch(batchId, messages.length)
			}

			// Use transaction for batch insert
			const insertStmt = db.prepare(`
				INSERT INTO email_queue (
					id, batch_id, message, status, attempts, max_retries,
					created_at, scheduled_for
				) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)
			`)

			// Manual transaction (node:sqlite doesn't have transaction() helper)
			db.exec('BEGIN')
			try {
				const now = Date.now()
				for (const message of messages) {
					const id = randomUUID()
					insertStmt.run(
						id,
						batchId,
						JSON.stringify(message),
						config.maxRetries,
						now,
						null,
					)
					jobs.push({
						id,
						batchId,
						message,
						status: 'pending',
						attempts: 0,
						maxRetries: config.maxRetries,
						createdAt: new Date(now),
					})
				}
				db.exec('COMMIT')
			} catch (error) {
				db.exec('ROLLBACK')
				throw error
			}

			// Emit events for each job
			for (const job of jobs) {
				emit('job:added', { job })
			}

			if (isRunning && !isPaused) {
				// Start multiple processing workers
				for (let i = 0; i < config.concurrency; i++) {
					processNext()
				}
			}

			return jobs
		},

		async getJob(id: string): Promise<QueueJob | undefined> {
			const row = db
				.prepare('SELECT * FROM email_queue WHERE id = ?')
				.get(id)

			return isQueueRow(row) ? rowToJob(row) : undefined
		},

		async getJobs(options: JobFilterOptions = {}): Promise<QueueJob[]> {
			const { status, limit = 100, offset = 0 } = options

			let query = 'SELECT * FROM email_queue'
			const params: (string | number)[] = []

			if (status) {
				query += ' WHERE status = ?'
				params.push(status)
			}

			query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
			params.push(limit, offset)

			const rawRows = db.prepare(query).all(...params)
			const jobs: QueueJob[] = []

			for (const rawRow of rawRows) {
				if (isQueueRow(rawRow)) {
					jobs.push(rowToJob(rawRow))
				}
			}

			return jobs
		},

		async getStats(): Promise<QueueStats> {
			return getStatsSync()
		},

		start(): void {
			isRunning = true
			isPaused = false

			// Restore interrupted jobs (standard queue behavior)
			restoreInterruptedJobs()

			// Start processing pending jobs
			for (let i = 0; i < config.concurrency; i++) {
				processNext()
			}
		},

		async stop(): Promise<void> {
			isRunning = false

			// Wait for active jobs to complete
			while (activeCount > 0) {
				await delay(100)
			}
		},

		pause(): void {
			isPaused = true
		},

		resume(): void {
			isPaused = false

			for (let i = 0; i < config.concurrency; i++) {
				processNext()
			}
		},

		async clear(): Promise<number> {
			const result = db
				.prepare("DELETE FROM email_queue WHERE status = 'pending'")
				.run()

			return Number(result.changes)
		},

		on<T>(event: QueueEventType, handler: QueueEventHandler<T>): void {
			if (!eventHandlers.has(event)) {
				eventHandlers.set(event, new Set())
			}
			eventHandlers.get(event)?.add(handler as QueueEventHandler)
		},

		off(event: QueueEventType, handler: QueueEventHandler): void {
			eventHandlers.get(event)?.delete(handler)
		},
	}
}
