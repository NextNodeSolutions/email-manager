/**
 * Resend email provider
 * Implementation of EmailProvider interface for Resend
 */

import type { CreateBatchOptions, CreateEmailOptions, Resend } from 'resend'

import type {
	BatchSendResult,
	EmailError,
	EmailMessage,
	EmailProvider,
	ProviderConfig,
	SendResult,
} from '../types/index.js'
import { createProviderUtils } from './base.js'

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
	 * Map optional recipients (cc, bcc, replyTo)
	 */
	const mapOptionalRecipients = (
		message: EmailMessage,
	): Pick<ResendEmailPayload, 'cc' | 'bcc' | 'replyTo'> => ({
		...(message.cc && { cc: utils.normalizeRecipients(message.cc) }),
		...(message.bcc && { bcc: utils.normalizeRecipients(message.bcc) }),
		...(message.replyTo && {
			replyTo: utils.normalizeRecipients(message.replyTo),
		}),
	})

	/**
	 * Map optional content fields (html, text, attachments)
	 */
	const mapOptionalContent = (
		message: EmailMessage,
	): Pick<ResendEmailPayload, 'html' | 'text' | 'attachments'> => ({
		...(message.html && { html: message.html }),
		...(message.text && { text: message.text }),
		...(message.attachments && {
			attachments: message.attachments.map(a => ({
				filename: a.filename,
				content: a.content,
			})),
		}),
	})

	/**
	 * Map optional metadata (headers, tags, scheduledAt)
	 */
	const mapOptionalMetadata = (
		message: EmailMessage,
	): Pick<ResendEmailPayload, 'headers' | 'tags' | 'scheduledAt'> => ({
		...(message.headers && {
			headers: Object.fromEntries(
				message.headers.map(h => [h.name, h.value]),
			),
		}),
		...(message.tags && {
			tags: message.tags.map(t => ({ name: t.name, value: t.value })),
		}),
		...(message.scheduledAt && {
			scheduledAt:
				message.scheduledAt instanceof Date
					? message.scheduledAt.toISOString()
					: message.scheduledAt,
		}),
	})

	/**
	 * Map EmailMessage to Resend payload
	 */
	const mapToResendPayload = (message: EmailMessage): ResendEmailPayload => ({
		from: utils.normalizeRecipient(message.from),
		to: utils.normalizeRecipients(message.to),
		subject: message.subject,
		...mapOptionalRecipients(message),
		...mapOptionalContent(message),
		...mapOptionalMetadata(message),
	})

	return {
		name: 'resend',

		async send(message: EmailMessage): Promise<SendResult> {
			const validation = utils.validateMessage(message)
			if (!validation.success) {
				return validation
			}

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
						durationMs: 0,
						results: [],
					},
				}
			}

			// Validate all messages first
			for (const message of messages) {
				const validation = utils.validateMessage(message)
				if (!validation.success) {
					return validation
				}
			}

			const startTime = Date.now()

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
						? utils.normalizeRecipients(message.to)[0]
						: undefined

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
						durationMs: Date.now() - startTime,
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
