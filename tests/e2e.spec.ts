import { describe, expect, it } from 'vitest'
import { COMPLETIONS_PROVIDER_ID, OpenAiSearchProvider } from '../src/provider.js'
import type { OpenAiSearchOptions } from '../src/types.js'

const API_KEY = process.env.TENCENT_TOKENHUB_API_KEY

/**
 * Live smoke test against the tokenhub dialect. Self-skips without a key so a plain CI run
 * never touches the gateway.
 */
describe.skipIf(API_KEY === undefined || API_KEY.trim().length === 0)('live tokenhub search', () => {
  it('returns content and structured sources over the completions route', async () => {
    const provider = new OpenAiSearchProvider(
      COMPLETIONS_PROVIDER_ID,
      (): OpenAiSearchOptions => ({
        apiKeyEnv: 'TENCENT_TOKENHUB_API_KEY',
        baseURL: 'https://tokenhub.tencentmaas.com/v1',
        model: 'deepseek-v4-flash',
        searchOption: 'tokenhub',
        reasoningEffort: 'low',
        timeoutMs: 60_000,
        resolveApiKey: async () => API_KEY!,
      }),
    )
    const result = await provider.search({ query: '北京今天天气', maxResults: 8 })
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) {
      expect(source.url).toMatch(/^https?:\/\//)
    }
  }, 90_000)
})
