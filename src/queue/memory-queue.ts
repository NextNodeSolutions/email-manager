/**
 * In-memory email queue
 * Queue implementation with retry logic, rate limiting, and event system
 */

import { randomUUID } from 'node:crypto'

import { QUEUE_DEFAULT_OPTIONS } from '../lib/constants.js'
import { createTokenBucket, getGlobalRateLimiter } from '../lib/rate-limiter.js'
import type {
	EmailMessage,
	EmailProvider,
	EmailQueue,
	JobFilterOptions,
	QueueEventHandler,
	QueueEventType,
	QueueJob,
	QueueOptions,
	QueueStats,
} from '../types/index.js'
import { calculateBackoff, delay } from '../utils/index.js'

/**
 * Create an in-memory email queue
 *
 * @param provider - Email provider to use for sending
 * @param options - Queue configuration options
 * @returns EmailQueue instance
 *
 * @example
 * ```typescript
 * const queue = createMemoryQueue(provider, {
 *   maxRetries: 3,
 *   rateLimit: 10
 * })
 *
 * await queue.add({ to: 'user@example.com', subject: 'Hello', html: '...' })
 * queue.start()
 * ```
 */
export const createMemoryQueue = (
	provider: EmailProvider,
	options: QueueOptions = {},
): EmailQueue => {
	const config = { ...QUEUE_DEFAULT_OPTIONS, ...options }
	const jobs = new Map<string, QueueJob>()
	const pending: string[] = []
	const eventHandlers = new Map<QueueEventType, Set<QueueEventHandler>>()

	let isRunning = false
	let isPaused = false
	let isProcessing = false

	// Token bucket for local rate limiting (strict sequential with no burst)
	const localRateLimiter = createTokenBucket({
		limit: config.rateLimit,
		burstCapacity: 1,
	})

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
	 * Wait for rate limit
	 * Applies global rate limiter first (if configured), then local token bucket rate limiting
	 */
	const waitForRateLimit = async (): Promise<void> => {
		// Global rate limiter takes priority (shared across all instances)
		const globalLimiter = getGlobalRateLimiter()
		if (globalLimiter) {
			await globalLimiter.acquire()
		}

		// Local rate limit: token bucket with strict sequential (no burst)
		await localRateLimiter.acquire()
	}

	/**
	 * Get synchronous stats
	 */
	const getStatsSync = (): QueueStats => {
		let pendingCount = 0
		let processingCount = 0
		let completedCount = 0
		let failedCount = 0
		let retryingCount = 0

		for (const job of jobs.values()) {
			switch (job.status) {
				case 'pending':
					pendingCount += 1
					break
				case 'processing':
					processingCount += 1
					break
				case 'completed':
					completedCount += 1
					break
				case 'failed':
					failedCount += 1
					break
				case 'retrying':
					retryingCount += 1
					break
			}
		}

		return {
			total: jobs.size,
			pending: pendingCount,
			processing: processingCount,
			completed: completedCount,
			failed: failedCount,
			retrying: retryingCount,
		}
	}

	/**
	 * Check if queue can process more jobs
	 */
	const canProcess = (): boolean => {
		if (!isRunning || isPaused) return false
		if (isProcessing) return false
		return true
	}

	/**
	 * Handle scheduled job - returns true if job was scheduled for later
	 */
	const scheduleForLater = (jobId: string, job: QueueJob): boolean => {
		if (!job.scheduledFor || job.scheduledFor <= new Date()) return false

		const delayMs = job.scheduledFor.getTime() - Date.now()
		setTimeout(() => {
			pending.push(jobId)
			processNext()
		}, delayMs)
		return true
	}

	/**
	 * Process next job in queue
	 */
	const processNext = (): void => {
		if (!canProcess()) return

		if (pending.length === 0) {
			emit('queue:drained', { stats: getStatsSync() })
			return
		}

		const jobId = pending.shift()
		if (!jobId) return

		const job = jobs.get(jobId)
		if (!job) return

		if (scheduleForLater(jobId, job)) return

		isProcessing = true
		processJob(jobId)
	}

	/**
	 * Process a single job
	 */
	const processJob = async (jobId: string): Promise<void> => {
		const job = jobs.get(jobId)
		if (!job || job.status === 'completed') {
			isProcessing = false
			processNext()
			return
		}

		job.status = 'processing'
		job.attempts += 1
		job.lastAttemptAt = new Date()

		emit('job:processing', { job })

		try {
			await waitForRateLimit()
			const result = await provider.send(job.message)

			if (result.success) {
				job.status = 'completed'
				job.result = result
				emit('job:completed', { job, result })
			} else {
				throw new Error(result.error.message)
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			if (job.attempts < job.maxRetries) {
				job.status = 'retrying'
				job.error = errorMessage
				const backoffDelay = calculateBackoff(
					job.attempts,
					config.retryDelay,
					config.maxRetryDelay,
				)

				emit('job:retry', { job, nextRetryIn: backoffDelay })

				// Schedule retry
				setTimeout(() => {
					if (isRunning && !isPaused) {
						pending.push(jobId)
						processNext()
					}
				}, backoffDelay)
			} else {
				job.status = 'failed'
				job.error = errorMessage
				emit('job:failed', { job, error: errorMessage })
			}
		} finally {
			isProcessing = false
			processNext()
		}
	}

	return {
		async add(
			message: EmailMessage,
			addOptions: { scheduledFor?: Date } = {},
		): Promise<QueueJob> {
			const job: QueueJob = {
				id: randomUUID(),
				message,
				status: 'pending',
				attempts: 0,
				maxRetries: config.maxRetries,
				createdAt: new Date(),
				scheduledFor: addOptions.scheduledFor,
			}

			jobs.set(job.id, job)
			pending.push(job.id)
			emit('job:added', { job })

			if (isRunning && !isPaused) {
				processNext()
			}

			return job
		},

		async addBatch(messages: EmailMessage[]): Promise<QueueJob[]> {
			const addedJobs: QueueJob[] = []

			for (const message of messages) {
				const job = await this.add(message)
				addedJobs.push(job)
			}

			return addedJobs
		},

		async getJob(id: string): Promise<QueueJob | undefined> {
			return jobs.get(id)
		},

		async getJobs(options: JobFilterOptions = {}): Promise<QueueJob[]> {
			const { status, limit = 100, offset = 0 } = options

			let result = Array.from(jobs.values())

			// Filter by status if provided
			if (status) {
				result = result.filter(job => job.status === status)
			}

			// Sort by creation date (newest first)
			result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

			// Apply pagination
			return result.slice(offset, offset + limit)
		},

		async getStats(): Promise<QueueStats> {
			return getStatsSync()
		},

		start(): void {
			isRunning = true
			isPaused = false

			// Restore interrupted jobs (standard queue behavior)
			for (const job of jobs.values()) {
				if (job.status === 'retrying' || job.status === 'processing') {
					job.status = 'pending'
					if (!pending.includes(job.id)) {
						pending.push(job.id)
					}
				}
			}

			// Start processing (sequential, one at a time)
			processNext()
		},

		async stop(): Promise<void> {
			isRunning = false

			// Wait for active job to complete
			while (isProcessing) {
				await delay(100)
			}
		},

		pause(): void {
			isPaused = true
		},

		resume(): void {
			isPaused = false
			processNext()
		},

		async clear(): Promise<number> {
			const pendingCount = pending.length
			pending.length = 0

			for (const [id, job] of jobs) {
				if (job.status === 'pending') {
					jobs.delete(id)
				}
			}

			return pendingCount
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

		async destroy(): Promise<void> {
			// Stop processing
			isRunning = false

			// Wait for active job to complete
			while (isProcessing) {
				await delay(100)
			}

			// Clear all data
			jobs.clear()
			pending.length = 0
			eventHandlers.clear()

			// Cleanup rate limiter
			localRateLimiter.destroy()
		},
	}
}
