/**
 * Logger functionality tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
	logger,
	providerLogger,
	queueLogger,
	webhookLogger,
	templateLogger,
	logDebug,
	logProviderResponse,
	logError,
} from '../utils/logger.js'

// Mock @nextnode/logger
vi.mock('@nextnode/logger', () => ({
	createLogger: vi.fn(
		(): { info: () => void; warn: () => void; error: () => void } => ({
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}),
	),
}))

describe('Logger Utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('Logger instances', () => {
		it('should create main logger', () => {
			expect(logger).toBeDefined()
			expect(logger.info).toBeDefined()
			expect(logger.warn).toBeDefined()
			expect(logger.error).toBeDefined()
		})

		it('should create specialized loggers', () => {
			expect(providerLogger).toBeDefined()
			expect(queueLogger).toBeDefined()
			expect(webhookLogger).toBeDefined()
			expect(templateLogger).toBeDefined()
		})
	})

	describe('logDebug', () => {
		it('should log debug information', () => {
			const testData = { key: 'value', number: 42 }

			logDebug('Test debug', testData)

			expect(logger.info).toHaveBeenCalledWith('[DEBUG] Test debug', {
				details: testData,
			})
		})

		it('should handle complex objects', () => {
			const complexData = {
				nested: { array: [1, 2, 3], string: 'test' },
				func: (): string => 'test',
			}

			logDebug('Complex object', complexData)

			expect(logger.info).toHaveBeenCalledWith('[DEBUG] Complex object', {
				details: complexData,
			})
		})
	})

	describe('logProviderResponse', () => {
		it('should log provider response without data', () => {
			logProviderResponse('get', '/emails', 200)

			expect(providerLogger.info).toHaveBeenCalledWith('GET /emails', {
				status: 200,
				details: { status: 200 },
			})
		})

		it('should log provider response with data', () => {
			const responseData = { id: 'msg_123', status: 'sent' }

			logProviderResponse('post', '/emails', 201, responseData)

			expect(providerLogger.info).toHaveBeenCalledWith('POST /emails', {
				status: 201,
				details: { status: 201, data: responseData },
			})
		})

		it('should handle different HTTP methods', () => {
			logProviderResponse('delete', '/emails/123', 204)

			expect(providerLogger.info).toHaveBeenCalledWith(
				'DELETE /emails/123',
				{
					status: 204,
					details: { status: 204 },
				},
			)
		})
	})

	describe('logError', () => {
		it('should log Error objects with stack trace', () => {
			const error = new Error('Test error')
			const context = { userId: 123, action: 'test' }

			logError(error, context)

			expect(logger.error).toHaveBeenCalledWith('Operation failed', {
				details: {
					error: 'Test error',
					stack: error.stack,
					context,
				},
			})
		})

		it('should log string errors', () => {
			const errorMessage = 'Simple error string'

			logError(errorMessage)

			expect(logger.error).toHaveBeenCalledWith('Operation failed', {
				details: {
					error: errorMessage,
				},
			})
		})

		it('should log unknown error types', () => {
			const unknownError = {
				code: 'UNKNOWN',
				details: 'Something went wrong',
			}

			logError(unknownError)

			expect(logger.error).toHaveBeenCalledWith('Operation failed', {
				details: {
					error: '[object Object]',
				},
			})
		})

		it('should handle error without context', () => {
			const error = new Error('No context error')

			logError(error)

			expect(logger.error).toHaveBeenCalledWith('Operation failed', {
				details: {
					error: 'No context error',
					stack: error.stack,
				},
			})
		})
	})
})
