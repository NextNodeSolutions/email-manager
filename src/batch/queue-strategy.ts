/**
 * Queue batch strategy
 * Uses ephemeral SQLite queue for reliable batch processing with retries
 */

import { createEphemeralBatchQueue } from '../queue/ephemeral-batch-queue.js'
import type {
	BatchSendResult,
	EmailMessage,
	EmailProvider,
	QueueBatchOptions,
} from '../types/index.js'
import { emailFail } from '../types/index.js'
import { getErrorMessage } from '../utils/index.js'

/**
 * Send batch using ephemeral queue strategy
 *
 * Features:
 * - SQLite-backed queue (recoverable)
 * - Retry with exponential backoff
 * - Progress callbacks
 * - Rate limiting per email
 *
 * @param messages - Email messages to send
 * @param options - Queue batch options
 * @param provider - Email provider
 * @returns Batch send result
 */
export const sendBatchWithQueue = async (
	messages: EmailMessage[],
	options: QueueBatchOptions,
	provider: EmailProvider,
): Promise<BatchSendResult> => {
	const batchQueue = createEphemeralBatchQueue(provider, options)

	try {
		await batchQueue.addBatch(messages)
		batchQueue.start()

		const summary = await batchQueue.waitForCompletion(options.timeout)

		return {
			success: true,
			data: {
				total: summary.totalSent + summary.totalFailed,
				successful: summary.totalSent,
				failed: summary.totalFailed,
				durationMs: summary.durationMs,
			},
		}
	} catch (error) {
		return emailFail(
			'PROVIDER_ERROR',
			getErrorMessage(error),
			error instanceof Error ? { cause: error } : undefined,
		)
	} finally {
		await batchQueue.destroy()
	}
}
