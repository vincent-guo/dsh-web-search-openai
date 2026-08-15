# dsh-web-search-openai

中文 | [English](README.md)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web 能力缝（`ctx.web`）的 OpenAI 兼容 `WebSearchProvider`。一个插件基于同一份端点配置注册两个提供方：

| 提供方 id | 线协议 | 搜索能力来源 |
|---|---|---|
| `openai-completions` | `POST {baseURL}/chat/completions` | 厂商搜索扩展，由 `searchOption` 方言选择拼写 |
| `openai-responses` | `POST {baseURL}/responses` | OpenAI Responses 规范的原生 `web_search` 工具 |

这是一个**实现**包：只向 `ctx.web` 注册能力，不拥有该键，也不注册面向模型的工具（工具归 `@deepseek-ai/dsh-tool-web`）。它是函数/命名空间插件（`name` / `inject` / `Config` / `apply`，无 default export）。

本包是**第三方**实现，与 DeepSeek 官方无关。目标版本为 `@deepseek-ai/dsh-web@0.1.0-rc.6`（`next` 标签线；`latest` 标签已陈旧）。harness 处于 pre-release，契约可能变化。

## 安装

```sh
npm install @vincent-guo/dsh-web-search-openai
```

peer 依赖（`@deepseek-ai/dsh-web@0.1.0-rc.6`、`@deepseek-ai/dsh-session@^0.1.0-rc.6`、`@deepseek-ai/cordis@^4.0.1`）由 harness 安装提供；请把本包装进同一 profile/工作区，保证与 harness 共享同一份模块实例。

## 配置

全部配置化，**没有任何厂商默认值**——端点、模型、密钥都填写你实际使用的服务。

```yaml
- id: web-search-openai
  name: '@vincent-guo/dsh-web-search-openai'
  config:
    apiKeyEnv: TENCENT_TOKENHUB_API_KEY   # 每次搜索即时解析的凭据引用
    baseURL: https://<你的网关>/v1        # 自动追加 /chat/completions 或 /responses
    model: <模型名>                        # 端点服务的模型
    searchOption: tokenhub                # Completions 路线方言（见下）
    # reasoningEffort: low                # 可选，仅 Completions 路线
    # searchSource: lite                  # 可选，由方言携带
    # maxTokens: 2048                     # 可选，仅 Completions 路线
    # timeoutMs: 30000                    # 提供方侧超时兜底
```

经 web 缝显式选择提供方：

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: openai-completions
```

（环境变量 `DSH_WEB_SEARCH_PROVIDER=openai-completions` 等价。）

## Completions 路线方言

Chat Completions 的联网搜索开关是厂商扩展，不属于 OpenAI 规范。`searchOption` 选择一种线协议拼写；新增厂商 = 新增一个方言条目。

| 方言 | 请求开关 | 结果字段 | 内容字段 | 备注 |
|---|---|---|---|---|
| `tokenhub` | `web_search_options: {enable: true}`（可选 `search_source`） | `choices[0].message.search_results[]`（`url`、`name`、`snippet`、`site`） | `choices[0].message.content` | `reasoning_effort` 接受 `low`/`medium`/`high`/`xhigh`/`max`；网关拒绝 `no_think` |

## 映射

- Completions 路线：`content` ← `choices[0].message.content`；`sources[]` ← `search_results[]`（`url`、`name`→`title`、`snippet` 清理内嵌 HTML）。`search_results` 为空时如实返回空来源——绝不从正文抓 URL。
- Responses 路线：`content` ← `message` 项的 `output_text` 文本拼接；`sources[]` ← `url_citation` annotations（`url`、`title`）。网关执行了原生搜索但不返回 annotations 时，降级为仅答案。
- `maxResults` 由缝（`ctx.web`）统一强制执行：截断 `sources[]` 并设置 `truncated`；两条路线都没有请求层结果数旋钮。

## 凭据

每次搜索即时解析：先凭据服务（web Models 页写入的值），再启动环境。缺失时以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败。

## 错误

提供方失败以 `WebError` 呈现，沿用缝的开放错误码：`WEB_PROVIDER_ERROR`（HTTP、网络、超时、响应体不可解析）、`WEB_PROVIDER_CREDENTIAL_MISSING`、`WEB_ABORTED`（调用方取消）。携带凭据的请求使用 `redirect: "error"`——重定向在访问目标之前即失败。

## 辅助请求日志

由 agent 会话发起的搜索，会在发请求前向会话记录一条 `web/openai-search-request` 事件，携带已解析端点与不含凭据的完整请求体。该事件纯属信息性，追加时带有 `ignorable` 标记，不认识该类型的读取端可安全跳过。

每个 harness 构建都携带一份静态的会话事件词表（`KNOWN_SESSION_EVENT_TYPES`），并拒绝冷加载包含"未知且非 ignorable"事件类型的日志。因此本事件**仅在运行中构建的词表已包含该类型时才追加**；在早于该类型的构建（如 `dsh-web@0.1.0-rc.6`）上会跳过追加，保证会话日志在任何构建上都能加载。

## 模型体验

通过 `@deepseek-ai/dsh-tool-web` 间接生效：模型看到可选提供方答案 + `Sources:` 列表（`- [<标题或URL>](<url>)` 行，可带 snippet），数量受工具 `searchMaxResults` 配置（默认 8）约束，并以固定的引用指引结尾。

### KV Cache 影响

每次搜索是与会话模型上下文相互独立的提供方请求；记录的工具结果仅追加，不会使既有可复用请求前缀失效。

## 已知限制与暂缓事项

- **pre-release 目标**：harness 发布破坏性 `rc` 版本且无兼容承诺；本包将 `dsh-web` peer 精确钉在验证过的 rc 上。
- **无请求层结果数控制**：两条路线都依赖缝事后截断 `sources[]` 至 `maxResults`。
- **Completions 搜索为厂商扩展**：当前只有 `tokenhub` 一个方言；接新厂商需新增方言条目并实测验证。
- **Responses annotations 因网关而异**：网关不返回 `url_citation` 时来源为空，仅返回生成答案。
- **无运行时 settings 分节**：配置来自组合条目，修改需重启生效。
