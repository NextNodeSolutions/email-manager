/**
 * Resend email provider
 * Implementation of EmailProvider interface for Resend
 */

import { createProviderUtils } from './base.js'

import type { Resend, CreateEmailOptions, CreateBatchOptions } from 'resend'
import type {
	EmailMessage,
	EmailProvider,
	ProviderConfig,
	SendResult,
	BatchSendResult,
	EmailError,
} from '../types/index.js'

/**
 * Resend email payload type (simplified for our use case)
 * We always use html/text content, never templates
 */
interface ResendEmailPayload {
	from: string
	to: string[]
	subject: string
	html?: string
	text?: string
	cc?: string[]
	bcc?: string[]
	replyTo?: string[]
	attachments?: Array<{ filename: string; content: string | Buffer }>
	headers?: Record<string, string>
	tags?: Array<{ name: string; value: string }>
	scheduledAt?: string
}

/**
 * Resend-specific configuration
 */
export interface ResendProviderConfig extends ProviderConfig {
	/** Default from address */
	defaultFrom?: string
}

/**
 * Map internal error to EmailError
 */
const mapResendError = (error: unknown): EmailError => {
	if (error instanceof Error) {
		const message = error.message.toLowerCase()

		if (message.includes('rate limit')) {
			return {
				code: 'RATE_LIMIT_ERROR',
				message: 'Rate limit exceeded',
				cause: error,
			}
		}
		if (message.includes('unauthorized') || message.includes('api key')) {
			return {
				code: 'AUTHENTICATION_ERROR',
				message: 'Invalid API key',
				cause: error,
			}
		}
		if (message.includes('validation')) {
			return {
				code: 'VALIDATION_ERROR',
				message: error.message,
				cause: error,
			}
		}

		return {
			code: 'PROVIDER_ERROR',
			message: error.message,
			cause: error,
		}
	}

	return {
		code: 'UNKNOWN_ERROR',
		message: 'An unknown error occurred',
		providerError: { raw: error },
	}
}

/**
 * Create Resend email provider
 */
export const createResendProvider = (
	resendClient: Resend,
	config: ResendProviderConfig,
): EmailProvider => {
	const utils = createProviderUtils({
		...config,
		name: 'resend',
		maxBatchSize: 100, // Resend batch limit
	})

	/**
	 * Map EmailMessage to Resend payload
	 */
	const mapToResendPayload = (message: EmailMessage): ResendEmailPayload => {
		const payload: ResendEmailPayload = {
			from: utils.normalizeRecipient(message.from),
			to: utils.normalizeRecipients(message.to),
			subject: message.subject,
		}

		if (message.cc) {
			payload.cc = utils.normalizeRecipients(message.cc)
		}
		if (message.bcc) {
			payload.bcc = utils.normalizeRecipients(message.bcc)
		}
		if (message.replyTo) {
			payload.replyTo = utils.normalizeRecipients(message.replyTo)
		}
		if (message.html) {
			payload.html = message.html
		}
		if (message.text) {
			payload.text = message.text
		}
		if (message.attachments) {
			payload.attachments = message.attachments.map(a => ({
				filename: a.filename,
				content: a.content,
			}))
		}
		if (message.headers) {
			payload.headers = Object.fromEntries(
				message.headers.map(h => [h.name, h.value]),
			)
		}
		if (message.tags) {
			payload.tags = message.tags.map(t => ({
				name: t.name,
				value: t.value,
			}))
		}
		if (message.scheduledAt) {
			payload.scheduledAt =
				message.scheduledAt instanceof Date
					? message.scheduledAt.toISOString()
					: message.scheduledAt
		}

		return payload
	}

	return {
		name: 'resend',

		async send(message: EmailMessage): Promise<SendResult> {
			utils.validateMessage(message)

			try {
				const payload = mapToResendPayload(message)
				// Type assertion needed due to Resend's complex union type
				const { data, error } = await resendClient.emails.send(
					payload as CreateEmailOptions,
				)

				if (error) {
					return {
						success: false,
						error: mapResendError(new Error(error.message)),
					}
				}

				if (!data) {
					return {
						success: false,
						error: {
							code: 'PROVIDER_ERROR',
							message: 'No data returned from Resend',
						},
					}
				}

				return {
					success: true,
					data: {
						id: data.id,
						provider: 'resend',
						sentAt: new Date(),
					},
				}
			} catch (error) {
				return {
					success: false,
					error: mapResendError(error),
				}
			}
		},

		async sendBatch(messages: EmailMessage[]): Promise<BatchSendResult> {
			if (messages.length > utils.maxBatchSize) {
				return {
					success: false,
					error: {
						code: 'VALIDATION_ERROR',
						message: `Batch size ${messages.length} exceeds maximum ${utils.maxBatchSize}`,
					},
				}
			}

			if (messages.length === 0) {
				return {
					success: true,
					data: {
						total: 0,
						successful: 0,
						failed: 0,
						results: [],
					},
				}
			}

			// Validate all messages first
			for (const message of messages) {
				try {
					utils.validateMessage(message)
				} catch (error) {
					return {
						success: false,
						error: mapResendError(error),
					}
				}
			}

			try {
				const payloads = messages.map(mapToResendPayload)
				// Type assertion needed due to Resend's complex union type
				const { data, error } = await resendClient.batch.send(
					payloads as CreateBatchOptions,
				)

				if (error) {
					return {
						success: false,
						error: mapResendError(new Error(error.message)),
					}
				}

				if (!data) {
					return {
						success: false,
						error: {
							code: 'PROVIDER_ERROR',
							message: 'No data returned from Resend batch',
						},
					}
				}

				const results = data.data.map((result, index) => {
					const message = messages[index]
					const recipient = message
						? (utils.normalizeRecipients(message.to)[0] ?? '')
						: ''

					return {
						index,
						recipient,
						result: {
							success: true as const,
							data: {
								id: result.id,
								provider: 'resend',
								sentAt: new Date(),
							},
						},
					}
				})

				return {
					success: true,
					data: {
						total: messages.length,
						successful: results.length,
						failed: 0,
						results,
					},
				}
			} catch (error) {
				return {
					success: false,
					error: mapResendError(error),
				}
			}
		},

		async validateConfig(): Promise<boolean> {
			try {
				// Use domains list as a validation check
				await resendClient.domains.list()
				return true
			} catch {
				return false
			}
		},
	}
}
