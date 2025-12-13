/**
 * SQLite Queue tests
 * Tests for SQLite-backed queue implementation with auto-lifecycle
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSQLiteQueue } from '../queue/sqlite-queue.js'
import type { EmailMessage, EmailProvider } from '../types/index.js'

// Test database path
const TEST_DB_DIR = join(tmpdir(), 'email-manager-tests')
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-queue.db')

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

describe('SQLite Queue', () => {
	let mockProvider: EmailProvider

	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()

		// Ensure test directory exists
		if (!existsSync(TEST_DB_DIR)) {
			mkdirSync(TEST_DB_DIR, { recursive: true })
		}

		// Remove test database if it exists
		if (existsSync(TEST_DB_PATH)) {
			rmSync(TEST_DB_PATH)
		}
		if (existsSync(`${TEST_DB_PATH}-wal`)) {
			rmSync(`${TEST_DB_PATH}-wal`)
		}
		if (existsSync(`${TEST_DB_PATH}-shm`)) {
			rmSync(`${TEST_DB_PATH}-shm`)
		}

		mockProvider = createMockProvider()
	})

	afterEach(() => {
		vi.useRealTimers()

		// Cleanup test database
		try {
			if (existsSync(TEST_DB_PATH)) {
				rmSync(TEST_DB_PATH)
			}
			if (existsSync(`${TEST_DB_PATH}-wal`)) {
				rmSync(`${TEST_DB_PATH}-wal`)
			}
			if (existsSync(`${TEST_DB_PATH}-shm`)) {
				rmSync(`${TEST_DB_PATH}-shm`)
			}
		} catch {
			// Ignore cleanup errors
		}
	})

	describe('Database Initialization', () => {
		it('should create database file on initialization', () => {
			createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

			expect(existsSync(TEST_DB_PATH)).toBe(true)
		})

		it('should create database directory if it does not exist', () => {
			const nestedPath = join(TEST_DB_DIR, 'nested', 'queue.db')

			createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: nestedPath,
			})

			expect(existsSync(nestedPath)).toBe(true)

			// Cleanup
			rmSync(join(TEST_DB_DIR, 'nested'), { recursive: true })
		})
	})

	describe('Job Management', () => {
		it('should add job to queue', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})
			const message = createTestMessage()

			const job = await queue.add(message)

			expect(job.id).toBeDefined()
			expect(job.status).toBe('pending')
			expect(job.message).toEqual(message)
		})

		it('should add batch of jobs', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})
			const messages = [
				createTestMessage(),
				createTestMessage({ to: 'other@example.com' }),
			]

			const jobs = await queue.addBatch(messages)

			expect(jobs).toHaveLength(2)
			expect(jobs[0]?.status).toBe('pending')
			expect(jobs[1]?.status).toBe('pending')
			// All jobs in batch should have same batchId
			expect(jobs[0]?.batchId).toBe(jobs[1]?.batchId)
		})

		it('should get job by ID', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})
			const message = createTestMessage()

			const addedJob = await queue.add(message)
			const retrievedJob = await queue.getJob(addedJob.id)

			expect(retrievedJob).toBeDefined()
			expect(retrievedJob?.id).toBe(addedJob.id)
		})

		it('should return undefined for non-existent job', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

			const job = await queue.getJob('non-existent-id')

			expect(job).toBeUndefined()
		})

		it('should schedule job for future execution', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})
			const message = createTestMessage()
			const futureDate = new Date(Date.now() + 60000)

			const job = await queue.add(message, { scheduledFor: futureDate })

			expect(job.scheduledFor).toEqual(futureDate)
		})
	})

	describe('Queue Statistics', () => {
		it('should return correct stats for empty queue', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

			const stats = await queue.getStats()

			expect(stats.total).toBe(0)
			expect(stats.pending).toBe(0)
			expect(stats.processing).toBe(0)
			expect(stats.completed).toBe(0)
			expect(stats.failed).toBe(0)
		})

		it('should track pending jobs', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

			await queue.add(createTestMessage())
			await queue.add(createTestMessage())

			const stats = await queue.getStats()

			expect(stats.total).toBe(2)
			expect(stats.pending).toBe(2)
		})
	})

	describe('Queue Control', () => {
		it('should start and stop queue', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

			queue.start()
			await queue.stop()

			// Should not throw
			expect(true).toBe(true)
		})

		it('should pause and resume queue', () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

			queue.start()
			queue.pause()
			queue.resume()

			// Should not throw
			expect(true).toBe(true)
		})

		it('should clear all pending jobs', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

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
			const queue = createSQLiteQueue(
				mockProvider,
				{ backend: 'sqlite', databasePath: TEST_DB_PATH },
				{ concurrency: 1 },
			)
			const message = createTestMessage()

			await queue.add(message)
			queue.start()

			// Advance timers to trigger processing
			await vi.advanceTimersByTimeAsync(100)

			expect(mockProvider.send).toHaveBeenCalledWith(message)
		})
	})

	describe('Event Handlers', () => {
		it('should register and trigger event handlers', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})
			const handler = vi.fn()

			queue.on('job:added', handler)

			await queue.add(createTestMessage())

			expect(handler).toHaveBeenCalled()
		})

		it('should unregister event handlers', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})
			const handler = vi.fn()

			queue.on('job:added', handler)
			queue.off('job:added', handler)

			await queue.add(createTestMessage())

			expect(handler).not.toHaveBeenCalled()
		})
	})

	describe('Queue Options', () => {
		it('should use default options', async () => {
			const queue = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})
			const job = await queue.add(createTestMessage())

			expect(job.maxRetries).toBe(3) // Default max retries
		})

		it('should use custom max retries', async () => {
			const queue = createSQLiteQueue(
				mockProvider,
				{ backend: 'sqlite', databasePath: TEST_DB_PATH },
				{ maxRetries: 5 },
			)
			const job = await queue.add(createTestMessage())

			expect(job.maxRetries).toBe(5)
		})
	})

	describe('Persistence', () => {
		it('should persist jobs across queue instances', async () => {
			// Create first queue and add jobs
			const queue1 = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

			await queue1.add(createTestMessage())
			await queue1.add(createTestMessage())

			// Create second queue with same database
			const queue2 = createSQLiteQueue(mockProvider, {
				backend: 'sqlite',
				databasePath: TEST_DB_PATH,
			})

			const stats = await queue2.getStats()

			expect(stats.pending).toBe(2)
		})
	})

	describe('Monitoring Callbacks', () => {
		it('should call onProgress callback during batch processing', async () => {
			const onProgress = vi.fn()
			const queue = createSQLiteQueue(
				mockProvider,
				{ backend: 'sqlite', databasePath: TEST_DB_PATH },
				{ concurrency: 1, onProgress },
			)

			await queue.addBatch([createTestMessage(), createTestMessage()])
			queue.start()

			// Wait for processing
			await vi.advanceTimersByTimeAsync(500)

			expect(onProgress).toHaveBeenCalled()
		})

		it('should call onComplete callback when batch finishes', async () => {
			const onComplete = vi.fn()
			const queue = createSQLiteQueue(
				mockProvider,
				{ backend: 'sqlite', databasePath: TEST_DB_PATH },
				{ concurrency: 2, onComplete },
			)

			await queue.addBatch([createTestMessage(), createTestMessage()])
			queue.start()

			// Wait for processing to complete
			await vi.advanceTimersByTimeAsync(1000)

			expect(onComplete).toHaveBeenCalled()
		})
	})
})
