import z from '@deepseek-ai/schemastery'
import { WebError } from '@deepseek-ai/dsh-web'
import { COMPLETIONS_DIALECTS } from './dialect.js'
import { COMPLETIONS_PROVIDER_ID, OpenAiSearchProvider, RESPONSES_PROVIDER_ID } from './provider.js'
import type { AgentsLike, CredentialsLike, OpenAiSearchConfig, OpenAiSearchOptions, PluginContextLike } from './types.js'

export const name = 'web-search-openai'
export const inject = ['web']

/** Fully provider-neutral config: every endpoint/model/key field is required, no vendor defaults. */
export const Config = z.object({
  apiKeyEnv: z.string().min(1).description('Credential reference resolved per search, e.g. TENCENT_TOKENHUB_API_KEY.'),
  baseURL: z.string().min(1).description('OpenAI-compatible endpoint base; /chat/completions or /responses is appended.'),
  model: z.string().min(1).description('Model name served by the endpoint.'),
  searchOption: z.string().min(1).description('Completions-route search dialect; supported: tokenhub.'),
  reasoningEffort: z.string().min(1).description('Optional reasoning effort sent on the Completions route.'),
  searchSource: z.string().min(1).description('Optional search version carried by the Completions dialect.'),
  maxTokens: z.number().step(1).min(1).description('Optional max_tokens for the Completions route.'),
  timeoutMs: z.number().step(1).min(1).default(30_000),
})

/**
 * Register both OpenAI-compatible search providers into `ctx.web`. Selection is the web seam's
 * explicit `searchProvider` config (`openai-completions` or `openai-responses`); registering both
 * keeps one package able to serve either protocol, including both at once against two gateways.
 */
export function apply(ctx: PluginContextLike, config: OpenAiSearchConfig) {
  projectOptions(ctx, config) // fail loud at load on an unusable config
  const options = () => projectOptions(ctx, config)
  ctx.web.registerSearchProvider(new OpenAiSearchProvider(COMPLETIONS_PROVIDER_ID, options))
  ctx.web.registerSearchProvider(new OpenAiSearchProvider(RESPONSES_PROVIDER_ID, options))
}

function projectOptions(ctx: PluginContextLike, config: OpenAiSearchConfig): OpenAiSearchOptions {
  const { apiKeyEnv, baseURL, model, searchOption, reasoningEffort, searchSource, maxTokens, timeoutMs } = config
  if (apiKeyEnv === undefined || apiKeyEnv.trim().length === 0) {
    throw new Error('web-search-openai: apiKeyEnv is required')
  }
  if (baseURL === undefined || !URL.canParse(baseURL)) {
    throw new Error('web-search-openai: baseURL must be a parseable URL')
  }
  if (model === undefined || model.trim().length === 0) {
    throw new Error('web-search-openai: model is required')
  }
  if (searchOption !== undefined && !COMPLETIONS_DIALECTS.has(searchOption)) {
    const supported = [...COMPLETIONS_DIALECTS.keys()].join(', ')
    throw new Error(`web-search-openai: unknown searchOption "${searchOption}" (supported: ${supported})`)
  }
  return {
    apiKeyEnv,
    baseURL,
    model,
    searchOption,
    reasoningEffort,
    searchSource,
    maxTokens,
    timeoutMs: timeoutMs ?? 30_000,
    resolveApiKey: (signal) => resolveApiKey(ctx, apiKeyEnv, signal),
    recordRequest: (payload) => {
      const agents = ctx.get('agents') as AgentsLike | undefined
      const session = agents?.currentInitiator()?.session
      session?.append('web/openai-search-request', payload)
    },
  }
}

async function resolveApiKey(ctx: PluginContextLike, apiKeyEnv: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new WebError('OpenAI search aborted', 'WEB_ABORTED')
  const credentials = ctx.get('credentials') as CredentialsLike | undefined
  if (credentials !== undefined) {
    const resolved = await credentials.resolve(apiKeyEnv)
    if (resolved !== undefined && resolved.value.trim().length > 0) return resolved.value.trim()
  }
  const ambient = process.env[apiKeyEnv]
  if (ambient !== undefined && ambient.trim().length > 0) return ambient.trim()
  throw new WebError(
    `OpenAI search has no credential for "${apiKeyEnv}"; store it through the credentials service or export it in the launching environment`,
    'WEB_PROVIDER_CREDENTIAL_MISSING',
  )
}
