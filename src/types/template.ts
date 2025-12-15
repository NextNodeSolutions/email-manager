/**
 * Template type definitions
 * Types for React Email template rendering
 */

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
	text?: string | undefined
}
