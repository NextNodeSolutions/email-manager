/**
 * Provider type definitions
 * Strategy pattern interface for email providers
 */

import type { EmailMessage } from './email.js'
import type { BatchSendResult, SendResult } from './result.js'

/**
 * Provider configuration interface
 */
export interface ProviderConfig {
	/** API key for authentication */
	apiKey: string
	/** Optional base URL override */
	baseUrl?: string
	/** Request timeout in ms */
	timeout?: number
}

/**
 * Email provider interface - Strategy pattern
 * All providers must implement this contract
 */
export interface EmailProvider {
	/** Provider name identifier */
	readonly name: string

	/**
	 * Send a single email
	 */
	send(message: EmailMessage): Promise<SendResult>

	/**
	 * Send multiple emails in batch
	 */
	sendBatch(messages: EmailMessage[]): Promise<BatchSendResult>

	/**
	 * Validate provider configuration
	 */
	validateConfig(): Promise<boolean>
}
