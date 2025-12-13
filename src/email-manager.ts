/**
 * Email Manager
 * Main facade for email operations - the primary public API
 */

import { Resend } from "resend";

import {
  createProvider,
  type ProviderConfigMap,
} from "./providers/registry.js";
import { createQueue } from "./queue/index.js";
import { renderTemplate } from "./templates/renderer.js";

import type {
  EmailMessage,
  TemplatedEmailMessage,
  EmailProvider,
  EmailQueue,
  QueueJob,
  QueueOptions,
  SendResult,
  BatchSendResult,
  EmailTemplateComponent,
  TemplateRenderOptions,
} from "./types/index.js";

/**
 * Email manager configuration
 */
export interface EmailManagerConfig<
  P extends keyof ProviderConfigMap = "resend",
> {
  /** Provider name */
  provider: P;
  /** Provider configuration */
  providerConfig: ProviderConfigMap[P];
  /** Queue configuration (false to disable) */
  queue?: QueueOptions | false;
  /** Default from address */
  defaultFrom?: string;
  /** Template render options */
  templateOptions?: TemplateRenderOptions;
}

/**
 * Email manager send options
 */
export interface SendOptions {
  /** Use queue instead of direct send */
  useQueue?: boolean;
  /** Schedule for later (if queued) */
  scheduledFor?: Date;
}

/**
 * Email manager instance interface
 */
export interface EmailManager {
  /** Get the underlying provider */
  readonly provider: EmailProvider;
  /** Get the queue (if enabled) */
  readonly queue: EmailQueue | null;
  /** Send a single email */
  send: (message: EmailMessage, options?: SendOptions) => Promise<SendResult>;
  /** Send email with React Email template */
  sendTemplate: <TProps>(
    message: TemplatedEmailMessage<TProps>,
    options?: SendOptions,
  ) => Promise<SendResult>;
  /** Send batch of emails */
  sendBatch: (
    messages: EmailMessage[],
    options?: SendOptions,
  ) => Promise<BatchSendResult>;
  /** Add email to queue */
  enqueue: (message: EmailMessage, scheduledFor?: Date) => Promise<QueueJob>;
  /** Start queue processing */
  startQueue: () => void;
  /** Stop queue processing */
  stopQueue: () => Promise<void>;
  /** Validate provider configuration */
  validateConfig: () => Promise<boolean>;
}

/**
 * Create provider client based on provider name
 */
const createProviderClient = <P extends keyof ProviderConfigMap>(
  name: P,
  config: ProviderConfigMap[P],
): Resend => {
  switch (name) {
    case "resend":
      return new Resend(config.apiKey);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
};

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
  const client = createProviderClient(config.provider, config.providerConfig);

  // Create provider
  const provider = createProvider(
    config.provider,
    client,
    config.providerConfig,
  );

  // Create queue if enabled
  const queue =
    config.queue !== false ? createQueue(provider, config.queue ?? {}) : null;

  /**
   * Apply default values to message
   */
  const applyDefaults = (message: EmailMessage): EmailMessage => {
    if (!config.defaultFrom) return message;
    return {
      ...message,
      from: message.from ?? config.defaultFrom,
    };
  };

  /**
   * Render template to HTML
   */
  const renderEmailTemplate = async <TProps>(
    template: EmailTemplateComponent<TProps>,
    props: TProps,
  ): Promise<{ html: string; text?: string | undefined }> =>
    renderTemplate(template, props, config.templateOptions);

  const send = async (
    message: EmailMessage,
    options: SendOptions = {},
  ): Promise<SendResult> => {
    const finalMessage = applyDefaults(message);

    if (options.useQueue && queue) {
      const job = await queue.add(finalMessage, {
        scheduledFor: options.scheduledFor,
      });

      return {
        success: true,
        data: {
          id: job.id,
          provider: provider.name,
          sentAt: new Date(),
        },
      };
    }

    return provider.send(finalMessage);
  };

  const sendTemplate = async <TProps>(
    message: TemplatedEmailMessage<TProps>,
    options: SendOptions = {},
  ): Promise<SendResult> => {
    const rendered = await renderEmailTemplate(message.template, message.props);

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
    };

    return send(emailMessage, options);
  };

  const sendBatch = async (
    messages: EmailMessage[],
    options: SendOptions = {},
  ): Promise<BatchSendResult> => {
    const finalMessages = messages.map(applyDefaults);

    if (options.useQueue && queue) {
      const jobs = await queue.addBatch(finalMessages);

      return {
        success: true,
        data: {
          total: jobs.length,
          successful: jobs.length,
          failed: 0,
          results: jobs.map((job, index) => {
            const msg = messages[index];
            const recipient = msg
              ? Array.isArray(msg.to)
                ? String(msg.to[0])
                : String(msg.to)
              : "";

            return {
              index,
              recipient,
              result: {
                success: true as const,
                data: {
                  id: job.id,
                  provider: provider.name,
                  sentAt: new Date(),
                },
              },
            };
          }),
        },
      };
    }

    return provider.sendBatch(finalMessages);
  };

  const enqueue = async (
    message: EmailMessage,
    scheduledFor?: Date,
  ): Promise<QueueJob> => {
    if (!queue) {
      throw new Error("Queue is not enabled");
    }
    return queue.add(applyDefaults(message), { scheduledFor });
  };

  const startQueue = (): void => {
    if (!queue) {
      throw new Error("Queue is not enabled");
    }
    queue.start();
  };

  const stopQueue = async (): Promise<void> => {
    if (!queue) return;
    await queue.stop();
  };

  const validateConfig = async (): Promise<boolean> =>
    provider.validateConfig();

  return {
    get provider(): EmailProvider {
      return provider;
    },
    get queue(): EmailQueue | null {
      return queue;
    },
    send,
    sendTemplate,
    sendBatch,
    enqueue,
    startQueue,
    stopQueue,
    validateConfig,
  };
};
