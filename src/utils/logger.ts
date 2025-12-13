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
