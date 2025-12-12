/**
 * Queue type definitions
 * Types for email queue management with retry and rate limiting
 */

import type { EmailMessage } from './email.js'
import type { SendResult } from './result.js'

/**
 * Queue job status
 */
export type QueueJobStatus =
	| 'pending'
	| 'processing'
	| 'completed'
	| 'failed'
	| 'retrying'

/**
 * Queue job
 */
export interface QueueJob {
	/** Unique job ID */
	id: string
	/** Email message */
	message: EmailMessage
	/** Current status */
	status: QueueJobStatus
	/** Number of attempts */
	attempts: number
	/** Max retries */
	maxRetries: number
	/** Created timestamp */
	createdAt: Date
	/** Last attempt timestamp */
	lastAttemptAt?: Date | undefined
	/** Scheduled for timestamp */
	scheduledFor?: Date | undefined
	/** Result if completed/failed */
	result?: SendResult | undefined
	/** Error message if failed */
	error?: string | undefined
}

/**
 * Queue options
 */
export interface QueueOptions {
	/** Max concurrent sends */
	concurrency?: number
	/** Max retries per email */
	maxRetries?: number
	/** Initial retry delay (ms) */
	retryDelay?: number
	/** Max retry delay (ms) */
	maxRetryDelay?: number
	/** Rate limit: emails per second */
	rateLimit?: number
	/** Batch processing size */
	batchSize?: number
}

/**
 * Queue statistics
 */
export interface QueueStats {
	/** Total jobs in queue */
	total: number
	/** Pending jobs */
	pending: number
	/** Processing jobs */
	processing: number
	/** Completed jobs */
	completed: number
	/** Failed jobs */
	failed: number
	/** Jobs waiting for retry */
	retrying: number
}

/**
 * Queue event types
 */
export type QueueEventType =
	| 'job:added'
	| 'job:processing'
	| 'job:completed'
	| 'job:failed'
	| 'job:retry'
	| 'queue:drained'
	| 'queue:error'

/**
 * Queue event handler
 */
export type QueueEventHandler<T = unknown> = (data: T) => void

/**
 * Email queue interface
 */
export interface EmailQueue {
	/** Add single email to queue */
	add(
		message: EmailMessage,
		options?: { scheduledFor?: Date | undefined },
	): Promise<QueueJob>

	/** Add multiple emails to queue */
	addBatch(messages: EmailMessage[]): Promise<QueueJob[]>

	/** Get job by ID */
	getJob(id: string): Promise<QueueJob | undefined>

	/** Get queue statistics */
	getStats(): Promise<QueueStats>

	/** Start processing queue */
	start(): void

	/** Stop processing queue */
	stop(): Promise<void>

	/** Pause queue processing */
	pause(): void

	/** Resume queue processing */
	resume(): void

	/** Clear all pending jobs */
	clear(): Promise<number>

	/** Subscribe to queue events */
	on<T>(event: QueueEventType, handler: QueueEventHandler<T>): void

	/** Unsubscribe from queue events */
	off(event: QueueEventType, handler: QueueEventHandler): void
}
