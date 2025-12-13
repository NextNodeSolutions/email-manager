/**
 * Logger functionality tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  logger,
  providerLogger,
  queueLogger,
  webhookLogger,
  templateLogger,
} from "../utils/logger.js";

// Mock @nextnode/logger
vi.mock("@nextnode/logger", () => ({
  createLogger: vi.fn(
    (): { info: () => void; warn: () => void; error: () => void } => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  ),
}));

describe("Logger Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Logger instances", () => {
    it("should create main logger", () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
    });

    it("should create specialized loggers", () => {
      expect(providerLogger).toBeDefined();
      expect(queueLogger).toBeDefined();
      expect(webhookLogger).toBeDefined();
      expect(templateLogger).toBeDefined();
    });
  });
});
