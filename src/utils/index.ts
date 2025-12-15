/**
 * Utility functions for the library
 */

/**
 * Delay execution for specified milliseconds
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after delay
 */
export const delay = (ms: number): Promise<void> =>
	new Promise(resolve => setTimeout(resolve, ms))

/**
 * Calculate exponential backoff delay with jitter
 * @param attempt - Current attempt number (1-based)
 * @param retryDelay - Base retry delay in ms
 * @param maxRetryDelay - Maximum retry delay in ms
 * @returns Backoff delay in ms
 */
export const calculateBackoff = (
	attempt: number,
	retryDelay: number,
	maxRetryDelay: number,
): number => {
	const baseDelay = retryDelay * 2 ** (attempt - 1)
	// Add jitter (0-25% of delay)
	const jitter = baseDelay * Math.random() * 0.25
	return Math.min(baseDelay + jitter, maxRetryDelay)
}
