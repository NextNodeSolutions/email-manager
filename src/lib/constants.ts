/**
 * Queue constants
 * Default configuration values for queue processing
 */

/**
 * Default queue configuration options
 * Used by memory, SQLite, and batch queues
 */
export const QUEUE_DEFAULTS = {
	/** Max retry attempts per email */
	maxRetries: 3,
	/** Initial retry delay in milliseconds */
	retryDelay: 1000,
	/** Max retry delay in milliseconds */
	maxRetryDelay: 60_000,
	/** Max emails per second (Resend default) */
	rateLimit: 2,
	/** Default timeout for batch completion (5 minutes) */
	timeout: 300_000,
	/** Default retention period in hours (7 days) */
	retentionHours: 168,
	/** Cleanup interval in milliseconds (1 hour) */
	cleanupIntervalMs: 60 * 60 * 1000,
	/** Graceful shutdown timeout in milliseconds (30 seconds) */
	gracefulShutdownTimeoutMs: 30_000,
} as const
