# Model Routing

JobForge routes each piece of work to the cheapest model that can do it well, instead of running every tool call on one expensive model. This doc explains why that matters, how the routing is wired, and how to customize it.

## Why routing matters (the cost math)

A two-day trace early in development showed `$48` in spend, with **84% coming from GLM 5.1** despite the majority of the work being procedural (form fills, tracker updates, OTP retrieval). The root cause:

- **GLM 5.1's provider doesn't discount cache reads.** On Anthropic, a 10K-token cached prefix costs ~$0.03. On GLM 5.1 it bills near-full input rate (~$0.35). Every session that re-loads the prefix pays full price.
- **Procedural work is the high-volume work.** 1000+ messages per day go to form filling, TSV merges, scan dedup. Running that on a paid model is unnecessary when current free OpenRouter models can handle the task.
- **Current OpenRouter free models are strong enough to cover the whole OpenCode path.** JobForge now defaults every OpenCode role to a free model, including the quality-sensitive writer tier.

Conclusion: route procedural work to free tier, reserve paid models for tasks that actually need the quality.

## The three subagents

Defined in `.opencode/agents/*.md` (shipped in the harness, symlinked into consumers by `job-forge sync`):

| Agent | Model | Reasoning | Use for |
|-------|-------|-----------|---------|
| `@general-free` | `openrouter/z-ai/glm-4.5-air:free` | `minimal` | Geometra form fills, tracker TSV merges, scan dedup, OTP retrieval via Gmail, scripted pipeline steps |
| `@general-paid` | `openrouter/qwen/qwen3-next-80b-a3b-instruct:free` | `medium` | Offer evaluation narratives (Blocks A-F), cover letters, "Why X?" answers, STAR+R interview stories, LinkedIn outreach prose |
| `@glm-minimal` | `openrouter/openai/gpt-oss-20b:free` | `none` | Narrow one-shot transforms: "extract these 8 fields from this JD text → JSON", "classify this archetype" |

