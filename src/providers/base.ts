/**
 * Base provider utilities
 * Shared functionality for all email providers (composition pattern)
 */

import type {
	EmailMessage,
	EmailRecipient,
	ProviderConfig,
} from '../types/index.js'

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
	validateMessage: (message: EmailMessage) => void
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
 */
const validateMessage = (message: EmailMessage): void => {
	if (!message.from) {
		throw new Error('Missing required field: from')
	}
	if (!message.to) {
		throw new Error('Missing required field: to')
	}
	if (!message.subject) {
		throw new Error('Missing required field: subject')
	}
	if (!message.html && !message.text) {
		throw new Error('Either html or text content is required')
	}
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
