/**
 * Template type definitions
 * Types for React Email template rendering
 */

import type { EmailTemplateComponent } from './email.js'

/**
 * Template render options
 */
export interface TemplateRenderOptions {
	/** Generate plain text version */
	generateText?: boolean
	/** Pretty print HTML (dev only) */
	pretty?: boolean
}

/**
 * Rendered template output
 */
export interface RenderedTemplate {
	/** HTML content */
	html: string
	/** Plain text content (if generated) */
	text?: string
}

/**
 * Template registry entry
 */
export interface TemplateEntry<TProps = Record<string, unknown>> {
	/** Template component */
	component: EmailTemplateComponent<TProps>
	/** Template name/identifier */
	name: string
	/** Default props (optional) */
	defaultProps?: Partial<TProps>
}

/**
 * Type-safe template map
 */
export type TemplateMap = Record<string, TemplateEntry>
