# dsh-web-search-openai

[中文](README.zh.md) | English

An OpenAI-compatible `WebSearchProvider` for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web capability seam (`ctx.web`). One plugin registers two providers over the same endpoint configuration:

| Provider id | Wire protocol | Search capability |
|---|---|---|
| `openai-completions` | `POST {baseURL}/chat/completions` | Vendor search extension, selected by the `searchOption` dialect |
| `openai-responses` | `POST {baseURL}/responses` | Native `web_search` tool per the OpenAI Responses spec |

This is an **implementation** package: it registers capabilities into `ctx.web` and never owns the key or registers model-facing tools (those belong to `@deepseek-ai/dsh-tool-web`). It is a function/namespace plugin (`name` / `inject` / `Config` / `apply`, no default export).

It is a **third-party** package, not affiliated with DeepSeek. It targets `@deepseek-ai/dsh-web@0.1.0-rc.6` (the `next` dist-tag line; the `latest` tag is stale). The harness is pre-release and may change its contracts.

## Install

```sh
npm install @vincent-guo/dsh-web-search-openai
```

Peer dependencies (`@deepseek-ai/dsh-web@0.1.0-rc.6`, `@deepseek-ai/dsh-session@^0.1.0-rc.6`, `@deepseek-ai/cordis@^4.0.1`) are supplied by the harness installation; install the package into the same profile/workspace so a single instance is shared.

## Configuration

Every provider-specific field is required — no vendor defaults exist. Fill in the endpoint you actually use.

```yaml
- id: web-search-openai
  name: '@vincent-guo/dsh-web-search-openai'
  config:
    apiKeyEnv: TENCENT_TOKENHUB_API_KEY   # credential reference resolved per search
    baseURL: https://<your-gateway>/v1    # /chat/completions or /responses is appended
    model: <model-name>                   # model served by the endpoint
    searchOption: tokenhub                # completions-route dialect (see below)
    # reasoningEffort: low                # optional, completions route only
    # searchSource: lite                  # optional, completions dialect-dependent
    # maxTokens: 2048                     # optional, completions route only
    # timeoutMs: 30000                    # provider-side timeout backstop
```

Select one provider explicitly through the web seam:

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: openai-completions
```

(`DSH_WEB_SEARCH_PROVIDER=openai-completions` is equivalent.)

## Completions-route dialects

The search switch on Chat Completions is a vendor extension, not part of the OpenAI spec. `searchOption` selects one wire spelling; adding a vendor adds one dialect entry.

| Dialect | Request switch | Results field | Content field | Notes |
|---|---|---|---|---|
| `tokenhub` | `web_search_options: {enable: true}` (+ optional `search_source`) | `choices[0].message.search_results[]` (`url`, `name`, `snippet`, `site`) | `choices[0].message.content` | `reasoning_effort` accepts `low`/`medium`/`high`/`xhigh`/`max`; the gateway rejects `no_think` |

## Mapping

- Completions route: `content` ← `choices[0].message.content`; `sources[]` ← `search_results[]` (`url`, `name`→`title`, `snippet` cleaned of inline HTML). Empty `search_results` yields honest empty sources — URLs are never scraped from prose.
- Responses route: `content` ← joined `output_text` blocks of `message` items; `sources[]` ← `url_citation` annotations (`url`, `title`). Gateways that execute the native search but return no annotations degrade to content-only.
- `maxResults` is enforced by the seam (`ctx.web`), which truncates `sources[]` and sets `truncated`; neither route has a request-layer result-count knob.

## Credentials

Resolved per search: the credentials service first (the value stored through the web Models page), then the launching environment. A missing value fails the search with `WEB_PROVIDER_CREDENTIAL_MISSING`.

## Errors

Provider failures surface as `WebError` with the seam's open code set: `WEB_PROVIDER_ERROR` (HTTP, network, timeout, unprocessable body), `WEB_PROVIDER_CREDENTIAL_MISSING`, `WEB_ABORTED` (caller cancellation). Credential-bearing requests use `redirect: "error"` — redirects fail before their target is contacted.

## Auxiliary request logging

When a search is initiated by an agent session, the provider records a `web/openai-search-request` session event carrying the resolved endpoint and the exact request body (no credentials) before the request is sent. The event is informational only and is appended with the `ignorable` marker, so a reader that does not recognize the type skips it safely.

Each harness build ships a static session-event vocabulary (`KNOWN_SESSION_EVENT_TYPES`) and refuses cold loads of logs containing unknown, non-ignorable event types. The event is therefore **only appended when the running build's vocabulary already contains the type**; on builds that predate it (e.g. `dsh-web@0.1.0-rc.6`), the append is skipped and the session log stays loadable everywhere.

## Model Experience

Indirect, through `@deepseek-ai/dsh-tool-web`: the model sees the optional provider answer followed by a `Sources:` list of `- [<title-or-url>](<url>)` lines with optional snippets, bounded by the tool's `searchMaxResults` config (default 8), and the standing cite-your-sources instruction.

### KV Cache effect

Each search is an independent provider request outside the session model context; the logged tool result appends to the session and does not invalidate earlier reusable request prefixes.

## Known Limitations and Deferred Work

- **Pre-release target**: the harness publishes breaking `rc` versions without compatibility promises; this package pins the `dsh-web` peer to the exact rc it was verified against.
- **No request-layer result-count control**: both routes rely on the seam to truncate `sources[]` to `maxResults`.
- **Completions search is vendor-specific**: only the `tokenhub` dialect exists today; other vendors need one dialect entry plus live verification.
- **Responses annotations availability varies by gateway**: when a gateway returns no `url_citation` annotations, sources are empty and only the generated answer is returned.
- **No runtime settings section**: configuration is the composition entry; changes require a restart.
