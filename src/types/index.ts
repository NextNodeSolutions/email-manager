/**
 * Type definitions for @nextnode/email-manager
 * Barrel export for all type definitions
 */

// Batch types
export type {
	BatchMode,
	BatchOptions,
	BatchOptionsBase,
	NativeBatchOptions,
	QueueBatchOptions,
} from './batch.js'
// Email types
export type {
	EmailAttachment,
	EmailHeader,
	EmailMessage,
	EmailRecipient,
	EmailTag,
	EmailTemplateComponent,
	TemplatedEmailMessage,
} from './email.js'
// Provider types (Strategy pattern)
export type { EmailProvider, ProviderConfig } from './provider.js'
// Queue types
export type {
	BatchCompleteSummary,
	BatchProgressStats,
	EmailQueue,
	JobFilterOptions,
	QueueBackendConfig,
	QueueEventHandler,
	QueueEventType,
	QueueJob,
	QueueJobStatus,
	QueueOptions,
	QueueStats,
} from './queue.js'
// Result types (discriminated unions)
export type {
	BatchSendResult,
	BatchSendSuccess,
	EmailError,
	EmailErrorCode,
	Result,
	SendResult,
	SendSuccess,
} from './result.js'
// Result factory functions
export { emailError, emailFail, fail } from './result.js'
// Template types
export type { RenderedTemplate, TemplateRenderOptions } from './template.js'
// Webhook types
export type {
	BounceInfo,
	EmailBouncedEvent,
	EmailClickedEvent,
	EmailComplainedEvent,
	EmailDeliveredEvent,
	EmailDeliveryDelayedEvent,
	EmailOpenedEvent,
	EmailSentEvent,
	TrackingEventData,
	WebhookError,
	WebhookErrorCode,
	WebhookEvent,
	WebhookEventBase,
	WebhookEventData,
	WebhookEventType,
	WebhookHandler,
	WebhookVerifyOptions,
} from './webhook.js'
// Webhook factory functions
export { webhookError, webhookFail } from './webhook.js'
