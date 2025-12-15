/**
 * Shared test utilities
 * Common test helpers used across queue tests
 */

import { vi } from 'vitest'

import type { EmailMessage, EmailProvider } from '../../types/index.js'

/**
 * Create a mock email provider for testing
 *
 * @param sendResult - Optional custom send result
 * @returns Mock provider with all methods stubbed
 */
export const createMockProvider = (
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

/**
 * Create a test email message with optional overrides
 *
 * @param overrides - Optional partial message to merge
 * @returns Complete test email message
 */
export const createTestMessage = (
	overrides: Partial<EmailMessage> = {},
): EmailMessage => ({
	from: 'sender@example.com',
	to: 'recipient@example.com',
	subject: 'Test Email',
	html: '<h1>Hello</h1>',
	...overrides,
})
