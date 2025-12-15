/**
 * Batch monitor
 * Tracks batch progress and emits notifications via callbacks or webhooks
 */

import { safeWebhookUrl } from '@nextnode/validation'

import type {
	BatchCompleteSummary,
	BatchProgressStats,
	QueueOptions,
} from '../types/index.js'
import { queueLogger } from '../utils/logger.js'

/** Progress notification interval (every N percent) */
const WEBHOOK_PROGRESS_PERCENT_INTERVAL = 10
/** Progress notification interval (every N jobs) */
const WEBHOOK_PROGRESS_COUNT_INTERVAL = 100

/**
 * Batch state for tracking progress
 */
interface BatchState {
	batchId: string
	total: number
	completed: number
	failed: number
	startedAt: number
}

/**
 * Batch monitor interface
 */
export interface BatchMonitor {
	startBatch(batchId: string, total: number): void
	recordSuccess(batchId: string): void
	recordFailure(batchId: string): void
	completeBatch(batchId: string): void
	getBatchStats(batchId: string): BatchProgressStats | undefined
	hasBatch(batchId: string): boolean
}

/**
 * Webhook event payload
 */
interface WebhookPayload {
	type: string
	timestamp: string
	data: BatchProgressStats | BatchCompleteSummary
}

/**
 * Create a batch monitor for tracking progress
 *
 * @param options - Queue options with monitoring callbacks/webhooks
 * @returns BatchMonitor instance
 */
export const createBatchMonitor = (options: QueueOptions): BatchMonitor => {
	const batches = new Map<string, BatchState>()

	/**
	 * Send webhook notification
	 */
	const sendWebhook = async (
		eventType: string,
		data: BatchProgressStats | BatchCompleteSummary,
	): Promise<void> => {
		if (!options.webhookUrl) return

		// SSRF protection: validate webhook URL
		const urlResult = safeWebhookUrl.safeParse(options.webhookUrl)
		if (!urlResult.success) {
			queueLogger.warn('Invalid webhook URL blocked (SSRF protection)', {
				details: { url: options.webhookUrl },
			})
			return
		}

		const payload: WebhookPayload = {
			type: eventType,
			timestamp: new Date().toISOString(),
			data,
		}

		try {
			const response = await fetch(options.webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			})

			if (!response.ok) {
				queueLogger.warn('Webhook delivery failed', {
					details: {
						status: response.status,
						url: options.webhookUrl,
					},
				})
			}
		} catch (error) {
			queueLogger.warn('Webhook delivery error', {
				details: {
					error:
						error instanceof Error
							? error.message
							: 'Unknown error',
					url: options.webhookUrl,
				},
			})
		}
	}

	/**
	 * Get current progress stats for a batch
	 */
	const getProgressStats = (batch: BatchState): BatchProgressStats => ({
		batchId: batch.batchId,
		total: batch.total,
		completed: batch.completed,
		failed: batch.failed,
		remaining: batch.total - batch.completed - batch.failed,
	})

	return {
		/**
		 * Start tracking a new batch
		 */
		startBatch(batchId: string, total: number): void {
			const batch: BatchState = {
				batchId,
				total,
				completed: 0,
				failed: 0,
				startedAt: Date.now(),
			}
			batches.set(batchId, batch)

			const stats = getProgressStats(batch)

			// Notify via callback
			options.onProgress?.(stats)

			// Notify via webhook
			void sendWebhook('batch.started', stats)

			queueLogger.info('Batch started', { details: { batchId, total } })
		},

		/**
		 * Record a successful job completion
		 */
		recordSuccess(batchId: string): void {
			const batch = batches.get(batchId)
			if (!batch) return

			batch.completed += 1
			const stats = getProgressStats(batch)

			// Notify via callback
			options.onProgress?.(stats)

			// Notify via webhook (throttled)
			const progressPercent = Math.floor(
				((batch.completed + batch.failed) / batch.total) * 100,
			)
			const shouldNotify =
				progressPercent % WEBHOOK_PROGRESS_PERCENT_INTERVAL === 0 ||
				(batch.completed + batch.failed) %
					WEBHOOK_PROGRESS_COUNT_INTERVAL ===
					0

			if (shouldNotify) {
				void sendWebhook('batch.progress', stats)
			}

			// Check if batch is complete
			if (batch.completed + batch.failed >= batch.total) {
				this.completeBatch(batchId)
			}
		},

		/**
		 * Record a job failure
		 */
		recordFailure(batchId: string): void {
			const batch = batches.get(batchId)
			if (!batch) return

			batch.failed += 1
			const stats = getProgressStats(batch)

			// Notify via callback
			options.onProgress?.(stats)

			// Check if batch is complete
			if (batch.completed + batch.failed >= batch.total) {
				this.completeBatch(batchId)
			}
		},

		/**
		 * Complete a batch and emit summary
		 */
		completeBatch(batchId: string): void {
			const batch = batches.get(batchId)
			if (!batch) return

			const summary: BatchCompleteSummary = {
				batchId: batch.batchId,
				totalSent: batch.completed,
				totalFailed: batch.failed,
				durationMs: Date.now() - batch.startedAt,
			}

			// Notify via callback
			options.onComplete?.(summary)

			// Notify via webhook
			void sendWebhook('batch.completed', summary)

			queueLogger.info('Batch completed', {
				details: {
					batchId,
					sent: summary.totalSent,
					failed: summary.totalFailed,
					durationMs: summary.durationMs,
				},
			})

			// Cleanup
			batches.delete(batchId)
		},

		/**
		 * Get current batch stats
		 */
		getBatchStats(batchId: string): BatchProgressStats | undefined {
			const batch = batches.get(batchId)
			if (!batch) return undefined
			return getProgressStats(batch)
		},

		/**
		 * Check if a batch exists
		 */
		hasBatch(batchId: string): boolean {
			return batches.has(batchId)
		},
	}
}
