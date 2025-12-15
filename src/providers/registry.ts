/**
 * Provider registry
 * Factory pattern for creating email providers
 */

import { Resend } from 'resend'

import type { EmailProvider } from '../types/index.js'
import type { ResendProviderConfig } from './resend.js'
import { createResendProvider } from './resend.js'

/**
 * Provider type to config mapping
 */
export interface ProviderConfigMap {
	resend: ResendProviderConfig
	// Future providers:
	// sendgrid: SendGridProviderConfig
	// ses: SESProviderConfig
	// smtp: SMTPProviderConfig
}

/**
 * Provider client map (SDK instances)
 */
export interface ProviderClientMap {
	resend: Resend
	// Future providers would have their SDK types here
}

/**
 * Create provider SDK client based on provider name
 * @param name - Provider name
 * @param config - Provider configuration
 */
export function createProviderClient<K extends keyof ProviderConfigMap>(
	name: K,
	config: ProviderConfigMap[K],
): ProviderClientMap[K] {
	switch (name) {
		case 'resend':
			return new Resend(config.apiKey) as ProviderClientMap[K]
		default:
			throw new Error(`Unknown provider: ${name}`)
	}
}

/**
 * Create a provider by name
 * @param name - Provider name
 * @param client - Provider SDK client instance
 * @param config - Provider configuration
 */
export function createProvider<K extends keyof ProviderConfigMap>(
	name: K,
	client: ProviderClientMap[K],
	config: ProviderConfigMap[K],
): EmailProvider {
	switch (name) {
		case 'resend':
			return createResendProvider(
				client as Resend,
				config as ResendProviderConfig,
			)
		default:
			throw new Error(`Unknown provider: ${name}`)
	}
}
