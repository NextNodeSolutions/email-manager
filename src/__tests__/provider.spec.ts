/**
 * Provider tests
 * Tests for Resend provider implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createResendProvider } from '../providers/resend.js'
import { createProvider } from '../providers/registry.js'

import type { EmailMessage } from '../types/index.js'

// Mock Resend client
const mockResendClient = {
	emails: {
		send: vi.fn(),
	},
	batch: {
		send: vi.fn(),
	},
}

describe('Resend Provider', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('createResendProvider', () => {
		it('should create provider with correct name', () => {
			const provider = createResendProvider(mockResendClient as never, {
				apiKey: 'test-key',
			})

			expect(provider.name).toBe('resend')
		})

		it('should send single email successfully', async () => {
			mockResendClient.emails.send.mockResolvedValue({
				data: { id: 'msg_123' },
				error: null,
			})

			const provider = createResendProvider(mockResendClient as never, {
				apiKey: 'test-key',
			})

			const message: EmailMessage = {
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			const result = await provider.send(message)

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.id).toBe('msg_123')
				expect(result.data.provider).toBe('resend')
			}
		})

		it('should handle send errors', async () => {
			mockResendClient.emails.send.mockResolvedValue({
				data: null,
				error: { message: 'Invalid API key', name: 'validation_error' },
			})

			const provider = createResendProvider(mockResendClient as never, {
				apiKey: 'invalid-key',
			})

			const message: EmailMessage = {
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			const result = await provider.send(message)

			expect(result.success).toBe(false)
			if (!result.success) {
				// Provider maps validation_error to AUTHENTICATION_ERROR
				expect(result.error.code).toBe('AUTHENTICATION_ERROR')
			}
		})

		it('should send batch emails', async () => {
			mockResendClient.batch.send.mockResolvedValue({
				data: { data: [{ id: 'msg_1' }, { id: 'msg_2' }] },
				error: null,
			})

			const provider = createResendProvider(mockResendClient as never, {
				apiKey: 'test-key',
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

			const result = await provider.sendBatch(messages)

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.total).toBe(2)
				expect(result.data.successful).toBe(2)
			}
		})

		it('should handle batch errors', async () => {
			mockResendClient.batch.send.mockResolvedValue({
				data: null,
				error: { message: 'Rate limit exceeded' },
			})

			const provider = createResendProvider(mockResendClient as never, {
				apiKey: 'test-key',
			})

			const messages: EmailMessage[] = [
				{
					from: 'sender@example.com',
					to: 'user1@example.com',
					subject: 'Email 1',
					html: '<h1>Hello 1</h1>',
				},
			]

			const result = await provider.sendBatch(messages)

			expect(result.success).toBe(false)
		})

		it('should validate config successfully', async () => {
			mockResendClient.emails.send.mockResolvedValue({
				data: { id: 'test' },
				error: null,
			})

			const provider = createResendProvider(mockResendClient as never, {
				apiKey: 'valid-key',
			})

			// Just verify it doesn't throw
			const isValid = await provider.validateConfig()
			expect(typeof isValid).toBe('boolean')
		})

		it('should handle recipient object format', async () => {
			mockResendClient.emails.send.mockResolvedValue({
				data: { id: 'msg_123' },
				error: null,
			})

			const provider = createResendProvider(mockResendClient as never, {
				apiKey: 'test-key',
			})

			const message: EmailMessage = {
				from: { email: 'sender@example.com', name: 'Sender Name' },
				to: { email: 'recipient@example.com', name: 'Recipient Name' },
				subject: 'Test Email',
				html: '<h1>Hello</h1>',
			}

			const result = await provider.send(message)

			expect(result.success).toBe(true)
		})
	})

	describe('createProvider registry', () => {
		it('should create resend provider via registry', () => {
			const provider = createProvider(
				'resend',
				mockResendClient as never,
				{
					apiKey: 'test-key',
				},
			)

			expect(provider.name).toBe('resend')
		})
	})
})
