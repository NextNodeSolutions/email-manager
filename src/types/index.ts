/**
 * Type definitions for @nextnode/email-manager
 * Barrel export for all type definitions
 */

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
export type {
	EmailProvider,
	ProviderConfig,
	ProviderFactory,
} from './provider.js'
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
// Template types
export type {
	RenderedTemplate,
	TemplateEntry,
	TemplateMap,
	TemplateRenderOptions,
} from './template.js'
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
	WebhookEvent,
	WebhookEventBase,
	WebhookEventData,
	WebhookEventType,
	WebhookHandler,
	WebhookVerifyOptions,
} from './webhook.js'
