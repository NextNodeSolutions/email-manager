# CLAUDE.md - @nextnode/email-manager

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**@nextnode/email-manager** is a TypeScript email management library for NextNode projects. It provides a unified API for sending emails with provider abstraction, queuing, rate limiting, and webhook handling.

**Key Features:**

- **Provider-agnostic**: Currently supports Resend, architecture ready for extension
- **React Email templates**: Type-safe JSX email templates with automatic HTML/text rendering
- **Built-in queue**: In-memory or SQLite-backed queue with retry logic and rate limiting
- **Global rate limiting**: Token bucket algorithm for coordinating limits across all sends
- **Webhook handling**: Framework-agnostic webhook processing with signature verification
- **Type-safe**: Full TypeScript support with discriminated unions for error handling

## Project Structure

```
email-manager/
├── src/
│   ├── email-manager.ts     # Main facade - createEmailManager()
│   ├── index.ts             # Public exports
│   ├── lib/                 # Core utilities
│   │   ├── constants.ts     # Default configuration values
│   │   └── rate-limiter.ts  # Token bucket rate limiter
│   ├── providers/           # Email provider implementations
│   │   ├── base.ts          # Base provider interface
│   │   ├── registry.ts      # Provider factory
│   │   └── resend.ts        # Resend implementation
│   ├── queue/               # Queue implementations
│   │   ├── memory-queue.ts  # In-memory queue
│   │   ├── sqlite-queue.ts  # SQLite persistent queue
│   │   ├── ephemeral-batch-queue.ts  # Batch processing queue
│   │   └── batch-monitor.ts # Batch progress monitoring
│   ├── templates/           # React Email rendering
│   │   └── renderer.ts      # Template renderer
│   ├── types/               # TypeScript type definitions
│   │   ├── email.ts         # Email message types
│   │   ├── queue.ts         # Queue job types
│   │   ├── result.ts        # Result/error types
│   │   └── webhook.ts       # Webhook event types
│   ├── utils/               # Shared utilities
│   │   └── logger.ts        # Scoped loggers
│   ├── webhooks/            # Webhook processing
│   │   ├── handler.ts       # Webhook handler
│   │   └── parser.ts        # Event parser
│   └── __tests__/           # Test files
├── package.json
├── tsconfig.json            # Development config
├── tsconfig.build.json      # Build config
└── vitest.config.ts         # Test configuration
```

## Development Commands

```bash
pnpm build              # Build library (clean + tsc + tsc-alias)
pnpm clean              # Remove dist directory
pnpm type-check         # TypeScript validation without emit

pnpm test               # Run tests once
pnpm test:watch         # Watch mode for tests
pnpm test:coverage      # Generate coverage report
pnpm test:ui            # Open Vitest UI

pnpm lint               # Biome check with auto-fix
pnpm format             # Prettier formatting

pnpm changeset          # Create changeset for version bump
```

## Architecture

### Main Entry Point

`createEmailManager()` is the primary API. It creates an instance that manages:

- Provider communication (Resend)
- Queue operations (memory or SQLite)
- Template rendering (React Email)
- Rate limiting coordination

### Rate Limiting

Two levels of rate limiting:

1. **Global Rate Limiter** (`lib/rate-limiter.ts`): Module-level singleton using token bucket algorithm. Configured once at app startup via `configureGlobalRateLimit()`. All direct sends respect this limit.

2. **Queue Rate Limiter**: Each queue instance has its own rate limiter for sequential processing of queued jobs.

### Queue Processing

Queues process jobs **sequentially** (not concurrently) to ensure rate limits are respected:

- Token bucket controls timing between sends
- Default rate: 2 emails/second (Resend free tier safe)
- Exponential backoff on failures
- Automatic retry with configurable limits

### Storage Backends

- **Memory** (default): Fast, non-persistent, for transient queues
- **SQLite**: Persistent storage with automatic cleanup, uses `env-paths` for platform-specific data directories

### Batch Processing

`sendBatch()` creates an ephemeral SQLite queue for the batch:

1. Creates temporary database
2. Adds all messages
3. Processes with rate limiting and retries
4. Returns summary on completion
5. Auto-destroys database

## Key Types

### Result Pattern

All operations return discriminated unions:

```typescript
type Result<T> =
	| { success: true; data: T }
	| { success: false; error: EmailError }
```

### Email Error Codes

```typescript
type EmailErrorCode =
	| 'VALIDATION_ERROR'
	| 'AUTHENTICATION_ERROR'
	| 'RATE_LIMIT_ERROR'
	| 'PROVIDER_ERROR'
	| 'NETWORK_ERROR'
	| 'TEMPLATE_ERROR'
	| 'UNKNOWN_ERROR'
```

### Queue Job Status

```typescript
type QueueJobStatus =
	| 'pending'
	| 'processing'
	| 'completed'
	| 'failed'
	| 'retrying'
```

## Testing

Tests use Vitest with comprehensive mocking:

- Provider tests mock the Resend client
- Queue tests use in-memory backends
- Rate limiter tests use controlled timing
- Logger is mocked to avoid noise

Mock patterns:

```typescript
vi.mock('../utils/logger.js', () => ({
	queueLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	logger: { info: vi.fn() },
}))
```

## Logging

Uses `@nextnode/logger` with scoped prefixes:

- `logger` - Main library logger
- `providerLogger` - Provider operations
- `queueLogger` - Queue processing
- `templateLogger` - Template rendering
- `webhookLogger` - Webhook handling

## Default Configuration

```typescript
// Queue defaults (from lib/constants.ts)
{
  maxRetries: 3,
  retryDelay: 1000,      // 1 second
  maxRetryDelay: 60_000, // 1 minute
  rateLimit: 2,          // 2 emails/second (Resend safe)
  batchSize: 10,
}

// Batch defaults
{
  timeout: 300_000,      // 5 minutes
}
```

## Adding New Providers

1. Create provider in `src/providers/` implementing `EmailProvider` interface
2. Add to `ProviderConfigMap` and `ProviderClientMap` in `registry.ts`
3. Update `createProvider()` factory
4. Add tests

## Dependencies

**Production:**

- `@nextnode/logger` - Logging
- `@react-email/render` - Template rendering
- `env-paths` - Platform-specific data directories
- `resend` - Resend API client

**Peer (optional):**

- `react` - Required for React Email templates

## Environment Requirements

- Node.js >=24.0.0
- pnpm 10.11.0+
- TypeScript 5.0+

## Common Tasks

### Adding a queue callback

```typescript
const emailManager = createEmailManager({
	provider: 'resend',
	providerConfig: { apiKey: '...' },
	queue: {
		onProgress: stats => console.log(stats),
		onComplete: summary => console.log(summary),
	},
})
```

### Testing rate limiting

Use `resetGlobalRateLimiter()` between tests to ensure clean state.

### Debugging queue issues

Enable debug logging via `LOG_LEVEL=debug` environment variable.
