/**
 * Provider registry
 * Factory pattern for creating email providers
 */

import type { Resend } from 'resend'

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

/**
 * Get list of supported providers
 */
export const getSupportedProviders = (): Array<keyof ProviderConfigMap> => [
	'resend',
]

/**
 * Check if a provider is supported
 */
export const isProviderSupported = (
	name: string,
): name is keyof ProviderConfigMap =>
	getSupportedProviders().includes(name as keyof ProviderConfigMap)
