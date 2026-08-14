import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import { COMPLETIONS_PROVIDER_ID, OpenAiSearchProvider } from '../src/provider.js'
import type { OpenAiSearchOptions } from '../src/types.js'

function options(overrides: Partial<OpenAiSearchOptions> = {}): OpenAiSearchOptions {
  return {
    apiKeyEnv: 'TEST_KEY',
    baseURL: 'https://gateway.example/v1',
    model: 'test-model',
    searchOption: 'tokenhub',
    timeoutMs: 30_000,
    resolveApiKey: async () => 'secret',
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenAiSearchProvider', () => {
  it('requires a known searchOption to be available on the completions route', () => {
    const completions = new OpenAiSearchProvider(COMPLETIONS_PROVIDER_ID, () => options())
    expect(completions.available()).toBe(true)
    expect(new OpenAiSearchProvider(COMPLETIONS_PROVIDER_ID, () => options({ searchOption: 'unknown' })).available()).toBe(false)
    expect(new OpenAiSearchProvider(COMPLETIONS_PROVIDER_ID, () => options({ searchOption: undefined })).available()).toBe(false)
  })

  it('sends the request with redirect rejection and bearer auth', async () => {
    const payload = JSON.parse(readFileSync(new URL('./fixtures/tokenhub-completions.json', import.meta.url), 'utf8')) as object
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new OpenAiSearchProvider(COMPLETIONS_PROVIDER_ID, () => options())
    const result = await provider.search({ query: '北京天气', maxResults: 8 })
    expect(result.sources.length).toBeGreaterThan(0)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gateway.example/v1/chat/completions')
    expect(init.redirect).toBe('error')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret')
    const body = JSON.parse(String(init.body)) as { web_search_options: { enable: boolean } }
    expect(body.web_search_options.enable).toBe(true)
  })

  it('surfaces a gateway error body as WEB_PROVIDER_ERROR', async () => {
    const payload = JSON.parse(readFileSync(new URL('./fixtures/gateway-error.json', import.meta.url), 'utf8')) as object
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 400 })))
    const provider = new OpenAiSearchProvider(COMPLETIONS_PROVIDER_ID, () => options())
    await expect(provider.search({ query: 'x' })).rejects.toThrow(/reasoning_effort/)
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('reports missing credentials with WEB_PROVIDER_CREDENTIAL_MISSING', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const provider = new OpenAiSearchProvider(COMPLETIONS_PROVIDER_ID, () =>
      options({
        resolveApiKey: async () => {
          throw new WebError('no credential', 'WEB_PROVIDER_CREDENTIAL_MISSING')
        },
      }),
    )
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
  })
})
