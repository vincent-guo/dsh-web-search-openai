/**
 * Strip inline HTML markup and decode common entities from a provider snippet. Snippets reach
 * the model as plain markdown-adjacent text; raw tags and entities only add noise.
 *
 * @param raw - the provider-supplied snippet text.
 * @param maxChars - output length bound, applied after cleaning.
 * @returns the cleaned, whitespace-collapsed prefix.
 */
export function cleanSnippet(raw: string, maxChars = 500): string {
  let text = raw.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ')
  text = text.replace(/&#(\d+);/g, (_match, code: string) => {
    const point = Number(code)
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
  })
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}
