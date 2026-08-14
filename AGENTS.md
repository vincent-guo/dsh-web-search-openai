# AGENTS.md

Instructions for AI coding agents working in this repository. Read this file before changing code.

## Identity

- Project / package: `dsh-web-search-openai` (npm `@vincent-guo/dsh-web-search-openai`, GitHub `vincent-guo/dsh-web-search-openai`)
- Plugin name: `web-search-openai`; provider ids: `openai-completions` and `openai-responses`
- Third-party `WebSearchProvider` for the DeepSeek Harness web capability seam (`ctx.web`); targets `@deepseek-ai/dsh-web@0.1.0-rc.6`
- Function/namespace plugin: named exports `name` / `inject` / `Config` / `apply`, no default export

## Architecture invariants

- One plugin registers two providers over one endpoint configuration; the web seam selects one explicitly via `searchProvider`.
- Completions route (`openai-completions`): vendor search extension selected by the `searchOption` dialect table in `src/dialect.ts`.
- Responses route (`openai-responses`): native `web_search` tool per the OpenAI Responses spec.
- Zero vendor defaults: `apiKeyEnv`, `baseURL`, and `model` are required; missing or unusable config fails loud at load.
- Adding a vendor = adding one dialect entry plus live verification against the real gateway; never edit an existing entry.
- Mapping: `content` ← provider answer text; `sources` ← structured result fields only; never scrape URLs from prose.
- Credentials: resolved per search via the credentials service first, then the process environment; never log or retain the key.
- Credential-bearing requests use `redirect: 'error'` — redirects fail before their target is contacted.
- Errors: `WebError` with the seam's codes (`WEB_PROVIDER_ERROR`, `WEB_PROVIDER_CREDENTIAL_MISSING`, `WEB_ABORTED`).

## Commands

```sh
# install (the DSH shell injects npm_config_cache outside the workspace; override it)
npm_config_cache="$PWD/.npm-cache" npm install

npm test                  # vitest; the live e2e self-skips without TENCENT_TOKENHUB_API_KEY
npx tsc --noEmit          # typecheck
npm run build             # tsc -> lib/ (runtime js + lib/types/*.d.ts)
```

Live e2e with a real key:

```sh
TENCENT_TOKENHUB_API_KEY=... npm test
```

## Dependencies

- Peer: `@deepseek-ai/dsh-web` pinned exactly (`0.1.0-rc.6`). The harness publishes breaking `rc` versions with no compatibility promise; the `latest` dist-tag is stale, the current line is `next`.
- Peer: `@deepseek-ai/cordis`; dependency: `@deepseek-ai/schemastery`.
- When the harness ships a new `rc`, verify compatibility and update the pin in the same change.

## Publishing

1. Change code/docs; update both READMEs for any config key, default, error, or wire-field change in the same commit.
2. Bump `version` (semver; npm versions are immutable).
3. `npm run build` and `npm test`.
4. `npm_config_cache="$PWD/.npm-cache" npm publish --access public` (Automation token; plain auth requires `--otp`).

## Conventions

- Commit messages in English: `type: summary` (feat/fix/chore/docs/test).
- Code comments and JSDoc in English; README bilingual (README.md primary, README.zh.md translation).
- Keep the `files` allowlist in package.json to the exact runtime artifacts; never ship `src` in the tarball.
- Config fields are the configuration surface; no hardcoded vendor tunables in code.

## Tests

- Mapping tests replay recorded real-gateway fixtures from `tests/fixtures/`.
- The redirect test must prove the redirect target is not contacted.
- The live e2e self-skips without a key.

## Local deployment wiring (this machine)

- Installed in the dsh web profile: `~/.dsh/profiles/web/package.json` + pnpm.
- Composition patch: `~/.dsh/profiles/web/cordis.patch.yml` — selects `openai-completions`, disables `web-search-deepseek`, inserts this plugin's row.
- Credential `TENCENT_TOKENHUB_API_KEY` lives in `~/.dsh/.credentials.yaml` (written by the web Models page).
