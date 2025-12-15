/**
 * Utility functions tests
 */

import { describe, expect, it, vi } from 'vitest'

import { calculateBackoff, delay } from '../utils/index.js'

describe('Utils', () => {
	describe('delay', () => {
		it('should delay execution', async () => {
			const start = Date.now()
			await delay(10)
			const end = Date.now()

			expect(end - start).toBeGreaterThanOrEqual(10)
		})
	})

	describe('calculateBackoff', () => {
		it('should return base delay for first attempt with jitter', () => {
			vi.spyOn(Math, 'random').mockReturnValue(0)

			const result = calculateBackoff(1, 1000, 60000)

			expect(result).toBe(1000) // 1000 * 2^0 = 1000, no jitter with random=0

			vi.restoreAllMocks()
		})

		it('should double delay for each subsequent attempt', () => {
			vi.spyOn(Math, 'random').mockReturnValue(0)

			expect(calculateBackoff(1, 1000, 60000)).toBe(1000) // 1000 * 2^0
			expect(calculateBackoff(2, 1000, 60000)).toBe(2000) // 1000 * 2^1
			expect(calculateBackoff(3, 1000, 60000)).toBe(4000) // 1000 * 2^2
			expect(calculateBackoff(4, 1000, 60000)).toBe(8000) // 1000 * 2^3

			vi.restoreAllMocks()
		})

		it('should cap delay at maxRetryDelay', () => {
			vi.spyOn(Math, 'random').mockReturnValue(0)

			// 1000 * 2^9 = 512000, but max is 60000
			const result = calculateBackoff(10, 1000, 60000)

			expect(result).toBe(60000)

			vi.restoreAllMocks()
		})

		it('should add jitter between 0-25% of base delay', () => {
			// Test with max jitter (random = 1)
			vi.spyOn(Math, 'random').mockReturnValue(1)

			const result = calculateBackoff(1, 1000, 60000)

			// Base: 1000, jitter: 1000 * 1 * 0.25 = 250
			expect(result).toBe(1250)

			vi.restoreAllMocks()
		})

		it('should handle edge case with zero retry delay', () => {
			vi.spyOn(Math, 'random').mockReturnValue(0.5)

			const result = calculateBackoff(1, 0, 60000)

			expect(result).toBe(0)

			vi.restoreAllMocks()
		})
	})
})
