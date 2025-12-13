/**
 * Queue type definitions
 * Types for email queue management with retry and rate limiting
 */

import type { EmailMessage } from "./email.js";
import type { SendResult } from "./result.js";

/**
 * Queue job status
 */
export type QueueJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retrying";

/**
 * Queue job
 */
export interface QueueJob {
  /** Unique job ID */
  id: string;
  /** Batch ID for grouped jobs */
  batchId?: string | undefined;
  /** Email message */
  message: EmailMessage;
  /** Current status */
  status: QueueJobStatus;
  /** Number of attempts */
  attempts: number;
  /** Max retries */
  maxRetries: number;
  /** Created timestamp */
  createdAt: Date;
  /** Last attempt timestamp */
  lastAttemptAt?: Date | undefined;
  /** Scheduled for timestamp */
  scheduledFor?: Date | undefined;
  /** Result if completed/failed */
  result?: SendResult | undefined;
  /** Error message if failed */
  error?: string | undefined;
}

/**
 * Queue backend configuration
 * Discriminated union for different storage backends
 */
export type QueueBackendConfig =
  | { backend: "memory" }
  | {
      backend: "sqlite";
      /** Path to SQLite database file */
      databasePath: string;
      /** Retention period for completed/failed jobs in hours (default: 168 = 7 days) */
      retentionHours?: number;
    };

/**
 * Batch progress statistics
 * Emitted during batch processing
 */
export interface BatchProgressStats {
  /** Unique batch identifier */
  batchId: string;
  /** Total jobs in batch */
  total: number;
  /** Successfully completed jobs */
  completed: number;
  /** Failed jobs */
  failed: number;
  /** Remaining jobs to process */
  remaining: number;
}

/**
 * Batch completion summary
 * Emitted when batch processing completes
 */
export interface BatchCompleteSummary {
  /** Unique batch identifier */
  batchId: string;
  /** Total emails successfully sent */
  totalSent: number;
  /** Total emails that failed */
  totalFailed: number;
  /** Total processing duration in milliseconds */
  durationMs: number;
}

/**
 * Queue options
 */
export interface QueueOptions {
  /** Max concurrent sends */
  concurrency?: number;
  /** Max retries per email */
  maxRetries?: number;
  /** Initial retry delay (ms) */
  retryDelay?: number;
  /** Max retry delay (ms) */
  maxRetryDelay?: number;
  /** Rate limit: emails per second */
  rateLimit?: number;
  /** Batch processing size */
  batchSize?: number;
  /** Storage backend configuration (default: memory) */
  backendConfig?: QueueBackendConfig;
  /** Progress callback for batch monitoring */
  onProgress?: (stats: BatchProgressStats) => void;
  /** Completion callback for batch monitoring */
  onComplete?: (summary: BatchCompleteSummary) => void;
  /** Webhook URL for batch event notifications */
  webhookUrl?: string;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Total jobs in queue */
  total: number;
  /** Pending jobs */
  pending: number;
  /** Processing jobs */
  processing: number;
  /** Completed jobs */
  completed: number;
  /** Failed jobs */
  failed: number;
  /** Jobs waiting for retry */
  retrying: number;
}

/**
 * Queue event types
 */
export type QueueEventType =
  | "job:added"
  | "job:processing"
  | "job:completed"
  | "job:failed"
  | "job:retry"
  | "queue:drained"
  | "queue:error";

/**
 * Queue event handler
 */
export type QueueEventHandler<T = unknown> = (data: T) => void;

/**
 * Email queue interface
 */
/**
 * Job filter options for getJobs
 */
export interface JobFilterOptions {
  /** Filter by status */
  status?: QueueJobStatus | undefined;
  /** Limit number of results */
  limit?: number | undefined;
  /** Offset for pagination */
  offset?: number | undefined;
}

/**
 * Email queue interface
 */
export interface EmailQueue {
  /** Add single email to queue */
  add(
    message: EmailMessage,
    options?: { scheduledFor?: Date | undefined },
  ): Promise<QueueJob>;

  /** Add multiple emails to queue */
  addBatch(messages: EmailMessage[]): Promise<QueueJob[]>;

  /** Get job by ID */
  getJob(id: string): Promise<QueueJob | undefined>;

  /** Get all jobs with optional filtering */
  getJobs(options?: JobFilterOptions): Promise<QueueJob[]>;

  /** Get queue statistics */
  getStats(): Promise<QueueStats>;

  /** Start processing queue */
  start(): void;

  /** Stop processing queue */
  stop(): Promise<void>;

  /** Pause queue processing */
  pause(): void;

  /** Resume queue processing */
  resume(): void;

  /** Clear all pending jobs */
  clear(): Promise<number>;

  /** Subscribe to queue events */
  on<T>(event: QueueEventType, handler: QueueEventHandler<T>): void;

  /** Unsubscribe from queue events */
  off(event: QueueEventType, handler: QueueEventHandler): void;
}
