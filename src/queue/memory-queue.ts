/**
 * In-memory email queue
 * Queue implementation with retry logic, rate limiting, and event system
 */

import { randomUUID } from "node:crypto";

import type {
  EmailQueue,
  QueueJob,
  QueueOptions,
  QueueStats,
  QueueEventType,
  QueueEventHandler,
  EmailMessage,
  EmailProvider,
} from "../types/index.js";

/**
 * Default queue options (core processing options only)
 */
const DEFAULT_OPTIONS = {
  concurrency: 5,
  maxRetries: 3,
  retryDelay: 1000,
  maxRetryDelay: 60000,
  rateLimit: 10, // 10 emails per second
  batchSize: 10,
} as const;

/**
 * Simple delay utility
 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create an in-memory email queue
 *
 * @param provider - Email provider to use for sending
 * @param options - Queue configuration options
 * @returns EmailQueue instance
 *
 * @example
 * ```typescript
 * const queue = createMemoryQueue(provider, {
 *   concurrency: 5,
 *   maxRetries: 3,
 *   rateLimit: 10
 * })
 *
 * await queue.add({ to: 'user@example.com', subject: 'Hello', html: '...' })
 * queue.start()
 * ```
 */
export const createMemoryQueue = (
  provider: EmailProvider,
  options: QueueOptions = {},
): EmailQueue => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const jobs = new Map<string, QueueJob>();
  const pending: string[] = [];
  const eventHandlers = new Map<QueueEventType, Set<QueueEventHandler>>();

  let isRunning = false;
  let isPaused = false;
  let activeCount = 0;
  let lastSendTime = 0;

  /**
   * Emit event to all registered handlers
   */
  const emit = <T>(event: QueueEventType, data: T): void => {
    const handlers = eventHandlers.get(event);
    handlers?.forEach((handler) => {
      try {
        handler(data);
      } catch {
        // Silently ignore handler errors
      }
    });
  };

  /**
   * Calculate exponential backoff delay with jitter
   */
  const calculateBackoff = (attempt: number): number => {
    const baseDelay = config.retryDelay * 2 ** (attempt - 1);
    // Add jitter (0-25% of delay)
    const jitter = baseDelay * Math.random() * 0.25;
    return Math.min(baseDelay + jitter, config.maxRetryDelay);
  };

  /**
   * Wait for rate limit
   */
  const waitForRateLimit = async (): Promise<void> => {
    const minInterval = 1000 / config.rateLimit;
    const elapsed = Date.now() - lastSendTime;
    if (elapsed < minInterval) {
      await delay(minInterval - elapsed);
    }
    lastSendTime = Date.now();
  };

  /**
   * Get synchronous stats
   */
  const getStatsSync = (): QueueStats => {
    let pendingCount = 0;
    let processingCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let retryingCount = 0;

    for (const job of jobs.values()) {
      switch (job.status) {
        case "pending":
          pendingCount += 1;
          break;
        case "processing":
          processingCount += 1;
          break;
        case "completed":
          completedCount += 1;
          break;
        case "failed":
          failedCount += 1;
          break;
        case "retrying":
          retryingCount += 1;
          break;
      }
    }

    return {
      total: jobs.size,
      pending: pendingCount,
      processing: processingCount,
      completed: completedCount,
      failed: failedCount,
      retrying: retryingCount,
    };
  };

  /**
   * Process next job in queue
   */
  const processNext = (): void => {
    if (!isRunning || isPaused) return;
    if (activeCount >= config.concurrency) return;
    if (pending.length === 0) {
      if (activeCount === 0) {
        emit("queue:drained", { stats: getStatsSync() });
      }
      return;
    }

    const jobId = pending.shift();
    if (!jobId) return;

    const job = jobs.get(jobId);
    if (!job) return;

    // Check if scheduled for future
    if (job.scheduledFor && job.scheduledFor > new Date()) {
      const delayMs = job.scheduledFor.getTime() - Date.now();
      setTimeout(() => {
        pending.push(jobId);
        processNext();
      }, delayMs);
      return;
    }

    activeCount += 1;
    processJob(jobId);
  };

  /**
   * Process a single job
   */
  const processJob = async (jobId: string): Promise<void> => {
    const job = jobs.get(jobId);
    if (!job || job.status === "completed") {
      activeCount -= 1;
      processNext();
      return;
    }

    job.status = "processing";
    job.attempts += 1;
    job.lastAttemptAt = new Date();

    emit("job:processing", { job });

    try {
      await waitForRateLimit();
      const result = await provider.send(job.message);

      if (result.success) {
        job.status = "completed";
        job.result = result;
        emit("job:completed", { job, result });
      } else {
        throw new Error(result.error.message);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (job.attempts < job.maxRetries) {
        job.status = "retrying";
        job.error = errorMessage;
        const backoffDelay = calculateBackoff(job.attempts);

        emit("job:retry", { job, nextRetryIn: backoffDelay });

        // Schedule retry
        setTimeout(() => {
          if (isRunning && !isPaused) {
            pending.push(jobId);
            processNext();
          }
        }, backoffDelay);
      } else {
        job.status = "failed";
        job.error = errorMessage;
        emit("job:failed", { job, error: errorMessage });
      }
    } finally {
      activeCount -= 1;
      processNext();
    }
  };

  return {
    async add(
      message: EmailMessage,
      addOptions: { scheduledFor?: Date } = {},
    ): Promise<QueueJob> {
      const job: QueueJob = {
        id: randomUUID(),
        message,
        status: "pending",
        attempts: 0,
        maxRetries: config.maxRetries,
        createdAt: new Date(),
        scheduledFor: addOptions.scheduledFor,
      };

      jobs.set(job.id, job);
      pending.push(job.id);
      emit("job:added", { job });

      if (isRunning && !isPaused) {
        processNext();
      }

      return job;
    },

    async addBatch(messages: EmailMessage[]): Promise<QueueJob[]> {
      const addedJobs: QueueJob[] = [];

      for (const message of messages) {
        const job = await this.add(message);
        addedJobs.push(job);
      }

      return addedJobs;
    },

    async getJob(id: string): Promise<QueueJob | undefined> {
      return jobs.get(id);
    },

    async getStats(): Promise<QueueStats> {
      return getStatsSync();
    },

    start(): void {
      isRunning = true;
      isPaused = false;

      // Start processing pending jobs
      for (let i = 0; i < config.concurrency; i++) {
        processNext();
      }
    },

    async stop(): Promise<void> {
      isRunning = false;

      // Wait for active jobs to complete
      while (activeCount > 0) {
        await delay(100);
      }
    },

    pause(): void {
      isPaused = true;
    },

    resume(): void {
      isPaused = false;

      for (let i = 0; i < config.concurrency; i++) {
        processNext();
      }
    },

    async clear(): Promise<number> {
      const pendingCount = pending.length;
      pending.length = 0;

      for (const [id, job] of jobs) {
        if (job.status === "pending") {
          jobs.delete(id);
        }
      }

      return pendingCount;
    },

    on<T>(event: QueueEventType, handler: QueueEventHandler<T>): void {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)?.add(handler as QueueEventHandler);
    },

    off(event: QueueEventType, handler: QueueEventHandler): void {
      eventHandlers.get(event)?.delete(handler);
    },
  };
};
