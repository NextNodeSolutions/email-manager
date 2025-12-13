# @nextnode/email-manager

A flexible, provider-agnostic email management library for NextNode projects with React Email templates, built-in queuing, and webhook handling.

## Features

- **Provider-agnostic**: Currently supports Resend, architecture ready for easy extension
- **React Email templates**: Type-safe JSX email templates with automatic HTML/text rendering
- **Built-in queue**: In-memory or persistent SQLite queue with retry logic, rate limiting, and exponential backoff
- **Webhook handling**: Framework-agnostic webhook processing with signature verification
- **Type-safe**: Full TypeScript support with discriminated unions for error handling

## Installation

```bash
pnpm add @nextnode/email-manager
```

### Peer Dependencies

If using React Email templates:

```bash
pnpm add react
```

## Quick Start

```typescript
import { createEmailManager } from '@nextnode/email-manager'

const emailManager = createEmailManager({
	provider: 'resend',
	providerConfig: { apiKey: process.env.RESEND_API_KEY },
	defaultFrom: 'noreply@myapp.com',
	queue: { maxRetries: 3, rateLimit: 10 },
})

// Send a simple email
const result = await emailManager.send({
	to: 'user@example.com',
	subject: 'Hello',
	html: '<h1>Welcome!</h1>',
})

if (result.success) {
	console.log('Email sent:', result.data.id)
} else {
	console.error('Failed:', result.error.message)
}
```

## API Reference

### createEmailManager

Create an email manager instance with the specified configuration.

```typescript
const emailManager = createEmailManager({
	provider: 'resend',
	providerConfig: { apiKey: 'your-api-key' },
	defaultFrom: 'noreply@myapp.com', // Optional: default sender
	queue: { maxRetries: 3 }, // Optional: queue config, false to disable
	templateOptions: { pretty: false }, // Optional: template rendering options
})
```

### Sending Emails

#### Direct Send

```typescript
const result = await emailManager.send({
	from: 'sender@example.com', // Optional if defaultFrom is set
	to: 'user@example.com',
	subject: 'Welcome!',
	html: '<h1>Hello</h1>',
	text: 'Hello', // Optional: auto-generated from HTML if omitted
})
```

#### With React Email Template

```typescript
import { WelcomeEmail } from './emails/welcome'

const result = await emailManager.sendTemplate({
	to: 'user@example.com',
	subject: 'Welcome!',
	template: WelcomeEmail,
	props: { name: 'John', verifyUrl: 'https://...' },
})
```

#### Batch Send

```typescript
const result = await emailManager.sendBatch([
	{ to: 'user1@example.com', subject: 'Newsletter', html: '...' },
	{ to: 'user2@example.com', subject: 'Newsletter', html: '...' },
])

console.log(`Sent: ${result.data.successful}/${result.data.total}`)
```

### Queue Management

#### Enqueue for Later

```typescript
// Queue immediately
const job = await emailManager.enqueue(message)

// Schedule for future
const scheduledJob = await emailManager.enqueue(message, new Date('2025-01-01'))
```

#### Start/Stop Processing

```typescript
emailManager.startQueue() // Start processing
await emailManager.stopQueue() // Stop gracefully
```

#### Send via Queue

```typescript
// Use queue for single email
await emailManager.send(message, { useQueue: true })

// Use queue for batch
await emailManager.sendBatch(messages, { useQueue: true })
```

### Webhook Handling

Process email delivery events (bounces, complaints, opens, clicks).

```typescript
import { createWebhookHandler } from '@nextnode/email-manager'

const webhooks = createWebhookHandler({
	secret: process.env.WEBHOOK_SECRET,
	verifySignature: true,
})

// Register handlers
webhooks.on('email.delivered', async event => {
	console.log('Delivered:', event.data.email_id)
})

webhooks.on('email.bounced', async event => {
	console.log('Bounced:', event.data.bounce.type)
	// Handle bounce - unsubscribe user, etc.
})

webhooks.on('email.complained', async event => {
	// Handle spam complaint
})

// In your route handler (works with any framework)
export async function POST(request: Request) {
	const body = await request.text()
	const signature = request.headers.get('svix-signature')

	const result = await webhooks.process(body, signature)

	if (!result.success) {
		return new Response(result.error.message, { status: 400 })
	}

	return new Response('OK', { status: 200 })
}
```

## Configuration

### Queue Options

```typescript
interface QueueOptions {
	concurrency?: number // Max concurrent sends (default: 5)
	maxRetries?: number // Max retry attempts (default: 3)
	retryDelay?: number // Initial retry delay in ms (default: 1000)
	maxRetryDelay?: number // Max retry delay in ms (default: 30000)
	rateLimit?: number // Emails per second (default: 10)
	batchSize?: number // Batch processing size (default: 10)
	backendConfig?: QueueBackendConfig // Storage backend (default: memory)
}
```

