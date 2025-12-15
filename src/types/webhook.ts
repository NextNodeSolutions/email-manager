/**
 * Webhook type definitions
 * Types for email event webhooks (delivery, bounces, opens, clicks)
 */

/**
 * Webhook event types from Resend
 */
export type WebhookEventType =
	| 'email.sent'
	| 'email.delivered'
	| 'email.delivery_delayed'
	| 'email.bounced'
	| 'email.complained'
	| 'email.opened'
	| 'email.clicked'

/**
 * Base webhook event data
 */
export interface WebhookEventData {
	/** Email ID */
	email_id: string
	/** From address */
	from: string
	/** To address(es) */
	to: string[]
	/** Subject */
	subject: string
	/** Tags if any */
	tags?: Record<string, string>
}

/**
 * Base webhook event
 */
export interface WebhookEventBase {
	/** Event type */
	type: WebhookEventType
	/** Timestamp (ISO 8601) */
	created_at: string
	/** Email data */
	data: WebhookEventData
}

/**
 * Email sent event
 */
export interface EmailSentEvent extends WebhookEventBase {
	type: 'email.sent'
}

/**
 * Email delivered event
 */
export interface EmailDeliveredEvent extends WebhookEventBase {
	type: 'email.delivered'
}

/**
 * Email delivery delayed event
 */
export interface EmailDeliveryDelayedEvent extends WebhookEventBase {
	type: 'email.delivery_delayed'
}

/**
 * Bounce information
 */
export interface BounceInfo {
	message: string
	type: 'hard' | 'soft'
}

/**
 * Email bounced event
 */
export interface EmailBouncedEvent extends WebhookEventBase {
	type: 'email.bounced'
	data: WebhookEventData & {
		bounce: BounceInfo
	}
}

/**
 * Email complained (spam) event
 */
export interface EmailComplainedEvent extends WebhookEventBase {
	type: 'email.complained'
}

/**
 * Tracking event data (opens, clicks)
 */
export interface TrackingEventData {
	user_agent?: string
	ip?: string
}

/**
 * Email opened event
 */
export interface EmailOpenedEvent extends WebhookEventBase {
	type: 'email.opened'
	data: WebhookEventData &
		TrackingEventData & {
			opened_at: string
		}
}

/**
 * Email clicked event
 */
export interface EmailClickedEvent extends WebhookEventBase {
	type: 'email.clicked'
	data: WebhookEventData &
		TrackingEventData & {
			clicked_at: string
			link: string
		}
}

/**
 * Union of all webhook events
 */
export type WebhookEvent =
	| EmailSentEvent
	| EmailDeliveredEvent
	| EmailDeliveryDelayedEvent
	| EmailBouncedEvent
	| EmailComplainedEvent
	| EmailOpenedEvent
	| EmailClickedEvent

/**
 * Webhook handler function type
 */
export type WebhookHandler<T extends WebhookEvent = WebhookEvent> = (
	event: T,
) => Promise<void> | void

/**
 * Webhook verification options
 */
export interface WebhookVerifyOptions {
	/** Webhook signing secret */
	secret: string
	/** Signature header value */
	signature: string
	/** Raw request body */
	body: string
	/** Tolerance window in seconds (default: 300) */
	tolerance?: number
}

/**
 * Webhook parsing error
 */
export interface WebhookError {
	code:
		| 'INVALID_SIGNATURE'
		| 'INVALID_PAYLOAD'
		| 'EXPIRED_TIMESTAMP'
		| 'PARSE_ERROR'
		| 'HANDLER_ERROR'
	message: string
}
