/**
 * Ephemeral batch queue
 * Creates a temporary SQLite queue for batch processing with automatic cleanup
 */

import { randomUUID } from 'node:crypto'

import { QUEUE_DEFAULTS } from '../lib/constants.js'
import type {
	BatchCompleteSummary,
	EmailMessage,
	EmailProvider,
	EmailQueue,
	QueueBatchOptions,
	QueueJob,
} from '../types/index.js'
import { queueLogger } from '../utils/logger.js'
import { createSQLiteQueue } from './sqlite-queue.js'

/**
 * Ephemeral batch queue interface
 * Provides a simplified API for batch processing with automatic cleanup
 */
export interface EphemeralBatchQueue {
	/** Unique batch identifier */
	readonly batchId: string
	/** Add messages to the batch */
	addBatch(messages: EmailMessage[]): Promise<QueueJob[]>
	/** Start processing the batch */
	start(): void
	/** Wait for all jobs to complete (success or failure) */
	waitForCompletion(timeout?: number): Promise<BatchCompleteSummary>
	/** Destroy the queue and delete the database file */
	destroy(): Promise<void>
}

/**
 * Create an ephemeral SQLite queue for batch processing
 *
 * Features:
 * - Dedicated SQLite database per batch
 * - Event-driven completion (no polling)
 * - Automatic cleanup on destroy
 * - Configurable timeout
 *
 * @param provider - Email provider for sending
 * @param options - Batch configuration options
 * @returns EphemeralBatchQueue instance
 *
 * @example
 * ```typescript
 * const batch = createEphemeralBatchQueue(provider, { rateLimit: 2 })
 *
 * await batch.addBatch(messages)
 * batch.start()
 *
 * const summary = await batch.waitForCompletion(60_000) // 1 min timeout
 * await batch.destroy()
 * ```
 */
export const createEphemeralBatchQueue = (
	provider: EmailProvider,
	options: QueueBatchOptions = {},
): EphemeralBatchQueue => {
	const batchId = randomUUID()
	const dbKey = `batch-${batchId}`

	// Merge user options with defaults
	const config = {
		maxRetries: options.maxRetries ?? QUEUE_DEFAULTS.maxRetries,
		rateLimit: options.rateLimit ?? QUEUE_DEFAULTS.rateLimit,
		retryDelay: options.retryDelay ?? QUEUE_DEFAULTS.retryDelay,
		maxRetryDelay: options.maxRetryDelay ?? QUEUE_DEFAULTS.maxRetryDelay,
		timeout: options.timeout ?? QUEUE_DEFAULTS.timeout,
	}

	// Deferred pattern for completion - no polling
	let resolveCompletion: (summary: BatchCompleteSummary) => void
	let rejectCompletion: (error: Error) => void
	let isCompleted = false

	const completionPromise = new Promise<BatchCompleteSummary>(
		(resolve, reject) => {
			resolveCompletion = resolve
			rejectCompletion = reject
		},
	)

	// Create SQLite queue with completion callback
	let queue: EmailQueue

	const initQueue = (): EmailQueue => {
		// Handle internal completion + user callback
		const handleComplete = (summary: BatchCompleteSummary): void => {
			// Call user callback first
			options.onComplete?.(summary)

			// Then resolve internal completion promise
			if (!isCompleted) {
				isCompleted = true
				queueLogger.info('Ephemeral batch completed', {
					details: {
						batchId,
						sent: summary.totalSent,
						failed: summary.totalFailed,
						durationMs: summary.durationMs,
					},
				})
				resolveCompletion(summary)
			}
		}

		return createSQLiteQueue(
			provider,
			{
				backend: 'sqlite',
				appName: 'ephemeral-batches',
				databaseKey: dbKey,
				// Short retention since we delete on destroy anyway
				retentionHours: 1,
			},
			{
				maxRetries: config.maxRetries,
				rateLimit: config.rateLimit,
				retryDelay: config.retryDelay,
				maxRetryDelay: config.maxRetryDelay,
				// Conditionally spread callbacks to avoid undefined with exactOptionalPropertyTypes
				...(options.onProgress && { onProgress: options.onProgress }),
				onComplete: handleComplete,
			},
		)
	}

	queue = initQueue()

	queueLogger.info('Ephemeral batch queue created', {
		details: { batchId, config },
	})

	return {
		get batchId(): string {
			return batchId
		},

		async addBatch(messages: EmailMessage[]): Promise<QueueJob[]> {
			return queue.addBatch(messages)
		},

		start(): void {
			queue.start()
		},

		async waitForCompletion(
			timeout?: number,
		): Promise<BatchCompleteSummary> {
			const effectiveTimeout = timeout ?? config.timeout

			if (!effectiveTimeout) {
				return completionPromise
			}

			// Race between completion and timeout
			return Promise.race([
				completionPromise,
				new Promise<never>((_, reject) => {
					const timeoutId = setTimeout(() => {
						if (!isCompleted) {
							isCompleted = true
							const error = new Error(
								`Batch ${batchId} timeout after ${effectiveTimeout}ms`,
							)
							rejectCompletion(error)
							reject(error)
						}
					}, effectiveTimeout)

					// Don't prevent process exit
					timeoutId.unref()
				}),
			])
		},

		async destroy(): Promise<void> {
			await queue.destroy()
			queueLogger.info('Ephemeral batch queue destroyed', {
				details: { batchId },
			})
		},
	}
}
