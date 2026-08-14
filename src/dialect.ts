import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { cleanSnippet } from './text.js'
import type { CompletionsDialect } from './types.js'

/**
 * The tokenhub dialect: the search switch is `web_search_options.enable`, the generated answer
 * is `choices[0].message.content`, and structured results are `choices[0].message.search_results`
 * (`url`, `name`, `snippet`, `site`). Verified against the real gateway.
 */
const tokenhub: CompletionsDialect = {
  name: 'tokenhub',
  requestExtension(options) {
    const webSearchOptions: Record<string, unknown> = { enable: true }
    if (options.searchSource !== undefined) webSearchOptions.search_source = options.searchSource
    return { web_search_options: webSearchOptions }
  },
  extractSearchResults(payload) {
    const message = messageOf(payload)
    return Array.isArray(message?.search_results) ? message.search_results : []
  },
  extractContent(payload) {
    const content = messageOf(payload)?.content
    return typeof content === 'string' && content.trim().length > 0 ? content : undefined
  },
  mapSource(item) {
    if (item === null || typeof item !== 'object') return undefined
    const record = item as Record<string, unknown>
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    if (url.length === 0) return undefined
    const title = typeof record.name === 'string' ? record.name.trim() : ''
    const snippet = typeof record.snippet === 'string' ? cleanSnippet(record.snippet) : ''
    const source: WebSearchSource = {
      url,
      ...(title.length > 0 ? { title } : {}),
      ...(snippet.length > 0 ? { snippet } : {}),
    }
    return source
  },
}

function messageOf(payload: unknown): Record<string, unknown> | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return undefined
  const first = choices[0]
  if (first === null || typeof first !== 'object') return undefined
  const message = (first as { message?: unknown }).message
  return message !== null && typeof message === 'object' ? (message as Record<string, unknown>) : undefined
}

/** Registered Completions-route dialects. Adding a vendor adds one entry. */
export const COMPLETIONS_DIALECTS: ReadonlyMap<string, CompletionsDialect> = new Map([['tokenhub', tokenhub]])
