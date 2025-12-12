/**
 * Webhook tests
 * Tests for webhook handler and parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

import {
	verifyWebhookSignature,
	parseWebhookPayload,
	isValidEventType,
} from '../webhooks/parser.js'
import { createWebhookHandler } from '../webhooks/handler.js'

const TEST_SECRET = 'test-webhook-secret'

// Helper to create valid signature
const createSignature = (
	body: string,
	timestamp: number = Math.floor(Date.now() / 1000),
): string => {
	const signedPayload = `${timestamp}.${body}`
	const sig = createHmac('sha256', TEST_SECRET)
		.update(signedPayload)
		.digest('hex')
	return `v1,${timestamp},${sig}`
}

describe('Webhook Parser', () => {
	describe('verifyWebhookSignature', () => {
		it('should verify valid signature', () => {
			const body = JSON.stringify({ type: 'email.sent', data: {} })
			const signature = createSignature(body)

			const result = verifyWebhookSignature({
				secret: TEST_SECRET,
				signature,
				body,
			})

			expect(result.success).toBe(true)
		})

		it('should reject invalid signature format', () => {
			const body = JSON.stringify({ type: 'email.sent', data: {} })

			const result = verifyWebhookSignature({
				secret: TEST_SECRET,
				signature: 'invalid-signature',
				body,
			})

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.code).toBe('INVALID_SIGNATURE')
			}
		})

		it('should reject wrong version', () => {
			const body = JSON.stringify({ type: 'email.sent', data: {} })

			const result = verifyWebhookSignature({
				secret: TEST_SECRET,
				signature: 'v2,123,abc',
				body,
			})

			expect(result.success).toBe(false)
		})

		it('should reject expired timestamp', () => {
			const body = JSON.stringify({ type: 'email.sent', data: {} })
			const oldTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 minutes ago
			const signature = createSignature(body, oldTimestamp)

			const result = verifyWebhookSignature({
				secret: TEST_SECRET,
				signature,
				body,
				tolerance: 300, // 5 minutes
			})

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.code).toBe('EXPIRED_TIMESTAMP')
			}
		})

		it('should reject signature mismatch', () => {
			const body = JSON.stringify({ type: 'email.sent', data: {} })
			const signature = createSignature(body)

			const result = verifyWebhookSignature({
				secret: 'wrong-secret',
				signature,
				body,
			})

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.code).toBe('INVALID_SIGNATURE')
			}
		})
	})

	describe('parseWebhookPayload', () => {
		it('should parse valid email.sent event', () => {
			const payload = {
				type: 'email.sent',
				created_at: '2025-01-01T00:00:00Z',
				data: {
					email_id: 'msg_123',
					from: 'sender@example.com',
					to: ['recipient@example.com'],
					subject: 'Test',
				},
			}

			const result = parseWebhookPayload(JSON.stringify(payload))

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.type).toBe('email.sent')
			}
		})

		it('should parse valid email.delivered event', () => {
			const payload = {
				type: 'email.delivered',
				created_at: '2025-01-01T00:00:00Z',
				data: {
					email_id: 'msg_123',
					from: 'sender@example.com',
					to: ['recipient@example.com'],
					subject: 'Test',
				},
			}

			const result = parseWebhookPayload(JSON.stringify(payload))

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.type).toBe('email.delivered')
			}
		})

		it('should parse valid email.bounced event', () => {
			const payload = {
				type: 'email.bounced',
				created_at: '2025-01-01T00:00:00Z',
				data: {
					email_id: 'msg_123',
					from: 'sender@example.com',
					to: ['recipient@example.com'],
					subject: 'Test',
					bounce: { type: 'hard' },
				},
			}

			const result = parseWebhookPayload(JSON.stringify(payload))

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.type).toBe('email.bounced')
			}
		})

		it('should reject invalid JSON', () => {
			const result = parseWebhookPayload('invalid json')

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.code).toBe('PARSE_ERROR')
			}
		})

		it('should reject missing required fields', () => {
			const result = parseWebhookPayload(
				JSON.stringify({ type: 'email.sent' }),
			)

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.code).toBe('INVALID_PAYLOAD')
			}
		})

		it('should reject unknown event type', () => {
			const payload = {
				type: 'unknown.event',
				created_at: '2025-01-01T00:00:00Z',
				data: {},
			}

			const result = parseWebhookPayload(JSON.stringify(payload))

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.code).toBe('INVALID_PAYLOAD')
			}
		})
	})

	describe('isValidEventType', () => {
		it('should return true for valid event types', () => {
			expect(isValidEventType('email.sent')).toBe(true)
			expect(isValidEventType('email.delivered')).toBe(true)
			expect(isValidEventType('email.bounced')).toBe(true)
			expect(isValidEventType('email.complained')).toBe(true)
			expect(isValidEventType('email.opened')).toBe(true)
			expect(isValidEventType('email.clicked')).toBe(true)
		})

		it('should return false for invalid event types', () => {
			expect(isValidEventType('invalid')).toBe(false)
			expect(isValidEventType('email.unknown')).toBe(false)
		})
	})
})

describe('Webhook Handler', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('createWebhookHandler', () => {
		it('should create handler instance', () => {
			const handler = createWebhookHandler({ secret: TEST_SECRET })

			expect(handler).toBeDefined()
			expect(handler.on).toBeDefined()
			expect(handler.off).toBeDefined()
			expect(handler.process).toBeDefined()
		})

		it('should register event handlers', () => {
			const handler = createWebhookHandler({ secret: TEST_SECRET })

			handler.on('email.delivered', async () => {})

			expect(handler.hasHandler('email.delivered')).toBe(true)
			expect(handler.getRegisteredEvents()).toContain('email.delivered')
		})

		it('should unregister event handlers', () => {
			const handler = createWebhookHandler({ secret: TEST_SECRET })

			handler.on('email.delivered', async () => {})
			handler.off('email.delivered')

			expect(handler.hasHandler('email.delivered')).toBe(false)
		})

		it('should process webhook with valid signature', async () => {
			const eventHandler = vi.fn()
			const handler = createWebhookHandler({
				secret: TEST_SECRET,
				verifySignature: true,
			})

			handler.on('email.delivered', eventHandler)

			const payload = {
				type: 'email.delivered',
				created_at: '2025-01-01T00:00:00Z',
				data: {
					email_id: 'msg_123',
					from: 'sender@example.com',
					to: ['recipient@example.com'],
					subject: 'Test',
				},
			}
			const body = JSON.stringify(payload)
			const signature = createSignature(body)

			const result = await handler.process(body, signature)

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.processed).toBe(true)
			}
			expect(eventHandler).toHaveBeenCalled()
		})

		it('should reject missing signature when verification enabled', async () => {
			const handler = createWebhookHandler({
				secret: TEST_SECRET,
				verifySignature: true,
			})

			const payload = {
				type: 'email.delivered',
				created_at: '2025-01-01T00:00:00Z',
				data: {},
			}

			const result = await handler.process(JSON.stringify(payload))

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.code).toBe('INVALID_SIGNATURE')
			}
		})

		it('should skip signature verification when disabled', async () => {
			const handler = createWebhookHandler({
				secret: TEST_SECRET,
				verifySignature: false,
			})

			handler.on('email.delivered', async () => {})

			const payload = {
				type: 'email.delivered',
				created_at: '2025-01-01T00:00:00Z',
				data: {
					email_id: 'msg_123',
					from: 'sender@example.com',
					to: ['recipient@example.com'],
					subject: 'Test',
				},
			}

			const result = await handler.process(JSON.stringify(payload))

			expect(result.success).toBe(true)
		})

		it('should return processed=false for unhandled events', async () => {
			const handler = createWebhookHandler({
				secret: TEST_SECRET,
				verifySignature: false,
			})

			const payload = {
				type: 'email.clicked',
				created_at: '2025-01-01T00:00:00Z',
				data: {
					email_id: 'msg_123',
					from: 'sender@example.com',
					to: ['recipient@example.com'],
					subject: 'Test',
					click: { link: 'https://example.com' },
				},
			}

			const result = await handler.process(JSON.stringify(payload))

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.processed).toBe(false)
			}
		})

		it('should handle errors in event handlers', async () => {
			const handler = createWebhookHandler({
				secret: TEST_SECRET,
				verifySignature: false,
			})

			handler.on('email.delivered', async () => {
				throw new Error('Handler error')
			})

			const payload = {
				type: 'email.delivered',
				created_at: '2025-01-01T00:00:00Z',
				data: {
					email_id: 'msg_123',
					from: 'sender@example.com',
					to: ['recipient@example.com'],
					subject: 'Test',
				},
			}

			const result = await handler.process(JSON.stringify(payload))

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.message).toBe('Handler error')
			}
		})
	})
})
