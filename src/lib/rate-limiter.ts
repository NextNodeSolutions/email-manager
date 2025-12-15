/**
 * Global Rate Limiter
 * Token Bucket algorithm implementation for coordinating rate limits across all email sends
 */

import { logger } from '../utils/logger.js'

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
	/** Maximum emails per second */
	limit: number
	/** Burst capacity (default = limit) */
	burstCapacity?: number
}

/**
 * Rate limiter status
 */
export interface RateLimiterStatus {
	/** Configured limit (emails/second) */
	limit: number
	/** Current available tokens */
	availableTokens: number
	/** Burst capacity */
	burstCapacity: number
	/** Time of last token refill */
	lastRefillTime: number
}

/**
 * Token bucket interface
 * Used for both global rate limiting and per-queue rate limiting
 */
export interface TokenBucket {
	/** Acquire permission to send (blocks until rate allows) */
	acquire(): Promise<void>
	/** Get current rate limiter status */
	getStatus(): RateLimiterStatus
	/** Shutdown and release resources */
	destroy(): void
}

/**
 * Global rate limiter interface (alias for TokenBucket)
 */
export type GlobalRateLimiter = TokenBucket

/**
 * Simple delay utility
 */
const delay = (ms: number): Promise<void> =>
	new Promise(resolve => setTimeout(resolve, ms))

/**
 * Create a token bucket rate limiter
 *
 * @param config - Rate limiter configuration
 * @returns TokenBucket instance
 *
 * @example
 * ```typescript
 * const limiter = createTokenBucket({ limit: 10 })
 * await limiter.acquire()  // Blocks until rate allows
 * ```
 */
export const createTokenBucket = (config: RateLimiterConfig): TokenBucket => {
	const capacity = config.burstCapacity ?? config.limit
	const refillRate = config.limit / 1000 // tokens per millisecond

	let tokens = capacity
	let lastRefillTime = Date.now()
	let isDestroyed = false

	/**
	 * Refill tokens based on elapsed time
	 */
	const refill = (): void => {
		const now = Date.now()
		const elapsed = now - lastRefillTime
		const tokensToAdd = elapsed * refillRate

		tokens = Math.min(capacity, tokens + tokensToAdd)
		lastRefillTime = now
	}

	const acquire = async (): Promise<void> => {
		if (isDestroyed) {
			throw new Error('Rate limiter has been destroyed')
		}

		refill()

		if (tokens >= 1) {
			tokens -= 1
			return
		}

		// Calculate wait time for next token
		const tokensNeeded = 1 - tokens
		const waitTime = tokensNeeded / refillRate

		await delay(waitTime)

		// After waiting, take the token
		tokens = 0
		lastRefillTime = Date.now()
	}

	const getStatus = (): RateLimiterStatus => {
		refill()
		return {
			limit: config.limit,
			availableTokens: tokens,
			burstCapacity: capacity,
			lastRefillTime,
		}
	}

	const destroy = (): void => {
		isDestroyed = true
		tokens = 0
	}

	return {
		acquire,
		getStatus,
		destroy,
	}
}

// Module-level singleton
let globalRateLimiter: GlobalRateLimiter | null = null

/**
 * Configure the global rate limiter
 *
 * Call this once at application startup to enable global rate limiting.
 * All EmailManager instances and direct sends will respect this limit.
 *
 * @param config - Rate limiter configuration
 *
 * @example
 * ```typescript
 * import { configureGlobalRateLimit } from '@nextnode/email-manager'
 *
 * // At app startup
 * configureGlobalRateLimit({ limit: 10 })  // 10 emails/second max
 *
 * // With burst capacity
 * configureGlobalRateLimit({ limit: 10, burstCapacity: 15 })
 * ```
 */
export const configureGlobalRateLimit = (config: RateLimiterConfig): void => {
	if (globalRateLimiter) {
		logger.warn(
			'Global rate limiter already configured. Call resetGlobalRateLimiter() first if reconfiguration is intended.',
		)
		return
	}

	if (config.limit <= 0) {
		throw new Error('Rate limit must be greater than 0')
	}

	if (
		config.burstCapacity !== undefined &&
		config.burstCapacity < config.limit
	) {
		throw new Error('Burst capacity must be >= limit')
	}

	globalRateLimiter = createTokenBucket(config)

	logger.info('Global rate limiter configured', {
		limit: config.limit,
		burstCapacity: config.burstCapacity ?? config.limit,
	})
}

/**
 * Get the global rate limiter instance
 *
 * Returns null if not configured.
 *
 * @returns GlobalRateLimiter or null
 */
export const getGlobalRateLimiter = (): GlobalRateLimiter | null =>
	globalRateLimiter

/**
 * Reset the global rate limiter
 *
 * Primarily for testing purposes. Destroys the current limiter
 * and allows reconfiguration.
 */
export const resetGlobalRateLimiter = (): void => {
	if (globalRateLimiter) {
		globalRateLimiter.destroy()
		globalRateLimiter = null
	}
}
