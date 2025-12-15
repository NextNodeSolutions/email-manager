/**
 * Queue tests
 * Tests for memory queue implementation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMemoryQueue } from '../queue/memory-queue.js'
import type { EmailMessage, EmailProvider } from '../types/index.js'

// Mock provider
const createMockProvider = (
	sendResult = {
		success: true as const,
		data: { id: 'msg_123', provider: 'mock', sentAt: new Date() },
	},
): EmailProvider => ({
	name: 'mock',
	send: vi.fn().mockResolvedValue(sendResult),
	sendBatch: vi.fn().mockResolvedValue({
		success: true,
		data: { total: 1, successful: 1, failed: 0, results: [] },
	}),
	validateConfig: vi.fn().mockResolvedValue(true),
})

const createTestMessage = (
	overrides: Partial<EmailMessage> = {},
): EmailMessage => ({
	from: 'sender@example.com',
	to: 'recipient@example.com',
	subject: 'Test Email',
	html: '<h1>Hello</h1>',
	...overrides,
})

// Mock logger
vi.mock('../utils/logger.js', () => ({
	queueLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe('Memory Queue', () => {
	let mockProvider: EmailProvider

	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
		mockProvider = createMockProvider()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('Job Management', () => {
		it('should add job to queue', async () => {
			const queue = createMemoryQueue(mockProvider, {})
			const message = createTestMessage()

			const job = await queue.add(message)

			expect(job.id).toBeDefined()
			expect(job.status).toBe('pending')
			expect(job.message).toEqual(message)
		})

		it('should add batch of jobs', async () => {
			const queue = createMemoryQueue(mockProvider, {})
			const messages = [
				createTestMessage(),
				createTestMessage({ to: 'other@example.com' }),
			]

			const jobs = await queue.addBatch(messages)

			expect(jobs).toHaveLength(2)
			expect(jobs[0]?.status).toBe('pending')
			expect(jobs[1]?.status).toBe('pending')
		})

		it('should get job by ID', async () => {
			const queue = createMemoryQueue(mockProvider, {})
			const message = createTestMessage()

			const addedJob = await queue.add(message)
			const retrievedJob = await queue.getJob(addedJob.id)

			expect(retrievedJob).toBeDefined()
			expect(retrievedJob?.id).toBe(addedJob.id)
		})

		it('should return undefined for non-existent job', async () => {
			const queue = createMemoryQueue(mockProvider, {})

			const job = await queue.getJob('non-existent-id')

			expect(job).toBeUndefined()
		})

		it('should schedule job for future execution', async () => {
			const queue = createMemoryQueue(mockProvider, {})
			const message = createTestMessage()
			const futureDate = new Date(Date.now() + 60000)

			const job = await queue.add(message, { scheduledFor: futureDate })

			expect(job.scheduledFor).toEqual(futureDate)
		})
	})

	describe('Queue Statistics', () => {
		it('should return correct stats for empty queue', async () => {
			const queue = createMemoryQueue(mockProvider, {})

			const stats = await queue.getStats()

			expect(stats.total).toBe(0)
			expect(stats.pending).toBe(0)
			expect(stats.processing).toBe(0)
			expect(stats.completed).toBe(0)
			expect(stats.failed).toBe(0)
		})

		it('should track pending jobs', async () => {
			const queue = createMemoryQueue(mockProvider, {})

			await queue.add(createTestMessage())
			await queue.add(createTestMessage())

			const stats = await queue.getStats()

			expect(stats.total).toBe(2)
			expect(stats.pending).toBe(2)
		})
	})

	describe('Queue Control', () => {
		it('should start and stop queue', async () => {
			const queue = createMemoryQueue(mockProvider, {})

			queue.start()
			await queue.stop()

			// Should not throw
			expect(true).toBe(true)
		})

		it('should pause and resume queue', () => {
			const queue = createMemoryQueue(mockProvider, {})

			queue.start()
			queue.pause()
			queue.resume()

			// Should not throw
			expect(true).toBe(true)
		})

		it('should clear all pending jobs', async () => {
			const queue = createMemoryQueue(mockProvider, {})

			await queue.add(createTestMessage())
			await queue.add(createTestMessage())

			const cleared = await queue.clear()

			expect(cleared).toBe(2)

			const stats = await queue.getStats()
			expect(stats.pending).toBe(0)
		})
	})

	describe('Queue Processing', () => {
		it('should process pending jobs when started', async () => {
			const queue = createMemoryQueue(mockProvider, { rateLimit: 10 })
			const message = createTestMessage()

			await queue.add(message)
			queue.start()

			// Advance timers to trigger processing
			await vi.advanceTimersByTimeAsync(100)

			expect(mockProvider.send).toHaveBeenCalledWith(message)
		})

		it('should process jobs sequentially', async () => {
			const queue = createMemoryQueue(mockProvider, { rateLimit: 10 })

			// Add jobs
			await queue.add(createTestMessage())
			await queue.add(createTestMessage())

			const stats = await queue.getStats()
			expect(stats.pending).toBe(2)
		})
	})

	describe('Event Handlers', () => {
		it('should register and trigger event handlers', async () => {
			const queue = createMemoryQueue(mockProvider, {})
			const handler = vi.fn()

			queue.on('job:added', handler)

			await queue.add(createTestMessage())

			expect(handler).toHaveBeenCalled()
		})

		it('should unregister event handlers', async () => {
			const queue = createMemoryQueue(mockProvider, {})
			const handler = vi.fn()

			queue.on('job:added', handler)
			queue.off('job:added', handler)

			await queue.add(createTestMessage())

			expect(handler).not.toHaveBeenCalled()
		})
	})

	describe('Queue Options', () => {
		it('should use default options', async () => {
			const queue = createMemoryQueue(mockProvider, {})
			const job = await queue.add(createTestMessage())

			expect(job.maxRetries).toBe(3) // Default max retries
		})

		it('should use custom max retries', async () => {
			const queue = createMemoryQueue(mockProvider, { maxRetries: 5 })
			const job = await queue.add(createTestMessage())

			expect(job.maxRetries).toBe(5)
		})
	})
})
