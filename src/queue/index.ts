/**
 * Queue factory
 * Creates queue instances based on backend configuration
 */

import type { EmailProvider, EmailQueue, QueueOptions } from '../types/index.js'
import { createMemoryQueue } from './memory-queue.js'
import { createSQLiteQueue } from './sqlite-queue.js'

/**
 * Create an email queue with the specified backend
 *
 * @param provider - Email provider for sending emails
 * @param options - Queue configuration options
 * @returns EmailQueue instance
 *
 * @example
 * ```typescript
 * // Memory queue (default)
 * const queue = createQueue(provider, { maxRetries: 3 })
 *
 * // SQLite queue (persistent)
 * const queue = createQueue(provider, {
 *   maxRetries: 5,
 *   backendConfig: {
 *     backend: 'sqlite',
 *     databasePath: './data/queue.db'
 *   }
 * })
 * ```
 */
export const createQueue = (
	provider: EmailProvider,
	options: QueueOptions = {},
): EmailQueue => {
	const backendConfig = options.backendConfig ?? { backend: 'memory' }

	switch (backendConfig.backend) {
		case 'sqlite':
			return createSQLiteQueue(provider, backendConfig, options)
		default:
			return createMemoryQueue(provider, options)
	}
}

export {
	type BatchOptions,
	createEphemeralBatchQueue,
	type EphemeralBatchQueue,
} from './ephemeral-batch-queue.js'
