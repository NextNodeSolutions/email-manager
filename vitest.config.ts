import baseConfig from '@nextnode/standards/vitest/backend'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			include: ['src/**/*.{test,spec}.ts'],
			// Override base config mock settings to preserve module mocks
			restoreMocks: false,
		},
	}),
)
