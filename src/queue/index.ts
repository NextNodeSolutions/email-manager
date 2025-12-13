/**
 * Queue factory
 * Creates queue instances based on backend configuration
 */

import { createMemoryQueue } from "./memory-queue.js";

import type {
  EmailProvider,
  EmailQueue,
  QueueOptions,
  QueueBackendConfig,
} from "../types/index.js";

/**
 * SQLite queue creator function type
 */
type SQLiteQueueCreator = (
  provider: EmailProvider,
  options: QueueOptions,
  backendConfig: Extract<QueueBackendConfig, { backend: "sqlite" }>,
) => EmailQueue;

/**
 * Create an email queue with the specified backend
 *
 * @param provider - Email provider for sending emails
 * @param options - Queue configuration options
 * @returns EmailQueue instance
 *
 * @example
 * ```typescript
 * // Memory queue (default)
 * const queue = createQueue(provider, { maxRetries: 3 })
 *
 * // SQLite queue (persistent)
 * const queue = createQueue(provider, {
 *   maxRetries: 5,
 *   backendConfig: {
 *     backend: 'sqlite',
 *     databasePath: './data/queue.db'
 *   }
 * })
 * ```
 */
export const createQueue = (
  provider: EmailProvider,
  options: QueueOptions = {},
): EmailQueue => {
  const backendConfig = options.backendConfig ?? { backend: "memory" };

  switch (backendConfig.backend) {
    case "sqlite": {
      // Dynamic import to avoid loading node:sqlite when not needed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSQLiteQueue } = require("./sqlite-queue.js") as {
        createSQLiteQueue: SQLiteQueueCreator;
      };
      return createSQLiteQueue(provider, options, backendConfig);
    }
    default:
      return createMemoryQueue(provider, options);
  }
};

export { createMemoryQueue } from "./memory-queue.js";
