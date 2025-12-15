/**
 * Native batch strategy
 * Uses provider's batch API directly for maximum throughput
 */

import { QUEUE_DEFAULTS, RESEND_MAX_BATCH_SIZE } from '../lib/constants.js'
import { createTokenBucket } from '../lib/rate-limiter.js'
import type {
	BatchSendResult,
	BatchSendSuccess,
	EmailMessage,
	EmailProvider,
	NativeBatchOptions,
	SendResult,
} from '../types/index.js'
import { chunkArray } from '../utils/index.js'

/**
 * Send batch using native provider API
 *
 * Features:
 * - Direct provider batch API (100 emails/request for Resend)
 * - Auto-chunking for large batches
 * - Rate limiting between chunks (2 requests/second default)
 * - Maximum throughput (~200 emails/second)
 *
 * Trade-offs:
 * - No retry logic
 * - No progress callbacks
 * - No persistence
 *
 * @param messages - Email messages to send
 * @param options - Native batch options
 * @param provider - Email provider
 * @returns Batch send result
 */
export const sendBatchNative = async (
	messages: EmailMessage[],
	options: NativeBatchOptions,
	provider: EmailProvider,
): Promise<BatchSendResult> => {
	const startTime = Date.now()
	const rateLimit = options.rateLimit ?? QUEUE_DEFAULTS.rateLimit
	const chunks = chunkArray(messages, RESEND_MAX_BATCH_SIZE)
	const rateLimiter = createTokenBucket({
		limit: rateLimit,
		burstCapacity: 1,
	})

	const allResults: NonNullable<BatchSendSuccess['results']> = []
	let successful = 0
	let failed = 0

	for (const [chunkIndex, chunk] of chunks.entries()) {
		await rateLimiter.acquire()
		const result = await provider.sendBatch(chunk)

		if (result.success) {
			const offset = chunkIndex * RESEND_MAX_BATCH_SIZE
			for (const r of result.data.results ?? []) {
				// intentional fallback: results is optional in BatchSendSuccess
				allResults.push({
					index: offset + r.index,
					recipient: r.recipient,
					result: r.result as SendResult,
				})
			}
			successful += result.data.successful
			failed += result.data.failed
		} else {
			// Entire chunk failed - add failed results for each message
			const offset = chunkIndex * RESEND_MAX_BATCH_SIZE
			for (let i = 0; i < chunk.length; i++) {
				allResults.push({
					index: offset + i,
					recipient: undefined,
					result: {
						success: false,
						error: result.error,
					},
				})
			}
			failed += chunk.length
		}
	}

	return {
		success: true,
		data: {
			total: messages.length,
			successful,
			failed,
			durationMs: Date.now() - startTime,
			results: allResults,
		},
	}
}
