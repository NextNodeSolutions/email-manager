/**
 * Webhook parser and signature verification
 * Handles Resend webhook payload parsing and signature validation
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import type {
	WebhookEvent,
	WebhookEventType,
	WebhookVerifyOptions,
	WebhookError,
	Result,
} from '../types/index.js'

/**
 * Valid webhook event types
 */
const VALID_EVENT_TYPES: WebhookEventType[] = [
	'email.sent',
	'email.delivered',
	'email.delivery_delayed',
	'email.bounced',
	'email.complained',
	'email.opened',
	'email.clicked',
]

/**
 * Verify webhook signature (Resend uses Svix)
 *
 * @param options - Verification options
 * @returns Result indicating if signature is valid
 *
 * @example
 * ```typescript
 * const result = verifyWebhookSignature({
 *   secret: process.env.WEBHOOK_SECRET,
 *   signature: req.headers['svix-signature'],
 *   body: rawBody
 * })
 *
 * if (!result.success) {
 *   return { status: 400, error: result.error.message }
 * }
 * ```
 */
export const verifyWebhookSignature = (
	options: WebhookVerifyOptions,
): Result<boolean, WebhookError> => {
	const { secret, signature, body, tolerance = 300 } = options

	try {
		// Svix signature format: v1,<timestamp>,<signature>
		const parts = signature.split(',')
		if (parts.length < 3) {
			return {
				success: false,
				error: {
					code: 'INVALID_SIGNATURE',
					message: 'Invalid signature format',
				},
			}
		}

		const [version, timestamp, sig] = parts
		if (version !== 'v1' || !timestamp || !sig) {
			return {
				success: false,
				error: {
					code: 'INVALID_SIGNATURE',
					message: 'Invalid signature format',
				},
			}
		}

		// Check timestamp tolerance
		const timestampNum = Number.parseInt(timestamp, 10)
		const now = Math.floor(Date.now() / 1000)

		if (Math.abs(now - timestampNum) > tolerance) {
			return {
				success: false,
				error: {
					code: 'EXPIRED_TIMESTAMP',
					message: 'Webhook timestamp is too old',
				},
			}
		}

		// Compute expected signature
		const signedPayload = `${timestamp}.${body}`
		const expectedSig = createHmac('sha256', secret)
			.update(signedPayload)
			.digest('hex')

		// Timing-safe comparison
		const sigBuffer = Buffer.from(sig, 'hex')
		const expectedBuffer = Buffer.from(expectedSig, 'hex')

		if (sigBuffer.length !== expectedBuffer.length) {
			return {
				success: false,
				error: {
					code: 'INVALID_SIGNATURE',
					message: 'Signature mismatch',
				},
			}
		}

		if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
			return {
				success: false,
				error: {
					code: 'INVALID_SIGNATURE',
					message: 'Signature mismatch',
				},
			}
		}

		return { success: true, data: true }
	} catch {
		return {
			success: false,
			error: {
				code: 'INVALID_SIGNATURE',
				message: 'Failed to verify signature',
			},
		}
	}
}

/**
 * Parse webhook payload
 *
 * @param body - Raw request body string
 * @returns Result with parsed WebhookEvent or error
 *
 * @example
 * ```typescript
 * const result = parseWebhookPayload(rawBody)
 *
 * if (result.success) {
 *   console.log('Event type:', result.data.type)
 *   console.log('Email ID:', result.data.data.email_id)
 * }
 * ```
 */
export const parseWebhookPayload = (
	body: string,
): Result<WebhookEvent, WebhookError> => {
	try {
		const payload = JSON.parse(body) as WebhookEvent

		// Validate required fields
		if (!payload.type || !payload.created_at || !payload.data) {
			return {
				success: false,
				error: {
					code: 'INVALID_PAYLOAD',
					message: 'Missing required webhook fields',
				},
			}
		}

		if (!VALID_EVENT_TYPES.includes(payload.type)) {
			return {
				success: false,
				error: {
					code: 'INVALID_PAYLOAD',
					message: `Unknown event type: ${payload.type}`,
				},
			}
		}

		return { success: true, data: payload }
	} catch {
		return {
			success: false,
			error: {
				code: 'PARSE_ERROR',
				message: 'Failed to parse webhook payload',
			},
		}
	}
}

/**
 * Check if an event type is valid
 */
export const isValidEventType = (type: string): type is WebhookEventType =>
	VALID_EVENT_TYPES.includes(type as WebhookEventType)
