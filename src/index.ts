/**
 * @nextnode/email-manager
 * A TypeScript email management library for NextNode projects
 *
 * Features:
 * - Provider-agnostic email sending (Resend supported)
 * - React Email template rendering
 * - Built-in queue with retry and rate limiting
 * - Framework-agnostic webhook handling
 */

export type {
	EmailManager,
	EmailManagerConfig,
	SendOptions,
} from './email-manager.js'
// Main API exports
export { createEmailManager } from './email-manager.js'
// Constants exports
export { BATCH_QUEUE_DEFAULTS } from './lib/constants.js'
export type {
	RateLimiterConfig,
	RateLimiterStatus,
	TokenBucket,
} from './lib/rate-limiter.js'
// Rate limiter exports
export {
	configureGlobalRateLimit,
	getGlobalRateLimiter,
	resetGlobalRateLimiter,
} from './lib/rate-limiter.js'
export type {
	ProviderClientMap,
	ProviderConfigMap,
} from './providers/registry.js'
// Provider exports (for advanced usage)
export { createProvider } from './providers/registry.js'
export type { BatchOptions, EphemeralBatchQueue } from './queue/index.js'
// Queue exports (for advanced usage)
export { createEphemeralBatchQueue } from './queue/index.js'
// Template exports (for direct usage)
export { renderTemplate } from './templates/renderer.js'
// Type exports
export type {
	BatchCompleteSummary,
	BatchProgressStats,
	BatchSendResult,
	BatchSendSuccess,
	EmailAttachment,
	EmailBouncedEvent,
	EmailClickedEvent,
	EmailComplainedEvent,
	EmailDeliveredEvent,
	EmailDeliveryDelayedEvent,
	EmailError,
	EmailErrorCode,
	EmailHeader,
	// Email types
	EmailMessage,
	EmailOpenedEvent,
	// Provider types
	EmailProvider,
	EmailQueue,
	EmailRecipient,
	EmailSentEvent,
	EmailTag,
	EmailTemplateComponent,
	JobFilterOptions,
	QueueBackendConfig,
	QueueEventHandler,
	QueueEventType,
	// Queue types
	QueueJob,
	QueueJobStatus,
	QueueOptions,
	QueueStats,
	RenderedTemplate,
	// Result types
	Result,
	SendResult,
	SendSuccess,
	TemplatedEmailMessage,
	// Template types
	TemplateRenderOptions,
	WebhookError,
	// Webhook types
	WebhookEvent,
	WebhookEventType,
	WebhookHandler,
	WebhookVerifyOptions,
} from './types/index.js'
// Logger exports (for debugging)
export {
	logger,
	providerLogger,
	queueLogger,
	templateLogger,
	webhookLogger,
} from './utils/logger.js'
export type {
	ProcessResult,
	WebhookHandlerConfig,
	WebhookHandlerInstance,
	WebhookHandlerMap,
} from './webhooks/handler.js'
// Webhook exports
export { createWebhookHandler } from './webhooks/handler.js'
