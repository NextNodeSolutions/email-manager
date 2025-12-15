/**
 * Base provider utilities
 * Shared functionality for all email providers (composition pattern)
 */

import type {
	EmailError,
	EmailMessage,
	EmailRecipient,
	ProviderConfig,
	Result,
} from '../types/index.js'
import { emailFail } from '../types/index.js'

/**
 * Base provider options
 */
export interface BaseProviderOptions extends ProviderConfig {
	/** Provider name */
	name: string
	/** Max batch size */
	maxBatchSize?: number
	/** Default timeout */
	defaultTimeout?: number
}

/**
 * Provider utilities returned by createProviderUtils
 */
export interface ProviderUtils {
	name: string
	maxBatchSize: number
	defaultTimeout: number
	normalizeRecipient: (recipient: EmailRecipient) => string
	normalizeRecipients: (
		recipients: EmailRecipient | EmailRecipient[],
	) => string[]
	validateMessage: (message: EmailMessage) => Result<void, EmailError>
}

/**
 * Normalize a recipient to string format
 */
const normalizeRecipient = (recipient: EmailRecipient): string => {
	if (typeof recipient === 'string') return recipient
	return recipient.name
		? `${recipient.name} <${recipient.email}>`
		: recipient.email
}

/**
 * Normalize recipients array
 */
const normalizeRecipients = (
	recipients: EmailRecipient | EmailRecipient[],
): string[] => {
	const arr = Array.isArray(recipients) ? recipients : [recipients]
	return arr.map(normalizeRecipient)
}

/**
 * Validate email message has required fields
 * Returns Result pattern for consistent error handling
 */
const validateMessage = (message: EmailMessage): Result<void, EmailError> => {
	const requiredChecks = [
		{ check: !message.from, msg: 'Missing required field: from' },
		{ check: !message.to, msg: 'Missing required field: to' },
		{ check: !message.subject, msg: 'Missing required field: subject' },
		{
			check: !message.html && !message.text,
			msg: 'Either html or text content is required',
		},
	]

	for (const { check, msg } of requiredChecks) {
		if (check) return emailFail('VALIDATION_ERROR', msg)
	}

	return { success: true, data: undefined }
}

/**
 * Create common provider utilities (composition helper)
 */
export const createProviderUtils = (
	options: BaseProviderOptions,
): ProviderUtils => {
	const { name, maxBatchSize = 100, defaultTimeout = 30000 } = options

	return {
		name,
		maxBatchSize,
		defaultTimeout,
		normalizeRecipient,
		normalizeRecipients,
		validateMessage,
	}
}
