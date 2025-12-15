/**
 * Result type definitions
 * Discriminated unions for type-safe error handling
 */

/**
 * Base result type - discriminated union for success/error
 */
export type Result<T, E = Error> =
	| { success: true; data: T }
	| { success: false; error: E }

/**
 * Email error codes
 */
export type EmailErrorCode =
	| 'VALIDATION_ERROR'
	| 'AUTHENTICATION_ERROR'
	| 'RATE_LIMIT_ERROR'
	| 'PROVIDER_ERROR'
	| 'UNKNOWN_ERROR'

/**
 * Email send error with details
 */
export interface EmailError {
	/** Error code */
	code: EmailErrorCode
	/** Human-readable message */
	message: string
	/** Original error if available */
	cause?: Error
	/** Provider-specific error details */
	providerError?: Record<string, unknown>
	/** Email ID if partially processed */
	emailId?: string
}

/**
 * Successful send response
 */
export interface SendSuccess {
	/** Email ID from provider */
	id: string
	/** Provider name */
	provider: string
	/** Timestamp of send */
	sentAt: Date
}

/**
 * Single email send result
 */
export type SendResult = Result<SendSuccess, EmailError>

/**
 * Batch send result with per-email status
 */
export interface BatchSendSuccess {
	/** Total emails processed */
	total: number
	/** Successfully sent count */
	successful: number
	/** Failed count */
	failed: number
	/** Processing duration in milliseconds */
	durationMs: number
	/** Individual results (when available) */
	results?: Array<{
		index: number
		result: SendResult
		recipient?: string | undefined
	}>
}

export type BatchSendResult = Result<BatchSendSuccess, EmailError>
