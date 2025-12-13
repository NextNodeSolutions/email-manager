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

// Main API exports
export { createEmailManager } from "./email-manager.js";
export type {
  EmailManagerConfig,
  SendOptions,
  EmailManager,
} from "./email-manager.js";

// Webhook exports
export { createWebhookHandler } from "./webhooks/handler.js";
export type {
  WebhookHandlerConfig,
  WebhookHandlerMap,
  ProcessResult,
  WebhookHandlerInstance,
} from "./webhooks/handler.js";

// Provider exports (for advanced usage)
export { createProvider } from "./providers/registry.js";
export type {
  ProviderConfigMap,
  ProviderClientMap,
} from "./providers/registry.js";

// Template exports (for direct usage)
export { renderTemplate } from "./templates/renderer.js";

// Type exports
export type {
  // Email types
  EmailMessage,
  EmailRecipient,
  EmailAttachment,
  EmailHeader,
  EmailTag,
  TemplatedEmailMessage,
  EmailTemplateComponent,
  // Provider types
  EmailProvider,
  // Result types
  Result,
  SendResult,
  SendSuccess,
  BatchSendResult,
  BatchSendSuccess,
  EmailError,
  EmailErrorCode,
  // Queue types
  QueueJob,
  QueueJobStatus,
  QueueBackendConfig,
  BatchProgressStats,
  BatchCompleteSummary,
  QueueOptions,
  QueueStats,
  QueueEventType,
  QueueEventHandler,
  EmailQueue,
  // Template types
  TemplateRenderOptions,
  RenderedTemplate,
  // Webhook types
  WebhookEvent,
  WebhookEventType,
  WebhookHandler,
  WebhookVerifyOptions,
  WebhookError,
  EmailSentEvent,
  EmailDeliveredEvent,
  EmailDeliveryDelayedEvent,
  EmailBouncedEvent,
  EmailComplainedEvent,
  EmailOpenedEvent,
  EmailClickedEvent,
} from "./types/index.js";

// Logger exports (for debugging)
export {
  logger,
  providerLogger,
  queueLogger,
  webhookLogger,
  templateLogger,
  logDebug,
} from "./utils/logger.js";
