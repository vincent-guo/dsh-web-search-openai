import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COMPLETIONS_DIALECTS } from '../src/dialect.js'
import { mapResponsesPayload } from '../src/provider.js'
import { cleanSnippet } from '../src/text.js'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown
}

describe('cleanSnippet', () => {
  it('strips inline HTML and decodes entities', () => {
    const dirty = '“气象北京”消息,今天(8月14日)最高气温31℃。</p><p>紫外线较强。<img src=\'http://x/a.png\'> &nbsp;&amp;'
    expect(cleanSnippet(dirty)).not.toMatch(/<|>|&amp;|&nbsp;/)
    expect(cleanSnippet(dirty)).toContain('31℃')
    expect(cleanSnippet('a &lt; b')).toBe('a < b')
  })

  it('bounds the output length', () => {
    expect(cleanSnippet('a'.repeat(2000)).length).toBe(500)
  })
})

describe('tokenhub completions dialect', () => {
  const dialect = COMPLETIONS_DIALECTS.get('tokenhub')

  it('is registered', () => {
    expect(dialect?.name).toBe('tokenhub')
  })

  it('builds the web_search_options extension', () => {
    const extension = dialect!.requestExtension({ searchSource: 'lite' } as never)
    expect(extension).toEqual({ web_search_options: { enable: true, search_source: 'lite' } })
  })

  it('maps a real gateway payload to content and sources', () => {
    const payload = fixture('tokenhub-completions.json')
    const content = dialect!.extractContent(payload)
    const sources = dialect!
      .extractSearchResults(payload)
      .map((item) => dialect!.mapSource(item))
      .filter((source) => source !== undefined)
    expect(content).toContain('北京今天')
    expect(sources.length).toBe(4)
    for (const source of sources) {
      expect(source!.url).toMatch(/^https?:\/\//)
      expect(source!.title.length).toBeGreaterThan(0)
      expect(source!.snippet).not.toMatch(/<|>/)
    }
  })

  it('returns empty results for a payload without search_results', () => {
    expect(dialect!.extractSearchResults({ choices: [{ message: {} }] })).toEqual([])
    expect(dialect!.extractContent({ choices: [{ message: {} }] })).toBeUndefined()
  })
})

describe('mapResponsesPayload', () => {
  it('maps url_citation annotations to sources and joins output_text', () => {
    const mapped = mapResponsesPayload(fixture('responses-with-annotations.json'))
    expect(mapped.content).toContain('示例回答正文[1]')
    expect(mapped.sources).toEqual([{ url: 'https://example.com/source/1', title: '示例来源标题' }])
  })

  it('degrades honestly to content-only when annotations are absent', () => {
    const mapped = mapResponsesPayload(fixture('responses-no-annotations.json'))
    expect(mapped.sources).toEqual([])
    expect(mapped.content?.length).toBeGreaterThan(100)
  })

  it('handles a payload without output', () => {
    expect(mapResponsesPayload({})).toEqual({ sources: [] })
  })
})
