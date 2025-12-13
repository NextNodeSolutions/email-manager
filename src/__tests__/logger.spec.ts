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
  logDebug,
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

  describe("logDebug", () => {
    it("should log debug information", () => {
      const testData = { key: "value", number: 42 };

      logDebug("Test debug", testData);

      expect(logger.info).toHaveBeenCalledWith("[DEBUG] Test debug", {
        details: testData,
      });
    });

    it("should handle complex objects", () => {
      const complexData = {
        nested: { array: [1, 2, 3], string: "test" },
        func: (): string => "test",
      };

      logDebug("Complex object", complexData);

      expect(logger.info).toHaveBeenCalledWith("[DEBUG] Complex object", {
        details: complexData,
      });
    });
  });
});