### Queue Storage Backends

By default, the queue uses in-memory storage. For persistence across restarts, use the SQLite backend.

#### In-Memory (Default)

```typescript
const emailManager = createEmailManager({
	provider: 'resend',
	providerConfig: { apiKey: process.env.RESEND_API_KEY },
	queue: { maxRetries: 3 }, // Uses in-memory backend
})
```

#### SQLite (Persistent)

The SQLite backend stores jobs in the system data directory:

| Platform | Location                                                 |
| -------- | -------------------------------------------------------- |
| Linux    | `~/.local/share/email-manager/{appName}/`                |
| macOS    | `~/Library/Application Support/email-manager/{appName}/` |
| Windows  | `%LOCALAPPDATA%\email-manager\Data\{appName}\`           |

```typescript
const emailManager = createEmailManager({
	provider: 'resend',
	providerConfig: { apiKey: process.env.RESEND_API_KEY },
	queue: {
		maxRetries: 3,
		backendConfig: {
			backend: 'sqlite',
			appName: 'my-app', // Required: unique app identifier
		},
	},
})
```

##### Multi-Queue Support

Use `databaseKey` to create multiple queues within the same app:

```typescript
// Transactional emails
const transactionalQueue = createEmailManager({
	provider: 'resend',
	providerConfig: { apiKey: process.env.RESEND_API_KEY },
	queue: {
		backendConfig: {
			backend: 'sqlite',
			appName: 'my-app',
			databaseKey: 'transactional', // Uses: {dataDir}/my-app/transactional.db
		},
	},
})

// Marketing emails (different retry strategy)
const marketingQueue = createEmailManager({
	provider: 'resend',
	providerConfig: { apiKey: process.env.RESEND_API_KEY },
	queue: {
		maxRetries: 5,
		backendConfig: {
			backend: 'sqlite',
			appName: 'my-app',
			databaseKey: 'marketing', // Uses: {dataDir}/my-app/marketing.db
			retentionHours: 48, // Keep completed jobs for 2 days
		},
	},
})
```

##### SQLite Backend Options

```typescript
interface SQLiteBackendConfig {
	backend: 'sqlite'
	appName: string // Required: prevents conflicts between apps
	databaseKey?: string // Optional: queue identifier (default: 'queue')
	retentionHours?: number // Cleanup interval for completed jobs (default: 168 = 7 days)
}
```

### Email Message

```typescript
interface EmailMessage {
	from: string | { email: string; name?: string }
	to: string | string[] | { email: string; name?: string }[]
	subject: string
	html?: string
	text?: string
	cc?: string | string[]
	bcc?: string | string[]
	replyTo?: string | string[]
	attachments?: EmailAttachment[]
	headers?: { name: string; value: string }[]
	tags?: { name: string; value: string }[]
	scheduledAt?: Date | string
}
```

## React Email Templates

Create type-safe email templates using React Email components:

```typescript
// emails/welcome.tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components'

interface WelcomeEmailProps {
  name: string
  verifyUrl: string
}

export const WelcomeEmail = ({ name, verifyUrl }: WelcomeEmailProps) => (
  <Html>
    <Head />
    <Body>
      <Container>
        <Text>Welcome, {name}!</Text>
        <Button href={verifyUrl}>Verify Email</Button>
      </Container>
    </Body>
  </Html>
)
```

## i18n

Internationalization is the responsibility of the client application. Pass already-translated content:

```typescript
const t = getTranslations('emails')

await emailManager.sendTemplate({
	to: user.email,
	subject: t('welcome.subject'),
	template: WelcomeEmail,
	props: {
		greeting: t('welcome.greeting', { name: user.name }),
	},
})
```

## Error Handling

All operations return discriminated union results for type-safe error handling:

```typescript
const result = await emailManager.send(message)

if (result.success) {
	// TypeScript knows result.data exists
	console.log('Sent:', result.data.id)
} else {
	// TypeScript knows result.error exists
	console.error(result.error.code, result.error.message)
}
```

### Error Codes

- `VALIDATION_ERROR` - Invalid message format
- `AUTHENTICATION_ERROR` - Invalid API key
- `RATE_LIMIT_ERROR` - Rate limit exceeded
- `PROVIDER_ERROR` - Provider-specific error
- `NETWORK_ERROR` - Network failure
- `TEMPLATE_ERROR` - Template rendering failed
- `UNKNOWN_ERROR` - Unexpected error

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Type check
pnpm type-check

# Lint
pnpm lint
```

## License

ISC
