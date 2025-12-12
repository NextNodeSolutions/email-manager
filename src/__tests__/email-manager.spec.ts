/**
 * Email Manager integration tests
 * Tests for the main EmailManager facade
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createEmailManager } from '../email-manager.js'

import type { EmailMessage, TemplatedEmailMessage } from '../types/index.js'

// Mock Resend
vi.mock('resend', () => ({
	Resend: vi.fn().mockImplementation(() => ({
		emails: {
			send: vi.fn().mockResolvedValue({
				data: { id: 'msg_123' },
				error: null,
			}),
		},
		batch: {
			send: vi.fn().mockResolvedValue({
				data: { data: [{ id: 'msg_1' }, { id: 'msg_2' }] },
				error: null,
			}),
		},
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

// Mock template renderer
vi.mock('../templates/renderer.js', () => ({
	renderTemplate: vi.fn().mockResolvedValue({
		html: '<h1>Rendered Template</h1>',
		text: 'Rendered Template',
	}),
}))

describe('EmailManager', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('createEmailManager', () => {
		it('should create email manager with default config', () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			expect(manager).toBeDefined()
			expect(manager.provider).toBeDefined()
			expect(manager.queue).toBeDefined()
		})

		it('should create email manager without queue', () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
				queue: false,
			})

			expect(manager.queue).toBeNull()
		})

		it('should create email manager with custom queue options', () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
				queue: { maxRetries: 5, rateLimit: 20 },
			})

			expect(manager.queue).toBeDefined()
		})
	})

	describe('send', () => {
		it('should send email directly', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			const message: EmailMessage = {
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			const result = await manager.send(message)

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.id).toBe('msg_123')
			}
		})

		it('should apply default from address', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
				defaultFrom: 'noreply@myapp.com',
			})

			const message: EmailMessage = {
				from: undefined as never, // Will be filled by default
				to: 'recipient@example.com',
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			const result = await manager.send(message)

			expect(result.success).toBe(true)
		})

		it('should send via queue when useQueue option is true', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			const message: EmailMessage = {
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			const result = await manager.send(message, { useQueue: true })

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.id).toBeDefined()
			}
		})
	})

	describe('sendTemplate', () => {
		it('should render and send template email', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			// Mock template component
			const MockTemplate = ({ name }: { name: string }): string =>
				`Hello ${name}`

			const message: TemplatedEmailMessage<{ name: string }> = {
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Welcome!',
				template: MockTemplate as never,
				props: { name: 'John' },
			}

			const result = await manager.sendTemplate(message)

			expect(result.success).toBe(true)
		})
	})

	describe('sendBatch', () => {
		it('should send batch of emails', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			const messages: EmailMessage[] = [
				{
					from: 'sender@example.com',
					to: 'user1@example.com',
					subject: 'Email 1',
					html: '<h1>Hello 1</h1>',
				},
				{
					from: 'sender@example.com',
					to: 'user2@example.com',
					subject: 'Email 2',
					html: '<h1>Hello 2</h1>',
				},
			]

			const result = await manager.sendBatch(messages)

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.total).toBe(2)
			}
		})

		it('should send batch via queue when useQueue option is true', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			const messages: EmailMessage[] = [
				{
					from: 'sender@example.com',
					to: 'user1@example.com',
					subject: 'Email 1',
					html: '<h1>Hello 1</h1>',
				},
			]

			const result = await manager.sendBatch(messages, { useQueue: true })

			expect(result.success).toBe(true)
		})
	})

	describe('Queue Management', () => {
		it('should enqueue email', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			const message: EmailMessage = {
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			const job = await manager.enqueue(message)

			expect(job.id).toBeDefined()
			expect(job.status).toBe('pending')
		})

		it('should enqueue with scheduled time', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			const message: EmailMessage = {
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			const futureDate = new Date(Date.now() + 60000)
			const job = await manager.enqueue(message, futureDate)

			expect(job.scheduledFor).toEqual(futureDate)
		})

		it('should throw when enqueue called without queue', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
				queue: false,
			})

			const message: EmailMessage = {
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			await expect(manager.enqueue(message)).rejects.toThrow(
				'Queue is not enabled',
			)
		})

		it('should start and stop queue', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			manager.startQueue()
			await manager.stopQueue()

			// Should not throw
			expect(true).toBe(true)
		})

		it('should throw when startQueue called without queue', () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
				queue: false,
			})

			expect(() => manager.startQueue()).toThrow('Queue is not enabled')
		})
	})

	describe('validateConfig', () => {
		it('should validate provider config', async () => {
			const manager = createEmailManager({
				provider: 'resend',
				providerConfig: { apiKey: 'test-key' },
			})

			const isValid = await manager.validateConfig()

			expect(typeof isValid).toBe('boolean')
		})
	})
})
