---
title: "LLM Provider 设计、agents-ai-native 的多模型接入层"
date: "2026-05-31"
excerpt: "把各家 LLM API 的差异藏进 Provider，上层只消费统一的事件流。"
---

做 Agent 系统，迟早会碰到这个问题：

> "模型换一家，代码改一遍。"

Qwen 走 DashScope 兼容接口，DeepSeek 有自己的 `thinking` 字段，Claude 是 Anthropic 格式，Azure 又是 Responses API——每家 SDK 不一样，流式事件名字也不一样。

`agents-ai-native` 里 `infrastructure/llm` 的设计目标，就一句话：

> **上层只认统一协议，差异全部下沉到 Provider。**

---

# 一、整体分层

整个 LLM 相关代码分成三层，职责非常清楚：

```text
Agent / Tool
     ↓  消费语义事件
  LLM 引擎（client.py）
     ↓  ReAct 循环 + 工具执行
  Provider（provider_core/）
     ↓  各家 SDK 流式 chunk
  外部 API（OpenAI / Anthropic / Azure / DashScope ...）
```

**Provider 层**只做一件事：把各家 API 的流式响应，翻译成统一的 `LanguageModelV1StreamPart` 事件。

**LLM 引擎**在上面再包一层：管理 ReAct 多步循环、执行 tool call、产出更高层的语义事件。

**Agent** 只关心「文本来了」「工具要跑了」「这一步结束了」，不需要知道底层是 Qwen 还是 Claude。

这个拆分的价值在于：

* 换模型 = 改 YAML 配置，不用动 Agent
* 加新 Provider = 实现一个 `stream()`，不用改 ReAct 逻辑
* 流式、推理、工具调用，全走同一套事件协议

---

# 二、Provider 协议：只有一个 `stream()`

所有 Provider 都实现 `LanguageModelProtocolV1`：

```python
class LanguageModelProtocolV1(ABC):

    @abstractmethod
    def stream(
        self,
        messages: List[Message],
        tools: Optional[List[ToolSchema]] = None,
        params: Optional[AIOptions] = None,
        cancel: Optional[CancelEvent] = None,
    ) -> Generator[LanguageModelV1StreamPart, None, None]:
        ...
```

输入是统一的：

| 类型 | 作用 |
| --- | --- |
| `Message` | 对话消息（含 tool_calls、reasoning_content、attachments） |
| `ToolSchema` | 模型无关的工具 JSON Schema |
| `AIOptions` | 采样、推理、token 限制等通用参数 |
| `cancel` | 外部取消信号，`set()` 后 Provider 应尽快终止 |

输出是 **事件流**，不是一次性返回 `LLMResponse`。

这样设计是因为 Agent 场景几乎总是流式的——你要边生成边展示，边收 tool call 边执行。

---

# 三、统一流事件：21 种 LanguageModelV1StreamPart

