# Model Routing

JobForge routes each piece of work to the cheapest model that can do it well, instead of running every tool call on one expensive model. This doc explains why that matters, how the routing is wired, and how to customize it.

## Why routing matters (the cost math)

A two-day trace early in development showed `$48` in spend, with **84% coming from GLM 5.1** despite the majority of the work being procedural (form fills, tracker updates, OTP retrieval). Later traces showed the opposite failure mode: free OpenRouter routes hit shared-pool contention and Venice balance errors during application subagents.

- **GLM 5.1's provider doesn't discount cache reads.** On Anthropic, a 10K-token cached prefix costs ~$0.03. On GLM 5.1 it bills near-full input rate (~$0.35). Every session that re-loads the prefix pays full price.
- **Procedural work is the high-volume work.** 1000+ messages per day go to form filling, TSV merges, scan dedup. It needs a cheap reliable route, not the absolute strongest model.
- **Free pools are not reliable enough for application runs.** A 2026-04-25 trace showed `@general-paid` hitting `openrouter/qwen/...:free` Venice 402 errors, while `@general-free` fell through `opencode/big-pickle` into `z-ai/glm-4.5-air:free` and `gpt-oss-20b:free`.

Conclusion: keep the subagent split for tool permissions and prompting, but route OpenCode to `opencode-go/deepseek-v4-flash` across all JobForge tiers. It is the best current "affordable and reliable" default for applications.

## The three subagents

Defined in `.opencode/agents/*.md` (shipped in the harness, symlinked into consumers by `job-forge sync`):

| Agent | Model | Reasoning | Use for |
|-------|-------|-----------|---------|
| `@general-free` | `opencode-go/deepseek-v4-flash` | `minimal` | Geometra form fills, tracker TSV merges, scan dedup, OTP retrieval via Gmail, scripted pipeline steps |
| `@general-paid` | `opencode-go/deepseek-v4-flash` | `medium` | Offer evaluation narratives (Blocks A-F), cover letters, "Why X?" answers, STAR+R interview stories, LinkedIn outreach prose |
| `@glm-minimal` | `opencode-go/deepseek-v4-flash` | `none` | Narrow one-shot transforms: "extract these 8 fields from this JD text → JSON", "classify this archetype" |

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

### Swap the quality model

The default `@general-paid` OpenCode model is `opencode-go/deepseek-v4-flash`. To use a stronger OpenCode route for quality writing, edit `models.yaml`:

```yaml
roles:
  quality:
    targets:
      opencode:
        provider: opencode
        model: opencode-go/deepseek-v4-pro
```

Run `npm run build:config` if you are editing a harness checkout. In a consumer project, keep local overrides in `opencode.json` or replace a symlinked `.opencode/agents/<name>.md` with a real file.

### Swap the procedural route

The `@general-free` model is set in `models.yaml` via the `fast` role's
`targets.opencode` override. Change that if you want a different procedural
default:

```yaml
roles:
  fast:
    targets:
      opencode:
        provider: opencode
        model: opencode-go/deepseek-v4-flash
```

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
- **DeepSeek V4 Flash defaults** cover procedural, quality-sensitive, and extractor work on OpenCode
- If you opt into a stronger model, do it deliberately and only for the role that needs it
- Session titles prefixed `@general-free`, `@general-paid`, `@glm-minimal` appear in the list — confirms delegation actually happened
- `cache_read` >> `cache_creation` on parallel subagent runs within a 5-min window

Failure pattern to watch for:
- **All messages showing up under your primary model** (no `@general-*` titles) → orchestrator isn't delegating. Check the Pre-flight delegation rule in AGENTS.md is being followed; tighten wording if not.
- **High cache-creation with near-zero cache-read across parallel workers** → workers aren't firing within the 5-min cache TTL, or the shared prefix isn't byte-identical (see [batch/README.md](../batch/README.md) for the prompt-cache-friendly batch pattern).

## Fallback policy

JobForge no longer ships automatic free-model fallback for OpenCode. The
previous free fallback chain solved some transient model outages, but real
application traces showed it could also freeze runs upstream or route into
provider balance failures. The default is now simpler: each OpenCode role uses
`opencode-go/deepseek-v4-flash`, and errors surface directly in telemetry.

Use `npm run telemetry:status` or `npm run telemetry:show -- <session>` to
inspect provider errors, child outcomes, and pending TSVs after a run. If you
want a local fallback chain anyway, add it explicitly in your own
`opencode.json` or agent frontmatter so the cost/reliability tradeoff is
visible in your project rather than hidden in the harness defaults.

## Known limitations

- **opencode's 5-minute cache TTL is hardcoded.** The 1-hour cache (Anthropic beta, `extended-cache-ttl-2025-04-11`) is not plumbed through opencode as of 2026-04-15. Long batch runs (>5 min between workers) will miss cache every cycle. Upstream fix would be 2 lines in `packages/opencode/src/provider/`.
- **`instructions` is top-level, not per-agent.** Files listed in `opencode.json:instructions` load for every agent. This is fine for `cv.md` and `_shared.md` (they're small and useful everywhere), but means you can't hide heavy context from lower-cost agents via instructions — use per-agent `prompt:` files for that.
- **`reasoningEffort` support varies by provider.** Anthropic accepts `thinking: { type: "disabled" }`; opencode-labs models may need the `variant` pattern. See the `reasoningEffort` values in the opencode docs.

## See also

- [AGENTS.md — Subagent Routing](../AGENTS.md#subagent-routing--which-agent-for-which-task) — the task-to-agent mapping table
- [AGENTS.md — Pre-flight delegation](../AGENTS.md#pre-flight-delegation-hard-rule) — the "first tool call must be `task`" rule
- [ARCHITECTURE.md](ARCHITECTURE.md) — how modes, symlinks, and the consumer/harness split fit together
- [CUSTOMIZATION.md](CUSTOMIZATION.md) — archetype, CV template, portal, and state customization
- `.opencode/agents/` — the three agent definitions (YAML frontmatter + markdown prompt body)
