/**
 * Batch strategy dispatcher
 * Routes batch sends to the appropriate strategy based on mode
 */

import type {
	BatchOptions,
	BatchSendResult,
	EmailMessage,
	EmailProvider,
	NativeBatchOptions,
	QueueBatchOptions,
} from '../types/index.js'
import { sendBatchNative } from './native-strategy.js'
import { sendBatchWithQueue } from './queue-strategy.js'

/**
 * Dispatch batch send to the appropriate strategy
 *
 * @param messages - Email messages to send
 * @param options - Batch options (mode determines strategy)
 * @param provider - Email provider
 * @returns Batch send result
 */
export const dispatchBatchStrategy = async (
	messages: EmailMessage[],
	options: BatchOptions,
	provider: EmailProvider,
): Promise<BatchSendResult> => {
	const mode = options.mode ?? 'queue' // intentional fallback: default to reliable queue mode

	switch (mode) {
		case 'native':
			return sendBatchNative(
				messages,
				options as NativeBatchOptions,
				provider,
			)
		case 'queue':
			return sendBatchWithQueue(
				messages,
				options as QueueBatchOptions,
				provider,
			)
	}
}
