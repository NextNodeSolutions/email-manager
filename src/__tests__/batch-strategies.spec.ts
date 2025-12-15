/**
 * Batch strategies tests
 * Tests for native and queue batch strategies
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendBatchNative } from '../batch/native-strategy.js'
import { RESEND_MAX_BATCH_SIZE } from '../lib/constants.js'
import type { EmailMessage, EmailProvider } from '../types/index.js'
import { chunkArray } from '../utils/index.js'

// Mock rate limiter
vi.mock('../lib/rate-limiter.js', () => ({
	createTokenBucket: vi.fn().mockImplementation(() => ({
		acquire: vi.fn().mockResolvedValue(undefined),
		tryAcquire: vi.fn().mockReturnValue(true),
		status: vi.fn().mockReturnValue({ tokens: 1, waiting: 0 }),
		reset: vi.fn(),
	})),
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
	queueLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

const createMockProvider = (
	sendBatchResult: Awaited<ReturnType<EmailProvider['sendBatch']>>,
): EmailProvider => ({
	name: 'mock',
	send: vi.fn(),
	sendBatch: vi.fn().mockResolvedValue(sendBatchResult),
	validateConfig: vi.fn().mockResolvedValue(true),
})

const createTestMessage = (index: number): EmailMessage => ({
	from: 'sender@example.com',
	to: `recipient${index}@example.com`,
	subject: `Test Email ${index}`,
	html: `<h1>Hello ${index}</h1>`,
})

describe('chunkArray utility', () => {
	it('should split array into chunks of specified size', () => {
		const array = [1, 2, 3, 4, 5]
		const chunks = chunkArray(array, 2)

		expect(chunks).toEqual([[1, 2], [3, 4], [5]])
	})

	it('should handle empty array', () => {
		const chunks = chunkArray([], 10)
		expect(chunks).toEqual([])
	})

	it('should handle array smaller than chunk size', () => {
		const array = [1, 2, 3]
		const chunks = chunkArray(array, 10)

		expect(chunks).toEqual([[1, 2, 3]])
	})

	it('should handle array exactly divisible by chunk size', () => {
		const array = [1, 2, 3, 4]
		const chunks = chunkArray(array, 2)

		expect(chunks).toEqual([
			[1, 2],
			[3, 4],
		])
	})
})

describe('sendBatchNative', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('should send batch with fewer than 100 emails in single request', async () => {
		const mockProvider = createMockProvider({
			success: true,
			data: {
				total: 5,
				successful: 5,
				failed: 0,
				durationMs: 100,
				results: Array.from({ length: 5 }, (_, i) => ({
					index: i,
					recipient: `recipient${i}@example.com`,
					result: {
						success: true as const,
						data: {
							id: `msg_${i}`,
							provider: 'mock',
							sentAt: new Date(),
						},
					},
				})),
			},
		})

		const messages = Array.from({ length: 5 }, (_, i) =>
			createTestMessage(i),
		)

		const result = await sendBatchNative(
			messages,
			{ mode: 'native' },
			mockProvider,
		)

		expect(result.success).toBe(true)
		expect(mockProvider.sendBatch).toHaveBeenCalledTimes(1)
		if (result.success) {
			expect(result.data.total).toBe(5)
			expect(result.data.successful).toBe(5)
			expect(result.data.failed).toBe(0)
		}
	})

	it('should auto-chunk batch with more than 100 emails', async () => {
		const chunkCount = 3
		const totalEmails = RESEND_MAX_BATCH_SIZE * 2 + 50 // 250 emails = 3 chunks

		const mockProvider = createMockProvider({
			success: true,
			data: {
				total: RESEND_MAX_BATCH_SIZE,
				successful: RESEND_MAX_BATCH_SIZE,
				failed: 0,
				durationMs: 100,
				results: Array.from(
					{ length: RESEND_MAX_BATCH_SIZE },
					(_, i) => ({
						index: i,
						recipient: `recipient${i}@example.com`,
						result: {
							success: true as const,
							data: {
								id: `msg_${i}`,
								provider: 'mock',
								sentAt: new Date(),
							},
						},
					}),
				),
			},
		})

		const messages = Array.from({ length: totalEmails }, (_, i) =>
			createTestMessage(i),
		)

		const result = await sendBatchNative(
			messages,
			{ mode: 'native' },
			mockProvider,
		)

		expect(result.success).toBe(true)
		expect(mockProvider.sendBatch).toHaveBeenCalledTimes(chunkCount)
		if (result.success) {
			expect(result.data.total).toBe(totalEmails)
		}
	})

	it('should correctly map indices across chunks', async () => {
		const totalEmails = 150 // 2 chunks: 100 + 50

		const mockProvider: EmailProvider = {
			name: 'mock',
			send: vi.fn(),
			sendBatch: vi
				.fn()
				.mockResolvedValueOnce({
					success: true,
					data: {
						total: 100,
						successful: 100,
						failed: 0,
						durationMs: 100,
						results: Array.from({ length: 100 }, (_, i) => ({
							index: i,
							recipient: `recipient${i}@example.com`,
							result: {
								success: true as const,
								data: {
									id: `msg_${i}`,
									provider: 'mock',
									sentAt: new Date(),
								},
							},
						})),
					},
				})
				.mockResolvedValueOnce({
					success: true,
					data: {
						total: 50,
						successful: 50,
						failed: 0,
						durationMs: 100,
						results: Array.from({ length: 50 }, (_, i) => ({
							index: i,
							recipient: `recipient${100 + i}@example.com`,
							result: {
								success: true as const,
								data: {
									id: `msg_${100 + i}`,
									provider: 'mock',
									sentAt: new Date(),
								},
							},
						})),
					},
				}),
			validateConfig: vi.fn().mockResolvedValue(true),
		}

		const messages = Array.from({ length: totalEmails }, (_, i) =>
			createTestMessage(i),
		)

		const result = await sendBatchNative(
			messages,
			{ mode: 'native' },
			mockProvider,
		)

		expect(result.success).toBe(true)
		if (result.success && result.data.results) {
			// First chunk results: indices 0-99
			expect(result.data.results[0].index).toBe(0)
			expect(result.data.results[99].index).toBe(99)
			// Second chunk results: indices 100-149
			expect(result.data.results[100].index).toBe(100)
			expect(result.data.results[149].index).toBe(149)
		}
	})

	it('should handle chunk failure and continue processing', async () => {
		const totalEmails = 200 // 2 chunks

		const mockProvider: EmailProvider = {
			name: 'mock',
			send: vi.fn(),
			sendBatch: vi
				.fn()
				.mockResolvedValueOnce({
					success: true,
					data: {
						total: 100,
						successful: 100,
						failed: 0,
						durationMs: 100,
						results: Array.from({ length: 100 }, (_, i) => ({
							index: i,
							recipient: `recipient${i}@example.com`,
							result: {
								success: true as const,
								data: {
									id: `msg_${i}`,
									provider: 'mock',
									sentAt: new Date(),
								},
							},
						})),
					},
				})
				.mockResolvedValueOnce({
					success: false,
					error: {
						code: 'PROVIDER_ERROR' as const,
						message: 'Batch failed',
					},
				}),
			validateConfig: vi.fn().mockResolvedValue(true),
		}

		const messages = Array.from({ length: totalEmails }, (_, i) =>
			createTestMessage(i),
		)

		const result = await sendBatchNative(
			messages,
			{ mode: 'native' },
			mockProvider,
		)

		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.total).toBe(200)
			expect(result.data.successful).toBe(100)
			expect(result.data.failed).toBe(100)
			// Should have 200 results (100 success + 100 failed)
			expect(result.data.results).toHaveLength(200)
		}
	})

	it('should use custom rate limit', async () => {
		const { createTokenBucket } = await import('../lib/rate-limiter.js')
		const mockProvider = createMockProvider({
			success: true,
			data: {
				total: 5,
				successful: 5,
				failed: 0,
				durationMs: 100,
				results: [],
			},
		})

		const messages = Array.from({ length: 5 }, (_, i) =>
			createTestMessage(i),
		)

		await sendBatchNative(
			messages,
			{ mode: 'native', rateLimit: 10 },
			mockProvider,
		)

		expect(createTokenBucket).toHaveBeenCalledWith({
			limit: 10,
			burstCapacity: 1,
		})
	})

	it('should handle empty batch', async () => {
		const mockProvider = createMockProvider({
			success: true,
			data: {
				total: 0,
				successful: 0,
				failed: 0,
				durationMs: 0,
				results: [],
			},
		})

		const result = await sendBatchNative(
			[],
			{ mode: 'native' },
			mockProvider,
		)

		expect(result.success).toBe(true)
		expect(mockProvider.sendBatch).not.toHaveBeenCalled()
		if (result.success) {
			expect(result.data.total).toBe(0)
		}
	})

	it('should track duration correctly', async () => {
		vi.useFakeTimers()

		const mockProvider: EmailProvider = {
			name: 'mock',
			send: vi.fn(),
			sendBatch: vi.fn().mockImplementation(async () => {
				await vi.advanceTimersByTimeAsync(500)
				return {
					success: true,
					data: {
						total: 5,
						successful: 5,
						failed: 0,
						durationMs: 500,
						results: [],
					},
				}
			}),
			validateConfig: vi.fn().mockResolvedValue(true),
		}

		const messages = Array.from({ length: 5 }, (_, i) =>
			createTestMessage(i),
		)

		const resultPromise = sendBatchNative(
			messages,
			{ mode: 'native' },
			mockProvider,
		)

		await vi.runAllTimersAsync()
		const result = await resultPromise

		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.durationMs).toBeGreaterThanOrEqual(500)
		}
	})
})

describe('RESEND_MAX_BATCH_SIZE constant', () => {
	it('should be 100', () => {
		expect(RESEND_MAX_BATCH_SIZE).toBe(100)
	})
})
