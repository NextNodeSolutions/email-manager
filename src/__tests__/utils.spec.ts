/**
 * Utility functions tests
 */

import { describe, expect, it } from 'vitest'

import { delay } from '../utils/index.js'

describe('Utils', () => {
	describe('delay', () => {
		it('should delay execution', async () => {
			const start = Date.now()
			await delay(10)
			const end = Date.now()

			expect(end - start).toBeGreaterThanOrEqual(10)
		})
	})
})
