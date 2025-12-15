/**
 * Shared queue utilities
 * Common functionality extracted from memory and SQLite queues
 */

import type { TokenBucket } from '../lib/rate-limiter.js'
import { getGlobalRateLimiter } from '../lib/rate-limiter.js'
import type { QueueEventHandler, QueueEventType } from '../types/index.js'
import { getErrorMessage } from '../utils/index.js'
import { queueLogger } from '../utils/logger.js'

/**
 * Event emitter instance type
 */
export interface QueueEventEmitter {
	emit: <T>(event: QueueEventType, data: T) => void
	on: <T>(event: QueueEventType, handler: QueueEventHandler<T>) => void
	off: (event: QueueEventType, handler: QueueEventHandler) => void
	clear: () => void
}

/**
 * Create a queue event emitter
 * Provides type-safe event emission with error isolation
 *
 * @returns Event emitter instance with handlers map
 */
export const createQueueEventEmitter = (): QueueEventEmitter => {
	const eventHandlers = new Map<QueueEventType, Set<QueueEventHandler>>()

	const emit = <T>(event: QueueEventType, data: T): void => {
		const handlers = eventHandlers.get(event)
		handlers?.forEach(handler => {
			try {
				handler(data)
			} catch (error) {
				queueLogger.warn('Event handler error', {
					event,
					error: getErrorMessage(error),
				})
			}
		})
	}

	const on = <T>(
		event: QueueEventType,
		handler: QueueEventHandler<T>,
	): void => {
		if (!eventHandlers.has(event)) {
			eventHandlers.set(event, new Set())
		}
		eventHandlers.get(event)?.add(handler as QueueEventHandler)
	}

	const off = (event: QueueEventType, handler: QueueEventHandler): void => {
		eventHandlers.get(event)?.delete(handler)
	}

	const clear = (): void => {
		eventHandlers.clear()
	}

	return { emit, on, off, clear }
}

/**
 * Create a rate limit coordination function
 * Coordinates global and local rate limiters
 *
 * @param localRateLimiter - Local token bucket rate limiter
 * @returns Function that waits for rate limit
 */
export const createRateLimitCoordinator = (
	localRateLimiter: TokenBucket,
): (() => Promise<void>) => {
	return async (): Promise<void> => {
		// Global rate limiter takes priority (shared across all instances)
		const globalLimiter = getGlobalRateLimiter()
		if (globalLimiter) {
			await globalLimiter.acquire()
		}

		// Local rate limit: token bucket with strict sequential (no burst)
		await localRateLimiter.acquire()
	}
}
