import type { WebSearchSource } from '@deepseek-ai/dsh-web'

/**
 * Structural contract of the optional credentials service. The full interface is owned by
 * `@deepseek-ai/dsh-credentials`; this package keeps a minimal local face to avoid a runtime
 * dependency on it.
 */
export interface CredentialsLike {
  resolve(ref: string): Promise<{ value: string } | undefined>
}

/** Structural contract of the optional agent/session chain, used only for the auxiliary request log event. */
export interface RequestLogLike {
  append(name: string, data: object, opts?: { ignorable?: true }): void
}

export interface AgentsLike {
  currentInitiator(): { session: RequestLogLike } | undefined
}

/** Minimal face of the Cordis context this plugin consumes (`ctx.get` plus the injected `web` seam). */
export interface PluginContextLike {
  get(name: string): unknown
  web: {
    registerSearchProvider(provider: unknown): () => void
  }
}

/** Plugin config, fully provider-neutral: `apiKeyEnv`/`baseURL`/`model` are required at load. */
export interface OpenAiSearchConfig {
  apiKeyEnv?: string
  baseURL?: string
  model?: string
  searchOption?: string
  reasoningEffort?: string
  searchSource?: string
  maxTokens?: number
  timeoutMs?: number
}

/** One operation's resolved options; projected fresh per search. */
export interface OpenAiSearchOptions {
  apiKeyEnv: string
  baseURL: string
  model: string
  searchOption?: string
  reasoningEffort?: string
  searchSource?: string
  maxTokens?: number
  timeoutMs: number
  resolveApiKey(signal?: AbortSignal): Promise<string>
  recordRequest?: (payload: object) => void
}

/**
 * A Completions-route search dialect: one vendor's wire spelling of the search switch and of
 * the fields carrying the generated answer and structured results. Adding a vendor adds one
 * dialect entry; existing entries never change.
 */
export interface CompletionsDialect {
  name: string
  requestExtension(options: OpenAiSearchOptions): Record<string, unknown>
  extractSearchResults(payload: unknown): unknown[]
  extractContent(payload: unknown): string | undefined
  mapSource(item: unknown): WebSearchSource | undefined
}
