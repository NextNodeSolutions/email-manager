/**
 * Batch queue constants
 * Default configuration values for ephemeral batch queue processing
 */

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

export type BatchQueueDefaults = typeof BATCH_QUEUE_DEFAULTS
