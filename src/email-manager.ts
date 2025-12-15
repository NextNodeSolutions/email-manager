/**
 * Email Manager
 * Main facade for email operations - the primary public API
 */

import { Resend } from 'resend'

import { getGlobalRateLimiter } from './lib/rate-limiter.js'
import type { ProviderConfigMap } from './providers/registry.js'
import { createProvider } from './providers/registry.js'
import type { BatchOptions } from './queue/index.js'
import { createEphemeralBatchQueue, createQueue } from './queue/index.js'
import { renderTemplate } from './templates/renderer.js'
import type {
	BatchSendResult,
	EmailMessage,
	EmailProvider,
	EmailQueue,
	EmailTemplateComponent,
	QueueJob,
	QueueOptions,
	SendResult,
	TemplatedEmailMessage,
	TemplateRenderOptions,
} from './types/index.js'

/**
 * Email manager configuration
 */
export interface EmailManagerConfig<
	P extends keyof ProviderConfigMap = 'resend',
> {
	/** Provider name */
	provider: P
	/** Provider configuration */
	providerConfig: ProviderConfigMap[P]
	/** Queue configuration (false to disable) */
	queue?: QueueOptions | false
	/** Default from address */
	defaultFrom?: string
	/** Template render options */
	templateOptions?: TemplateRenderOptions
}

/**
 * Email manager send options (single email)
 */
export interface SendOptions {
	/** Use queue instead of direct send */
	useQueue?: boolean
	/** Schedule for later (if queued) */
	scheduledFor?: Date
}

/**
 * Email manager instance interface
 */
export interface EmailManager {
	/** Get the underlying provider */
	readonly provider: EmailProvider
	/** Get the queue (if enabled) */
	readonly queue: EmailQueue | null
	/** Send a single email */
	send: (message: EmailMessage, options?: SendOptions) => Promise<SendResult>
	/** Send email with React Email template */
	sendTemplate: <TProps>(
		message: TemplatedEmailMessage<TProps>,
		options?: SendOptions,
	) => Promise<SendResult>
	/** Send batch of emails using ephemeral queue */
	sendBatch: (
		messages: EmailMessage[],
		options?: BatchOptions,
	) => Promise<BatchSendResult>
	/** Add email to queue */
	enqueue: (message: EmailMessage, scheduledFor?: Date) => Promise<QueueJob>
	/** Start queue processing */
	startQueue: () => void
	/** Stop queue processing */
	stopQueue: () => Promise<void>
	/** Validate provider configuration */
	validateConfig: () => Promise<boolean>
}

/**
 * Create provider client based on provider name
 */
const createProviderClient = <P extends keyof ProviderConfigMap>(
	name: P,
	config: ProviderConfigMap[P],
): Resend => {
	switch (name) {
		case 'resend':
			return new Resend(config.apiKey)
		default:
			throw new Error(`Unknown provider: ${name}`)
	}
}

/**
 * Create an email manager instance
 *
 * @param config - Email manager configuration
 * @returns EmailManager instance
 *
 * @example
 * ```typescript
 * const emailManager = createEmailManager({
 *   provider: 'resend',
 *   providerConfig: { apiKey: process.env.RESEND_API_KEY },
 *   defaultFrom: 'noreply@myapp.com',
 *   queue: { maxRetries: 3, rateLimit: 10 }
 * })
 *
 * // Send simple email
 * await emailManager.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<h1>Welcome</h1>'
 * })
 *
 * // Send with template
 * await emailManager.sendTemplate({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   template: WelcomeEmail,
 *   props: { name: 'John' }
 * })
 *
 * // Queue for later
 * await emailManager.enqueue(email, new Date('2025-01-01'))
 * emailManager.startQueue()
 * ```
 */
export const createEmailManager = <P extends keyof ProviderConfigMap>(
	config: EmailManagerConfig<P>,
): EmailManager => {
	// Create provider client
	const client = createProviderClient(config.provider, config.providerConfig)

	// Create provider
	const provider = createProvider(
		config.provider,
		client,
		config.providerConfig,
	)

	// Create queue if enabled
	const queue =
		config.queue !== false
			? createQueue(provider, config.queue ?? {})
			: null

	/**
	 * Apply default values to message
	 */
	const applyDefaults = (message: EmailMessage): EmailMessage => {
		if (!config.defaultFrom) return message
		return {
			...message,
			from: message.from ?? config.defaultFrom,
		}
	}

	/**
	 * Render template to HTML
	 */
	const renderEmailTemplate = async <TProps>(
		template: EmailTemplateComponent<TProps>,
		props: TProps,
	): Promise<{ html: string; text?: string | undefined }> =>
		renderTemplate(template, props, config.templateOptions)

	const send = async (
		message: EmailMessage,
		options: SendOptions = {},
	): Promise<SendResult> => {
		const finalMessage = applyDefaults(message)

		if (options.useQueue && queue) {
			const job = await queue.add(finalMessage, {
				scheduledFor: options.scheduledFor,
			})

			return {
				success: true,
				data: {
					id: job.id,
					provider: provider.name,
					sentAt: new Date(),
				},
			}
		}

		// Direct send: acquire from global rate limiter first (if configured)
		const globalLimiter = getGlobalRateLimiter()
		if (globalLimiter) {
			await globalLimiter.acquire()
		}

		return provider.send(finalMessage)
	}

	const sendTemplate = async <TProps>(
		message: TemplatedEmailMessage<TProps>,
		options: SendOptions = {},
	): Promise<SendResult> => {
		const rendered = await renderEmailTemplate(
			message.template,
			message.props,
		)

		const emailMessage: EmailMessage = {
			from: message.from,
			to: message.to,
			subject: message.subject,
			cc: message.cc,
			bcc: message.bcc,
			replyTo: message.replyTo,
			attachments: message.attachments,
			headers: message.headers,
			tags: message.tags,
			scheduledAt: message.scheduledAt,
			html: rendered.html,
			text: rendered.text,
		}

		return send(emailMessage, options)
	}

	const sendBatch = async (
		messages: EmailMessage[],
		options: BatchOptions = {},
	): Promise<BatchSendResult> => {
		const finalMessages = messages.map(applyDefaults)

		// Create ephemeral SQLite queue for this batch
		const batchQueue = createEphemeralBatchQueue(provider, options)

		try {
			// Add all messages to the batch queue
			await batchQueue.addBatch(finalMessages)

			// Start processing
			batchQueue.start()

			// Wait for completion (with timeout from options or default)
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
			// Handle timeout or other errors
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown batch error'

			return {
				success: false,
				error: {
					code: 'PROVIDER_ERROR',
					message: errorMessage,
					...(error instanceof Error && { cause: error }),
				},
			}
		} finally {
			// Always cleanup the ephemeral queue
			await batchQueue.destroy()
		}
	}

	const enqueue = async (
		message: EmailMessage,
		scheduledFor?: Date,
	): Promise<QueueJob> => {
		if (!queue) {
			throw new Error('Queue is not enabled')
		}
		return queue.add(applyDefaults(message), { scheduledFor })
	}

	const startQueue = (): void => {
		if (!queue) {
			throw new Error('Queue is not enabled')
		}
		queue.start()
	}

	const stopQueue = async (): Promise<void> => {
		if (!queue) return
		await queue.stop()
	}

	const validateConfig = async (): Promise<boolean> =>
		provider.validateConfig()

	return {
		get provider(): EmailProvider {
			return provider
		},
		get queue(): EmailQueue | null {
			return queue
		},
		send,
		sendTemplate,
		sendBatch,
		enqueue,
		startQueue,
		stopQueue,
		validateConfig,
	}
}