The full task-to-agent mapping lives in [AGENTS.md → Subagent Routing](../AGENTS.md#subagent-routing--which-agent-for-which-task). The orchestrator (your primary session) is expected to delegate before taking any multi-step action — see the **Pre-flight delegation** rule in AGENTS.md.

## How the routing is enforced

Four layers, each reinforcing the others:

**1. Permission layer** (`opencode.json:permission.task`):
```json
{
  "permission": {
    "task": {
      "general-free": "allow",
      "general-paid": "allow",
      "glm-minimal": "allow"
    }
  }
}
```
The orchestrator can only dispatch to these three agents. Accidental self-calls or hallucinated agent names fail loudly.

**2. Tool surface trim** (`opencode.json:tools` + per-agent `tools:`):
```json
{
  "tools": {
    "geometra_*": false,
    "gmail_*": false
  }
}
```
Disables ~30 MCP tool schemas globally; each agent re-enables only what it needs in its own `.opencode/agents/<name>.md` frontmatter. Saves ~2-3K input tokens per request in the orchestrator.

**3. Thinking budgets** (`reasoningEffort` in agent frontmatter):
- `@general-free`: `minimal` — procedural work shouldn't need chain-of-thought
- `@general-paid`: `medium` — writing quality benefits from thinking
- `@glm-minimal`: `none` — pure transforms, emit and exit

**4. Prompt rules** (in each agent's `.md` body): explicit instructions on working style, what to do and not do, and structured output expectations.

## Customizing the routing

All three layers are designed to be edited — this is your search, your cost budget, your model preferences.

### Swap the paid model

The default `@general-paid` is `openrouter/qwen/qwen3-next-80b-a3b-instruct:free`. To use Claude instead, edit `.opencode/agents/general-paid.md`:

```yaml
---
model: opencode/claude-sonnet-4-6
reasoningEffort: medium
---
```

The `.opencode/agents/general-paid.md` file is a symlink into `node_modules/job-forge/` by default. To customize locally without modifying the harness: delete the symlink and create a real file with the same name — `job-forge sync` will skip it on future updates. Or override in `opencode.json` under `agent.general-paid.model`.

### Swap the free tier

Same idea — edit `.opencode/agents/general-free.md`'s `model:` field. If you run into quality issues on forms, swap to a different free OpenRouter model first before considering a paid tier.

### Add a custom agent

Create `.opencode/agents/my-agent.md` with the same frontmatter shape, then allow-list it in `opencode.json:permission.task`:

```json
{
  "permission": {
    "task": {
      "general-free": "allow",
      "general-paid": "allow",
      "glm-minimal": "allow",
      "my-agent": "allow"
    }
  }
}
```

### Change what tools an agent can call

Edit the `tools:` block in the agent's frontmatter. Use globs to allow-list families (`gmail_*: true`) or individual names (`geometra_connect: true`). Anything not explicitly re-enabled inherits the global `false`.

### Route differently per task

The task-to-agent mapping in AGENTS.md is instruction-level, not enforced by config. If you want evaluation narratives on free tier (saving cost but accepting lower writing quality), update the "Subagent Routing" table in AGENTS.md and the orchestrator will follow it.

## Verifying the routing actually works

Three commands, increasing precision:

```bash
# 1. Per-day, per-model breakdown — confirms % of cost going to each tier
npx job-forge tokens --days 2

# 2. Per-session breakdown since N minutes ago, with >$1 budget warning
npx job-forge session-report --since-minutes 60

# 3. Drill into a specific session to see which agent made which message
npx job-forge tokens --session <session-id>
```

Healthy pattern after this architecture lands:
- **Free OpenRouter defaults** now cover procedural, quality-sensitive, and extractor work on OpenCode
- If you opt back into a paid model, do it deliberately and only for the role that needs it
- Session titles prefixed `@general-free`, `@general-paid`, `@glm-minimal` appear in the list — confirms delegation actually happened
- `cache_read` >> `cache_creation` on parallel subagent runs within a 5-min window

Failure pattern to watch for:
- **All messages showing up under your primary model** (no `@general-*` titles) → orchestrator isn't delegating. Check the Pre-flight delegation rule in AGENTS.md is being followed; tighten wording if not.
- **High cache-creation with near-zero cache-read across parallel workers** → workers aren't firing within the 5-min cache TTL, or the shared prefix isn't byte-identical (see [batch/README.md](../batch/README.md) for the prompt-cache-friendly batch pattern).

## Automatic fallback on rate limits / 5xx

A rate-limited or overloaded free-tier model would otherwise wedge the whole subagent flow — the delegated task errors and the orchestrator sits stuck. The harness ships with [`@razroo/opencode-model-fallback`](https://www.npmjs.com/package/@razroo/opencode-model-fallback) (added as a dependency in the scaffolder) to rotate agents through a configured `fallback_models` chain automatically.

Default chains ship upstream in each agent's YAML frontmatter (`node_modules/job-forge/.opencode/agents/*.md`, symlinked into your project's `.opencode/agents/`):

| Agent | Primary | Fallback chain (in order) |
|-------|---------|---------------------------|
| `@general-free` | `openrouter/z-ai/glm-4.5-air:free` | `openrouter/minimax/minimax-m2.5:free` → `openrouter/openai/gpt-oss-20b:free` → `openrouter/nvidia/nemotron-3-nano-30b-a3b:free` → `openrouter/qwen/qwen3-coder:free` |
| `@general-paid` | `openrouter/qwen/qwen3-next-80b-a3b-instruct:free` | `openrouter/nvidia/nemotron-3-super-120b-a12b:free` → `openrouter/openai/gpt-oss-120b:free` → `openrouter/z-ai/glm-4.5-air:free` → `openrouter/qwen/qwen3-coder:free` |
| `@glm-minimal` | `openrouter/openai/gpt-oss-20b:free` | `openrouter/google/gemma-4-26b-a4b-it:free` → `openrouter/nvidia/nemotron-nano-9b-v2:free` → `openrouter/google/gemma-4-31b-it:free` → `openrouter/z-ai/glm-4.5-air:free` |

These chains are deliberately free-only so the default OpenCode path never needs to pay. **Note:** OpenCode model IDs must use the provider prefix it expects (`openrouter/...`, `opencode/...`, etc.). The raw OpenRouter model slug by itself is not enough.

Consumers **do not need to configure anything** to get these defaults: the subagent chains arrive via the symlinked agent MD files, and the harness also ships `.opencode/opencode-model-fallback.json` for the main orchestrator / any agent without its own list. `@razroo/opencode-model-fallback` (≥0.3.1) reads per-agent chains from the frontmatter-derived `fallback_models` field and falls through to the global file when no per-agent list exists. The consumer's `opencode.json` only needs `"plugin": ["@razroo/opencode-model-fallback"]` — which the scaffolder sets automatically.

**When fallback fires:** the plugin pattern-matches rate-limit / 5xx / quota / "overloaded" / "insufficient credits" errors. Failed models enter a 60-second cooldown before they're retried. Every rotation logs to `~/.config/opencode/opencode-model-fallback.log` with the trigger error, original model, and target model — grep for `"Auto-retrying with fallback model"` to confirm it fired.

### Overriding an upstream chain

Add an `agent.<name>.fallback_models` block to your project's `opencode.json`. Top-level entries win over upstream frontmatter:

```json
{
  "agent": {
    "general-free": {
      "fallback_models": ["my/preferred-free", "my/preferred-paid"]
    }
  }
}
```

### Global fallback chain (agents without their own)

Plugin-level config at `.opencode/opencode-model-fallback.json` — applies to any agent whose `fallback_models` is empty:

```json
{
  "cooldown_seconds": 60,
  "timeout_seconds": 30,
  "notify_on_fallback": true,
  "fallback_models": ["openrouter/openai/gpt-oss-120b:free", "openrouter/z-ai/glm-4.5-air:free"]
}
```

### Disabling fallback

Remove `"@razroo/opencode-model-fallback"` from `opencode.json:plugin` — agents keep their `model:` primary and errors propagate normally.

## Known limitations

- **opencode's 5-minute cache TTL is hardcoded.** The 1-hour cache (Anthropic beta, `extended-cache-ttl-2025-04-11`) is not plumbed through opencode as of 2026-04-15. Long batch runs (>5 min between workers) will miss cache every cycle. Upstream fix would be 2 lines in `packages/opencode/src/provider/`.
- **`instructions` is top-level, not per-agent.** Files listed in `opencode.json:instructions` load for every agent including free-tier. This is fine for `cv.md` and `_shared.md` (they're small and useful everywhere), but means you can't hide heavy context from free agents via instructions — use per-agent `prompt:` files for that.
- **`reasoningEffort` support varies by provider.** Anthropic accepts `thinking: { type: "disabled" }`; opencode-labs models may need the `variant` pattern. See the `reasoningEffort` values in the opencode docs.

## See also

- [AGENTS.md — Subagent Routing](../AGENTS.md#subagent-routing--which-agent-for-which-task) — the task-to-agent mapping table
- [AGENTS.md — Pre-flight delegation](../AGENTS.md#pre-flight-delegation-hard-rule) — the "first tool call must be `task`" rule
- [ARCHITECTURE.md](ARCHITECTURE.md) — how modes, symlinks, and the consumer/harness split fit together
- [CUSTOMIZATION.md](CUSTOMIZATION.md) — archetype, CV template, portal, and state customization
- `.opencode/agents/` — the three agent definitions (YAML frontmatter + markdown prompt body)
