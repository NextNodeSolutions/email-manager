/**
 * Queue constants
 * Default configuration values for queue processing
 */

/**
 * Default queue configuration options
 * Used by memory and SQLite queues
 */
export const QUEUE_DEFAULT_OPTIONS = {
	/** Max retry attempts per email */
	maxRetries: 3,
	/** Initial retry delay in milliseconds */
	retryDelay: 1000,
	/** Max retry delay in milliseconds */
	maxRetryDelay: 60_000,
	/** Max emails per second (Resend default) */
	rateLimit: 2,
	/** Batch size for processing */
	batchSize: 10,
} as const

/**
 * Default batch queue configuration
 * These values can be overridden by user options
 */
export const BATCH_QUEUE_DEFAULTS = {
	/** Max retry attempts per email */
	maxRetries: 3,
	/** Max emails per second (provider rate limit protection) */
	rateLimit: 2,
	/** Initial retry delay in milliseconds */
	retryDelay: 1000,
	/** Max retry delay in milliseconds */
	maxRetryDelay: 60_000,
	/** Default timeout for batch completion (5 minutes) */
	timeout: 300_000,
} as const
