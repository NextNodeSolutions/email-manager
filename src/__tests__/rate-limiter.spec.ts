/**
 * Rate limiter tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
	configureGlobalRateLimit,
	getGlobalRateLimiter,
	resetGlobalRateLimiter,
} from '../lib/rate-limiter.js'

// Mock the logger to avoid console output during tests
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe('GlobalRateLimiter', () => {
	beforeEach(() => {
		// Reset singleton before each test
		resetGlobalRateLimiter()
	})

	afterEach(() => {
		// Clean up after each test
		resetGlobalRateLimiter()
	})

	describe('configureGlobalRateLimit', () => {
		it('should create singleton on first call', () => {
			expect(getGlobalRateLimiter()).toBeNull()

			configureGlobalRateLimit({ limit: 10 })

			expect(getGlobalRateLimiter()).not.toBeNull()
		})

		it('should not reconfigure on subsequent calls', () => {
			configureGlobalRateLimit({ limit: 10 })
			const first = getGlobalRateLimiter()

			configureGlobalRateLimit({ limit: 20 })
			const second = getGlobalRateLimiter()

			expect(first).toBe(second)
		})

		it('should throw for invalid limit', () => {
			expect(() => configureGlobalRateLimit({ limit: 0 })).toThrow(
				'Rate limit must be greater than 0',
			)
			expect(() => configureGlobalRateLimit({ limit: -5 })).toThrow(
				'Rate limit must be greater than 0',
			)
		})

		it('should throw if burst capacity is less than limit', () => {
			expect(() =>
				configureGlobalRateLimit({ limit: 10, burstCapacity: 5 }),
			).toThrow('Burst capacity must be >= limit')
		})

		it('should accept valid burst capacity', () => {
			configureGlobalRateLimit({ limit: 10, burstCapacity: 15 })

			const limiter = getGlobalRateLimiter()
			expect(limiter).not.toBeNull()

			const status = limiter!.getStatus()
			expect(status.burstCapacity).toBe(15)
		})
	})

	describe('resetGlobalRateLimiter', () => {
		it('should clear the singleton', () => {
			configureGlobalRateLimit({ limit: 10 })
			expect(getGlobalRateLimiter()).not.toBeNull()

			resetGlobalRateLimiter()

			expect(getGlobalRateLimiter()).toBeNull()
		})

		it('should allow reconfiguration after reset', () => {
			configureGlobalRateLimit({ limit: 10 })
			resetGlobalRateLimiter()

			configureGlobalRateLimit({ limit: 20 })

			const limiter = getGlobalRateLimiter()
			expect(limiter).not.toBeNull()
			expect(limiter!.getStatus().limit).toBe(20)
		})
	})

	describe('acquire', () => {
		it('should return immediately when tokens available', async () => {
			configureGlobalRateLimit({ limit: 10 })
			const limiter = getGlobalRateLimiter()!

			const start = Date.now()
			await limiter.acquire()
			const elapsed = Date.now() - start

			// Should be nearly instant (< 50ms)
			expect(elapsed).toBeLessThan(50)
		})

		it('should block when tokens exhausted', async () => {
			// Configure with limit of 2/s (500ms between tokens), burst = limit
			configureGlobalRateLimit({ limit: 2, burstCapacity: 2 })
			const limiter = getGlobalRateLimiter()!

			// Exhaust all tokens
			await limiter.acquire()
			await limiter.acquire()

			// Third acquire should wait ~500ms for token refill
			const start = Date.now()
			await limiter.acquire()
			const elapsed = Date.now() - start

			// Should wait approximately 500ms (allow some tolerance)
			expect(elapsed).toBeGreaterThanOrEqual(400)
			expect(elapsed).toBeLessThan(700)
		})

		it('should handle burst capacity correctly', async () => {
			// Limit 2/s with burst of 3
			configureGlobalRateLimit({ limit: 2, burstCapacity: 3 })
			const limiter = getGlobalRateLimiter()!

			// Should be able to acquire 3 tokens quickly (burst)
			const start = Date.now()
			await limiter.acquire()
			await limiter.acquire()
			await limiter.acquire()
			const burstTime = Date.now() - start

			// Burst should be fast
			expect(burstTime).toBeLessThan(100)

			// 4th acquire should wait for refill
			const waitStart = Date.now()
			await limiter.acquire()
			const waitTime = Date.now() - waitStart

			expect(waitTime).toBeGreaterThanOrEqual(400)
		})

		it('should throw after destroy', async () => {
			configureGlobalRateLimit({ limit: 10 })
			const limiter = getGlobalRateLimiter()!

			limiter.destroy()

			await expect(limiter.acquire()).rejects.toThrow(
				'Rate limiter has been destroyed',
			)
		})
	})

	describe('getStatus', () => {
		it('should return correct initial status', () => {
			configureGlobalRateLimit({ limit: 10, burstCapacity: 15 })
			const limiter = getGlobalRateLimiter()!

			const status = limiter.getStatus()

			expect(status.limit).toBe(10)
			expect(status.burstCapacity).toBe(15)
			expect(status.availableTokens).toBe(15)
		})

		it('should reflect token consumption', async () => {
			configureGlobalRateLimit({ limit: 10, burstCapacity: 10 })
			const limiter = getGlobalRateLimiter()!

			await limiter.acquire()
			await limiter.acquire()

			const status = limiter.getStatus()

			// Should have ~8 tokens (may have some refill)
			expect(status.availableTokens).toBeLessThan(10)
			expect(status.availableTokens).toBeGreaterThanOrEqual(7)
		})

		it('should use limit as default burst capacity', () => {
			configureGlobalRateLimit({ limit: 5 })
			const limiter = getGlobalRateLimiter()!

			const status = limiter.getStatus()

			expect(status.burstCapacity).toBe(5)
		})
	})

	describe('concurrent access', () => {
		it('should handle concurrent acquire calls without errors', async () => {
			// 10 emails per second, burst of 10
			configureGlobalRateLimit({ limit: 10, burstCapacity: 10 })
			const limiter = getGlobalRateLimiter()!

			// Launch 10 concurrent acquires (should all succeed quickly due to burst)
			const startTime = Date.now()
			const promises = Array.from({ length: 10 }, () => limiter.acquire())
			await Promise.all(promises)
			const elapsed = Date.now() - startTime

			// All 10 should complete within burst capacity
			expect(elapsed).toBeLessThan(200)
		})

		it('should serialize access when burst exhausted', async () => {
			// 2 emails per second, burst of 2
			configureGlobalRateLimit({ limit: 2, burstCapacity: 2 })
			const limiter = getGlobalRateLimiter()!

			// Exhaust burst
			await limiter.acquire()
			await limiter.acquire()

			// Next 2 acquires should be serialized
			const startTime = Date.now()
			await limiter.acquire()
			await limiter.acquire()
			const elapsed = Date.now() - startTime

			// Should take ~1000ms for 2 tokens at 2/s rate
			expect(elapsed).toBeGreaterThanOrEqual(800)
			expect(elapsed).toBeLessThan(1300)
		})
	})
})
