/**
 * Logger utility for @nextnode/email-manager
 * Centralized logging with @nextnode/logger
 */

import { createLogger } from '@nextnode/logger'

/** Main library logger */
export const logger = createLogger()

/** Provider operations logger */
export const providerLogger = createLogger({
	prefix: 'PROVIDER',
})

/** Queue operations logger */
export const queueLogger = createLogger({
	prefix: 'QUEUE',
})

/** Webhook operations logger */
export const webhookLogger = createLogger({
	prefix: 'WEBHOOK',
})

/** Template rendering logger */
export const templateLogger = createLogger({
	prefix: 'TEMPLATE',
})

/**
 * Log helper for debugging complex objects
 * @param label - Label for the log entry
 * @param data - Data to log
 */
export const logDebug = (label: string, data: unknown): void => {
	logger.info(`[DEBUG] ${label}`, { details: data })
}

/**
 * Log helper for provider API responses
 * @param method - HTTP method
 * @param endpoint - API endpoint
 * @param status - Response status
 * @param data - Response data
 */
export const logProviderResponse = (
	method: string,
	endpoint: string,
	status: number,
	data?: unknown,
): void => {
	const responseDetails = data ? { status, data } : { status }
	providerLogger.info(`${method.toUpperCase()} ${endpoint}`, {
		status,
		details: responseDetails,
	})
}

/**
 * Log helper for errors with context
 * @param error - Error object or message
 * @param context - Additional context
 */
export const logError = (
	error: unknown,
	context?: Record<string, unknown>,
): void => {
	const errorMessage = error instanceof Error ? error.message : String(error)
	const errorStack = error instanceof Error ? error.stack : undefined

	const errorDetails: Record<string, unknown> = { error: errorMessage }
	if (errorStack) errorDetails.stack = errorStack
	if (context) errorDetails.context = context

	logger.error('Operation failed', { details: errorDetails })
}
