/**
 * Email type definitions
 * Core types for email messages, recipients, and attachments
 */

/**
 * Email recipient - string or object with name
 */
export type EmailRecipient = string | { email: string; name?: string }

/**
 * Email attachment
 */
export interface EmailAttachment {
	/** Filename with extension */
	filename: string
	/** Content as Buffer, base64 string, or URL */
	content: Buffer | string
	/** Optional content type (e.g., 'application/pdf') */
	contentType?: string
}

/**
 * Email header
 */
export interface EmailHeader {
	name: string
	value: string
}

/**
 * Email tag for tracking/analytics
 */
export interface EmailTag {
	name: string
	value: string
}

/**
 * Core email message interface
 */
export interface EmailMessage {
	/** Sender email address or object with name */
	from: EmailRecipient
	/** Primary recipient(s) - max 50 */
	to: EmailRecipient | EmailRecipient[]
	/** Email subject */
	subject: string
	/** CC recipients */
	cc?: EmailRecipient | EmailRecipient[]
	/** BCC recipients */
	bcc?: EmailRecipient | EmailRecipient[]
	/** Reply-to address(es) */
	replyTo?: EmailRecipient | EmailRecipient[]
	/** HTML content */
	html?: string
	/** Plain text content (auto-generated from HTML if omitted) */
	text?: string
	/** File attachments */
	attachments?: EmailAttachment[]
	/** Custom headers */
	headers?: EmailHeader[]
	/** Tags for tracking */
	tags?: EmailTag[]
	/** Schedule send time (ISO 8601 or Date) */
	scheduledAt?: string | Date
}

/**
 * React component type (generic to avoid hard React dependency at compile time)
 * The actual component will be a React functional component
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EmailTemplateComponent<TProps = any> = (props: TProps) => unknown

/**
 * Email message with React Email template support
 */
export interface TemplatedEmailMessage<TProps = Record<string, unknown>>
	extends Omit<EmailMessage, 'html' | 'text'> {
	/** React Email component */
	template: EmailTemplateComponent<TProps>
	/** Props for the template */
	props: TProps
}
