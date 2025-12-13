/**
 * Type definitions for @nextnode/email-manager
 * Barrel export for all type definitions
 */

// Email types
export type {
  EmailRecipient,
  EmailAttachment,
  EmailHeader,
  EmailTag,
  EmailMessage,
  EmailTemplateComponent,
  TemplatedEmailMessage,
} from "./email.js";

// Result types (discriminated unions)
export type {
  Result,
  EmailErrorCode,
  EmailError,
  SendSuccess,
  SendResult,
  BatchSendSuccess,
  BatchSendResult,
} from "./result.js";

// Provider types (Strategy pattern)
export type {
  ProviderConfig,
  EmailProvider,
  ProviderFactory,
} from "./provider.js";

// Queue types
export type {
  QueueJobStatus,
  QueueJob,
  QueueBackendConfig,
  BatchProgressStats,
  BatchCompleteSummary,
  QueueOptions,
  QueueStats,
  QueueEventType,
  QueueEventHandler,
  EmailQueue,
} from "./queue.js";

// Template types
export type {
  TemplateRenderOptions,
  RenderedTemplate,
  TemplateEntry,
  TemplateMap,
} from "./template.js";

// Webhook types
export type {
  WebhookEventType,
  WebhookEventData,
  WebhookEventBase,
  EmailSentEvent,
  EmailDeliveredEvent,
  EmailDeliveryDelayedEvent,
  BounceInfo,
  EmailBouncedEvent,
  EmailComplainedEvent,
  TrackingEventData,
  EmailOpenedEvent,
  EmailClickedEvent,
  WebhookEvent,
  WebhookHandler,
  WebhookVerifyOptions,
  WebhookError,
} from "./webhook.js";
