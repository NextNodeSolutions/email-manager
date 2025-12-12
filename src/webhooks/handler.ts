/**
 * Webhook handler
 * Framework-agnostic webhook event handling
 */

import { verifyWebhookSignature, parseWebhookPayload } from './parser.js'

import type {
	WebhookEvent,
	WebhookEventType,
	WebhookHandler,
	WebhookError,
	EmailDeliveredEvent,
	EmailBouncedEvent,
	EmailOpenedEvent,
	EmailClickedEvent,
	EmailComplainedEvent,
	EmailSentEvent,
	EmailDeliveryDelayedEvent,
	Result,
} from '../types/index.js'

/**
 * Webhook handler configuration
 */
export interface WebhookHandlerConfig {
	/** Webhook signing secret */
	secret: string
	/** Verify signatures (recommended for production) */
	verifySignature?: boolean
	/** Signature tolerance in seconds */
	signatureTolerance?: number
}

/**
 * Type-safe handler map
 */
export interface WebhookHandlerMap {
	'email.sent'?: WebhookHandler<EmailSentEvent>
	'email.delivered'?: WebhookHandler<EmailDeliveredEvent>
	'email.delivery_delayed'?: WebhookHandler<EmailDeliveryDelayedEvent>
	'email.bounced'?: WebhookHandler<EmailBouncedEvent>
	'email.complained'?: WebhookHandler<EmailComplainedEvent>
	'email.opened'?: WebhookHandler<EmailOpenedEvent>
	'email.clicked'?: WebhookHandler<EmailClickedEvent>
}

/**
 * Process result
 */
export interface ProcessResult {
	processed: boolean
	event?: WebhookEvent | undefined
}

/**
 * Webhook handler instance interface
 */
export interface WebhookHandlerInstance {
	on: <K extends WebhookEventType>(
		event: K,
		handler: WebhookHandlerMap[K],
	) => void
	off: (event: WebhookEventType) => void
	process: (
		body: string,
		signature?: string,
	) => Promise<Result<ProcessResult, WebhookError>>
	hasHandler: (event: WebhookEventType) => boolean
	getRegisteredEvents: () => WebhookEventType[]
}

/**
 * Create a webhook handler instance
 *
 * @param config - Handler configuration
 * @returns Webhook handler with event registration and processing
 *
 * @example
 * ```typescript
 * const webhooks = createWebhookHandler({
 *   secret: process.env.WEBHOOK_SECRET,
 *   verifySignature: true
 * })
 *
 * webhooks.on('email.delivered', async (event) => {
 *   console.log('Email delivered:', event.data.email_id)
 * })
 *
 * webhooks.on('email.bounced', async (event) => {
 *   console.log('Email bounced:', event.data.bounce.type)
 *   // Handle bounce - maybe unsubscribe the user
 * })
 *
 * // In your route handler (any framework)
 * const result = await webhooks.process(requestBody, signatureHeader)
 * ```
 */
export const createWebhookHandler = (
	config: WebhookHandlerConfig,
): WebhookHandlerInstance => {
	const handlers: WebhookHandlerMap = {}
	const { secret, verifySignature = true, signatureTolerance = 300 } = config

	/**
	 * Register event handler
	 */
	const on = <K extends WebhookEventType>(
		event: K,
		handler: WebhookHandlerMap[K],
	): void => {
		// Type assertion needed due to TypeScript limitations with mapped types
		handlers[event] = handler as WebhookHandlerMap[typeof event]
	}

	/**
	 * Remove event handler
	 */
	const off = (event: WebhookEventType): void => {
		delete handlers[event]
	}

	/**
	 * Process incoming webhook
	 *
	 * @param body - Raw request body string
	 * @param signature - Signature header value (optional if verification disabled)
	 * @returns Result with processing status
	 */
	const process = async (
		body: string,
		signature?: string,
	): Promise<Result<ProcessResult, WebhookError>> => {
		// Verify signature if enabled
		if (verifySignature) {
			if (!signature) {
				return {
					success: false,
					error: {
						code: 'INVALID_SIGNATURE',
						message: 'Missing signature header',
					},
				}
			}

			const verifyResult = verifyWebhookSignature({
				secret,
				signature,
				body,
				tolerance: signatureTolerance,
			})

			if (!verifyResult.success) {
				return verifyResult as Result<never, WebhookError>
			}
		}

		// Parse payload
		const parseResult = parseWebhookPayload(body)
		if (!parseResult.success) {
			return parseResult as Result<never, WebhookError>
		}

		const event = parseResult.data
		const handler = handlers[event.type]

		if (!handler) {
			// No handler registered for this event type - not an error
			return {
				success: true,
				data: { processed: false, event },
			}
		}

		try {
			// Call the handler with the typed event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await handler(event as any)

			return {
				success: true,
				data: { processed: true, event },
			}
		} catch (error) {
			return {
				success: false,
				error: {
					code: 'PARSE_ERROR',
					message:
						error instanceof Error
							? error.message
							: 'Handler error',
				},
			}
		}
	}

	/**
	 * Check if a handler is registered for an event type
	 */
	const hasHandler = (event: WebhookEventType): boolean =>
		handlers[event] !== undefined

	/**
	 * Get list of registered event types
	 */
	const getRegisteredEvents = (): WebhookEventType[] =>
		Object.keys(handlers) as WebhookEventType[]

	return {
		on,
		off,
		process,
		hasHandler,
		getRegisteredEvents,
	}
}
