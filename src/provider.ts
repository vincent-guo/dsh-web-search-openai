import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { COMPLETIONS_DIALECTS } from './dialect.js'
import type { OpenAiSearchOptions } from './types.js'

export const COMPLETIONS_PROVIDER_ID = 'openai-completions'
export const RESPONSES_PROVIDER_ID = 'openai-responses'

const USER_AGENT = 'dsh-web-search-openai/0.1.0'

/**
 * An OpenAI-compatible search provider. One package instance registers two providers over the
 * same endpoint configuration: the Completions route (vendor search extension, dialect-selected)
 * and the Responses route (native `web_search` tool per the OpenAI spec). Selection between them
 * is the web seam's explicit `searchProvider` config.
 */
export class OpenAiSearchProvider implements WebSearchProvider {
  constructor(
    readonly id: string,
    private readonly resolveOptions: () => OpenAiSearchOptions | undefined,
  ) {}

  available(): boolean {
    const options = this.resolveOptions()
    if (options === undefined) return false
    if (this.id === COMPLETIONS_PROVIDER_ID) {
      return options.searchOption !== undefined && COMPLETIONS_DIALECTS.has(options.searchOption)
    }
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.resolveOptions()
    if (options === undefined) {
      throw new WebError('openai web search provider is not configured', 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
    }
    if (this.id === COMPLETIONS_PROVIDER_ID) return this.searchCompletions(request, options, signal)
    return this.searchResponses(request, options, signal)
  }

  private async searchCompletions(
    request: WebSearchRequest,
    options: OpenAiSearchOptions,
    signal?: AbortSignal,
  ): Promise<WebSearchResult> {
    const dialect = options.searchOption === undefined ? undefined : COMPLETIONS_DIALECTS.get(options.searchOption)
    if (dialect === undefined) {
      throw new WebError(`openai web search: unknown searchOption "${options.searchOption}"`, 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
    }
    const body = {
      model: options.model,
      messages: [{ role: 'user', content: request.query }],
      ...dialect.requestExtension(options),
      ...(options.reasoningEffort !== undefined ? { reasoning_effort: options.reasoningEffort } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    }
    const endpoint = `${trimBase(options.baseURL)}/chat/completions`
    const payload = await this.post(endpoint, body, options, signal)
    options.recordRequest?.({ endpoint, body })
    const sources = dedupeSources(dialect.extractSearchResults(payload).map((item) => dialect.mapSource(item)))
    const content = dialect.extractContent(payload)
    return { ...(content !== undefined ? { content } : {}), sources, truncated: false }
  }

  private async searchResponses(
    request: WebSearchRequest,
    options: OpenAiSearchOptions,
    signal?: AbortSignal,
  ): Promise<WebSearchResult> {
    const body = {
      model: options.model,
      input: request.query,
      tools: [{ type: 'web_search' }],
    }
    const endpoint = `${trimBase(options.baseURL)}/responses`
    const payload = await this.post(endpoint, body, options, signal)
    options.recordRequest?.({ endpoint, body })
    const mapped = mapResponsesPayload(payload)
    return { ...(mapped.content !== undefined ? { content: mapped.content } : {}), sources: mapped.sources, truncated: false }
  }

  private async post(
    endpoint: string,
    body: object,
    options: OpenAiSearchOptions,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const apiKey = await options.resolveApiKey(signal)
    if (signal?.aborted) throw aborted()
    const timeout = AbortSignal.timeout(options.timeoutMs)
    const combined = signal !== undefined ? AbortSignal.any([signal, timeout]) : timeout
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify(body),
        signal: combined,
      })
    } catch (error) {
      if (signal?.aborted) throw aborted()
      if (isAbortError(error)) {
        throw new WebError(`OpenAI search request timed out after ${options.timeoutMs} ms`, 'WEB_PROVIDER_ERROR', { cause: error })
      }
      throw new WebError(`OpenAI search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (!response.ok) {
      let detail = `OpenAI search API error (HTTP ${response.status})`
      try {
        const parsed: unknown = await response.json()
        const candidate = parsed !== null && typeof parsed === 'object' ? errorDetail(parsed) : undefined
        if (candidate !== undefined && candidate.length > 0) detail = candidate
      } catch {
        if (signal?.aborted) throw aborted()
      }
      throw new WebError(detail, 'WEB_PROVIDER_ERROR')
    }
    try {
      return await response.json()
    } catch (error) {
      if (signal?.aborted) throw aborted()
      throw new WebError(`OpenAI search returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/**
 * Map a Responses payload: the generated answer comes from `message` items' `output_text` blocks
 * (joined), sources from `url_citation` annotations. Gateways that execute the native search but
 * return no annotations degrade honestly to answer-only (sources empty).
 */
export function mapResponsesPayload(payload: unknown): { content?: string; sources: WebSearchSource[] } {
  const output = payload !== null && typeof payload === 'object' ? (payload as { output?: unknown }).output : undefined
  if (!Array.isArray(output)) return { sources: [] }
  const textParts: string[] = []
  const sources: WebSearchSource[] = []
  for (const item of output) {
    if (item === null || typeof item !== 'object') continue
    const record = item as { type?: unknown; content?: unknown }
    if (record.type !== 'message' || !Array.isArray(record.content)) continue
    for (const block of record.content) {
      if (block === null || typeof block !== 'object') continue
      const entry = block as { type?: unknown; text?: unknown; annotations?: unknown }
      if (entry.type === 'output_text' && typeof entry.text === 'string' && entry.text.length > 0) textParts.push(entry.text)
      if (!Array.isArray(entry.annotations)) continue
      for (const annotation of entry.annotations) {
        if (annotation === null || typeof annotation !== 'object') continue
        const cite = annotation as { type?: unknown; url?: unknown; title?: unknown }
        if (cite.type !== 'url_citation' || typeof cite.url !== 'string' || cite.url.trim().length === 0) continue
        const title = typeof cite.title === 'string' ? cite.title.trim() : ''
        const source: WebSearchSource = {
          url: cite.url.trim(),
          ...(title.length > 0 ? { title } : {}),
        }
        sources.push(source)
      }
    }
  }
  const content = textParts.join('\n\n').trim()
  return { ...(content.length > 0 ? { content } : {}), sources: dedupeSources(sources) }
}

/** Deduplicate sources by URL, keeping the first occurrence. */
export function dedupeSources(candidates: readonly (WebSearchSource | undefined)[]): WebSearchSource[] {
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const candidate of candidates) {
    if (candidate === undefined || seen.has(candidate.url)) continue
    seen.add(candidate.url)
    sources.push(candidate)
  }
  return sources
}

function aborted(): WebError {
  return new WebError('OpenAI search aborted', 'WEB_ABORTED')
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function trimBase(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

function errorDetail(parsed: object): string | undefined {
  const record = parsed as { error?: unknown; message?: unknown }
  if (typeof record.error === 'string') return record.error
  if (record.error !== null && typeof record.error === 'object') {
    const inner = record.error as { message?: unknown }
    if (typeof inner.message === 'string') return inner.message
  }
  return typeof record.message === 'string' ? record.message : undefined
}
