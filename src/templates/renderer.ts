/**
 * Template renderer
 * React Email template rendering utilities
 */

import { render } from '@react-email/render'

import type {
	EmailTemplateComponent,
	TemplateRenderOptions,
	RenderedTemplate,
} from '../types/index.js'

/**
 * Default render options
 */
const DEFAULT_OPTIONS: Required<TemplateRenderOptions> = {
	generateText: true,
	pretty: false,
}

/**
 * Render a React Email template to HTML and optionally plain text
 *
 * @param template - React Email component function
 * @param props - Props to pass to the template
 * @param options - Render options
 * @returns Rendered HTML and optional text content
 *
 * @example
 * ```typescript
 * const { html, text } = await renderTemplate(
 *   WelcomeEmail,
 *   { name: 'John', verificationUrl: 'https://...' },
 *   { generateText: true }
 * )
 * ```
 */
export async function renderTemplate<TProps>(
	template: EmailTemplateComponent<TProps>,
	props: TProps,
	options: TemplateRenderOptions = {},
): Promise<RenderedTemplate> {
	const config = { ...DEFAULT_OPTIONS, ...options }

	// Create React element from the template component
	const element = template(props)

	// Render to HTML
	const html = await render(element as React.ReactElement, {
		pretty: config.pretty,
	})

	// Optionally generate plain text version
	let text: string | undefined
	if (config.generateText) {
		text = await render(element as React.ReactElement, {
			plainText: true,
		})
	}

	return { html, text }
}

/**
 * Render a React Email template to HTML only (synchronous-style async)
 *
 * @param template - React Email component function
 * @param props - Props to pass to the template
 * @param pretty - Whether to pretty print the HTML
 * @returns Rendered HTML string
 */
export async function renderTemplateToHtml<TProps>(
	template: EmailTemplateComponent<TProps>,
	props: TProps,
	pretty = false,
): Promise<string> {
	const element = template(props)
	return render(element as React.ReactElement, { pretty })
}

/**
 * Render a React Email template to plain text only
 *
 * @param template - React Email component function
 * @param props - Props to pass to the template
 * @returns Rendered plain text string
 */
export async function renderTemplateToText<TProps>(
	template: EmailTemplateComponent<TProps>,
	props: TProps,
): Promise<string> {
	const element = template(props)
	return render(element as React.ReactElement, { plainText: true })
}
