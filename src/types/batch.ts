/**
 * Batch processing type definitions
 * Types for batch email sending with strategy support
 */

import type { BatchCompleteSummary, BatchProgressStats } from './queue.js'

/**
 * Batch processing mode
 * - 'queue': Ephemeral queue with retries, rate limiting per email (reliable)
 * - 'native': Direct provider batch API for max throughput (fast)
 */
export type BatchMode = 'queue' | 'native'

/**
 * Base batch options shared by all modes
 */
export interface BatchOptionsBase {
	/** Max emails per second (provider rate limit protection) */
	rateLimit?: number
	/** Timeout for batch completion in milliseconds */
	timeout?: number
}

/**
 * Queue-specific batch options (default mode)
 * Uses ephemeral SQLite queue with retry logic
 */
export interface QueueBatchOptions extends BatchOptionsBase {
	/** Processing mode (default: 'queue') */
	mode?: 'queue'
	/** Max retry attempts per email */
	maxRetries?: number
	/** Initial retry delay in milliseconds */
	retryDelay?: number
	/** Max retry delay in milliseconds */
	maxRetryDelay?: number
	/** Progress callback (called after each email completes) */
	onProgress?: (stats: BatchProgressStats) => void
	/** Completion callback (called when batch finishes) */
	onComplete?: (summary: BatchCompleteSummary) => void
}

/**
 * Native-specific batch options
 * Uses provider's batch API directly for max throughput
 * Note: No retry logic or progress callbacks in this mode
 */
export interface NativeBatchOptions extends BatchOptionsBase {
	/** Processing mode (required for native) */
	mode: 'native'
}

/**
 * Union type for sendBatch options
 * Discriminated by 'mode' field
 */
export type BatchOptions = QueueBatchOptions | NativeBatchOptions