Provider 层定义了 21 种流事件，对照 [Vercel AI SDK](https://sdk.vercel.ai/) 的 `TextStreamPart` 联合类型：

```text
生命周期：  StartEvent / FinishEvent / AbortEvent / ErrorEvent
单步：      StartStepEvent / FinishStepEvent
文本：      TextStartEvent / TextDeltaEvent / TextEndEvent
推理：      ReasoningStartEvent / ReasoningDeltaEvent / ReasoningEndEvent
工具输入：  ToolInputStartEvent / ToolInputDeltaEvent / ToolInputEndEvent
工具调用：  ToolCallEvent / ToolResultEvent / ToolErrorEvent
其他：      RawEvent / SourceEvent / FileEvent
```

核心思路：

> **不管底层 SSE 叫 `content_block_delta` 还是 `choices[0].delta.content`，上层看到的都是 `TextDeltaEvent`。**

以 OpenAI 兼容 Provider 为例，它把 SDK chunk 逐条映射：

```text
delta.content           → TextDeltaEvent
delta.reasoning_content → ReasoningDeltaEvent
delta.tool_calls        → ToolInputStart/Delta/End → ToolCallEvent
chunk.usage             → FinishStepEvent.usage
```

Anthropic Provider 同理，只是事件名不同：

```text
content_block_delta (text_delta)    → TextDeltaEvent
content_block_delta (thinking)      → ReasoningDeltaEvent
content_block_delta (input_json)    → ToolInputDeltaEvent
content_block_stop (tool_use)       → ToolCallEvent
```

**同一条协议，两套完全不同的 SDK，上层完全无感。**

---

# 四、参数适配：ProviderTransform

各家 API 对参数的支持差异很大：

* OpenAI：有 `top_p`，没有 `top_k`
* Anthropic：`max_tokens` 必填，支持 `top_k`
* Qwen：`enable_thinking` 藏在 `extra_body` 里
* DeepSeek：`thinking.type = enabled/disabled`

如果把这些 if-else 散落在 Agent 里，很快就会变成灾难。

所以引入了 `ProviderTransform`：

```text
AIOptions（调用方统一协议）
      ↓  transform.resolve()
dict（Provider 可直接消费的参数）
      ↓  provider._build_request()
底层 SDK 请求体
```

`AIOptions` 对照 Vercel AI SDK 的 `streamText` 参数设计：

```python
@dataclass
class AIOptions:
    temperature: float | None = None
    top_p: float | None = None
    top_k: int | None = None
    max_output_tokens: int | None = None
    is_reasoning: bool = False
    reasoning_effort: str | None = None
    reasoning_budget_tokens: int | None = None
    extra_body: dict = field(default_factory=dict)
    ...
```

`ProviderCapabilities` 声明每个 Provider 支持哪些字段，不支持的参数静默忽略。

这样 Agent 只需要说「我要 high reasoning effort」，具体转成 `reasoning_effort: "high"` 还是 `thinking: {type: "adaptive"}`，由 Transform 负责。

---

# 五、工厂 + YAML 注册表：换模型不改代码

模型配置集中在 `model_registry.yaml`：

```yaml
models:
  openai_compatible:
    - model_id: "qwen-max"
      api_key:
        env_name: "DASHSCOPE_API_KEY"
        config_key: "dashscope_api_key"
      base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  anthropic:
    - model_id: "claude-sonnet"
      api_key:
        env_name: "ANTHROPIC_API_KEY"
        config_key: "anthropic_api_key"
      base_url: "https://api.anthropic.com"
  azure_responses:
    - model_id: "gpt-4o"
      api_key:
        env_name: "AZURE_OPENAI_API_KEY"
        config_key: "azure_openai_api_key"
      base_url: "https://your-resource.openai.azure.com"
      ...
```

启动时 `build_factory()` 读取 YAML，注册到 `LanguageModelFactory`：

```text
model_id  →  ModelConfig  →  Provider 实例（懒创建 + 缓存）
```

用法：

```python
factory = build_factory()
provider = factory.get("qwen-max")
llm = LLM(provider, default_options=config.default_options)
```

当前内置四种 Provider 类型：

| provider | 适配对象 |
| --- | --- |
| `openai_compatible` | OpenAI / DashScope / DeepSeek / 各类兼容接口 |
| `anthropic` | Claude / DashScope Anthropic 代理 |
| `azure_responses` | Azure OpenAI Responses API |
| `qwen_image` | 通义万相图像生成 |

API Key 优先从环境变量读取，也支持项目本地的配置文件（如 `local_config.py`），`required: false` 的模型缺 key 时优雅跳过，不会拖垮整个启动。

---

# 六、LLM 引擎：ReAct 循环在这里

Provider 只管「调一次模型」。

多步工具调用（ReAct）在 `LLM.stream()` 里完成：

```text
messages
   ↓
provider.stream()  →  收集 tool_calls
   ↓
tool_executor 执行工具
   ↓
结果回注 messages（role=tool）
   ↓
下一轮 provider.stream()
   ↓
直到没有 tool_calls 或达到 max_steps
```

LLM 引擎对外产出的是 **语义事件**（`events.py`），比 Provider 原始事件更高层：

| 语义事件 | 含义 |
| --- | --- |
| `TextChunkEvent` | 文本增量 |
| `ReasoningEvent` | 推理/思考内容 |
| `ToolCallsPendingEvent` | 工具即将执行 |
| `ToolCallsEvent` | 工具执行完毕 |
| `StepStartEvent` / `StepEvent` | ReAct 每一步 |
| `LLMFinishEvent` | 全部完成 |
| `LLMErrorEvent` | 错误终止 |

几个值得注意的设计点：

**1. 工具并发**

多个 tool call 时，根据 `ToolConcurrencyPolicy` 决定串行还是线程池并发执行，结果按原始顺序回注。

**2. 参数合并**

`LLM` 构造时的 `default_options` 和运行时 `params` 合并，运行时优先。模型级默认（如 `enable_thinking: true`）在 YAML 的 `default_options` 里配。

**3. 职责边界**

LLM 引擎 **不** 发布事件到 event bus，**不** 累积最终结果——那是 Agent 的事。它只负责「调模型 + 跑工具 + 吐事件」。

---

# 七、目录结构一览

```text
infrastructure/llm/
├── client.py                 # LLM 引擎（ReAct + 语义事件）
├── events.py                 # 语义事件定义
├── provider_core/
│   ├── provider_protocol.py  # LanguageModelProtocolV1
│   ├── provider_factory.py   # LanguageModelFactory
│   ├── model_registry.py       # YAML → Factory
│   ├── model_registry.yaml     # 模型配置
│   ├── types.py                # Message / ToolSchema / AIOptions
│   ├── stream_events.py        # 21 种流事件
│   ├── provider_transform_protocol.py
│   ├── api_key_loader.py
│   └── providers/
│       ├── openai_compatible/  # OpenAI SDK
│       ├── anthropic/          # Anthropic SDK
│       ├── azure_responses/    # Azure Responses API
│       └── qwen_image/         # 图像生成
```

扩展新 Provider 的最小路径：

1. 实现 `LanguageModelProtocolV1.stream()`
2. 把 SDK chunk 映射到 `LanguageModelV1StreamPart`
3. （可选）实现 `ProviderTransform`
4. 在 `LanguageModelFactory._build()` 注册类型
5. 在 `model_registry.yaml` 加一条配置

Agent 代码一行不用动。

---

# 八、为什么要对照 Vercel AI SDK

这不是为了追热点。

Vercel AI SDK 在「流式 + 工具 + 推理」这条路上已经踩过很多坑——事件粒度、生命周期、step 边界，都经过大量生产验证。

直接对齐它的 `TextStreamPart` 设计，好处是：

* 事件模型经过实战检验，不会自己发明轮子
* 未来如果要对接 TS 生态（Web UI、调试工具），协议天然兼容
* 新同学看代码时有外部参照，上手成本低

Python 里没有 TypeScript 的 discriminated union，所以用 dataclass 继承 + `type` 字段实现同等效果。

---

# 总结

`infrastructure/llm` 的核心设计可以压缩成一张图：

```text
         ┌──────────────────────────────────┐
         │  Agent：消费语义事件，驱动业务    │
         └───────────────┬──────────────────┘
                         │
         ┌───────────────▼──────────────────┐
         │  LLM 引擎：ReAct + 工具执行       │
         │  TextChunk / ToolCalls / Step    │
         └───────────────┬──────────────────┘
                         │
         ┌───────────────▼──────────────────┐
         │  Provider：统一 stream() 协议       │
         │  21 种 LanguageModelV1StreamPart │
         └───────────────┬──────────────────┘
                         │
      ┌──────────┬───────┴────────┬──────────┐
      │ OpenAI   │ Anthropic      │ Azure    │ Qwen Image
      │ 兼容 API │ Messages API   │ Responses│
      └──────────┴────────────────┴──────────┘
```

Agent 系统里，LLM 层最大的问题，从来不是：

```text
能不能调通某个 API
```

而是：

```text
换模型、换厂商、加推理、加工具调用之后，上层代码还能不能保持稳定
```

这套 Provider 设计，就是把「不稳定」锁在最底层——

# **让 Agent 永远只和事件流对话。**
