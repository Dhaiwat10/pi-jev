# pi-jev: implementation plan

## Goal

Build a simple coding harness on Pi where Jev continuously helps decide which
conversation and tool-output material belongs in the coding model's working
context. Preserve the session history so omitted material can be recovered.

The intended result is a model that carries useful evidence, decisions, and
unfinished work forward while spending less attention on repetitive logs,
superseded file snapshots, and completed detours.

## Agreed direction

- **Interface:** a Pi package loaded by the normal `pi` command.
- **Integration:** a TypeScript extension using Pi's context and lifecycle hooks.
- **Distillation:** exact excerpts selected with Jev; the harness assembles the text.
- **Coding model:** configurable through Pi's provider/model support.
- **Initial storage:** Pi session files plus a local, rebuildable context index and
  decision log associated with each session.

## Verified integration points

Research checked on 2026-09-19:

- Pi exposes a `context` extension event before each model call. Its messages are
  a deep copy, allowing a filtered model-facing view without editing the transcript.
- Pi exposes tool/message/turn events, session lifecycle events, custom tools,
  commands, and a `session_before_compact` hook.
- Pi's SDK supports loading an extension and running its existing interactive UI.
- Jev accepts state and typed questions, returning Choice, Score, and Noul answers.
  It can evaluate multiple independent questions against one shared state.
- Jev provides selection and scoring. Exact excerpts can be assembled in code;
  prose summarization would require a generative model.
- The documented `jev-1.13.0` limits are 32k tokens for state plus the longest
  question, and 64k for state plus all questions. Small, focused batches are also
  recommended for accuracy.
- Choice and Score expose probabilities and confidence. Noul exposes a yes
  probability, without a separate confidence field. Thresholds need evaluation
  on coding sessions.

Published packages found during research: `@earendil-works/pi-coding-agent@0.85.1`
and `@typesafe-ai/sdk@0.6.0`. Pi requires Node.js >=22.19.0. Verify the chosen
release's SDK signatures in the first milestone, then pin dependencies and the
Jev model version for reproducible evaluation.

## Architecture

```text
User
  |
normal Pi CLI -> Pi UI / session / agent loop
                         |
                         | before each model call
                         v
                  Context manager
                    |          |
                    |          +-> bounded candidate batches -> Jev scores
                    |
                    +-> policy + token budget -> model-facing messages
                                                     |
                                                 Coding model
                                                     |
                                                   Pi tools
                                                     |
                                               Session history
                                                     |
                                              Context index

Coding model -> recall_context -> selected original history -> next context
```

Pi's session is the durable source. The model-facing context is a derived view.
Every excerpt refers back to a session entry, tool call, and original text span.

"Original history" means the content captured by Pi. Built-in tool truncation
can happen before an extension receives a result; preserve Pi's artifact links
and truncation markers rather than claiming to archive unseen process output.

## Context policy

### 1. Preserve anchors and immediate feedback

The initial policy protects:

- System/project instructions and tool definitions.
- User messages, including corrections and requirements.
- The current assistant tool-call batch and all corresponding results.
- A short recent window, initially two completed assistant/tool batches.
- Explicitly recalled excerpts for at least the next model observation.

Give each new tool result one normal, Pi-bounded observation before semantic
pruning. This lets the coding model inspect the evidence it just requested.
Oversized individual results still need bounded output and recoverable sources.

Keeping user messages verbatim is a deliberately simple starting policy. Measure
their contribution before introducing a separate policy for long user histories.

### 2. Identify candidates with deterministic code

Create stable records for completed exchanges and their text chunks:

```text
id, session/branch, source entry, tool-call group, original role,
text span, content hash, tool name/arguments, paths, age, token estimate
```

- Group an assistant tool-calling message with every result it requires.
- Split large tool text into bounded, interpretable spans: log records,
  paragraphs, or line ranges with surrounding context.
- Keep assistant messages atomic initially; use their public text when scoring.
- Keep provider-specific and signed content opaque.
- Detect identical content in code. Attach file versions/hashes when available.
- A newer file read marks an earlier snapshot as historical; earlier snapshots
  can still be useful evidence of an attempted change.

### 3. Ask Jev narrow questions

For each candidate, provide:

- The latest user request and bounded, relevant earlier user text.
- Recent public assistant/tool context that explains the active work.
- The candidate's exact text and source metadata.
- Specific related newer evidence when evaluating whether old evidence still matters.

Start with three independent questions:

1. **Usefulness — Score:** irrelevant, background, useful, or essential for
   continuing the current task.
2. **Unresolved issue — Noul:** does this candidate document a problem that the
   supplied later evidence has not resolved?
3. **Failed approach — Noul:** does this candidate record an attempted approach
   that failed and would be useful to avoid repeating?

Rubrics should retain relevant negative findings, decisions and their rationale,
exact error details, and unfinished work. Relevance to the latest sentence alone
is insufficient.

Batch independent questions over a modest shared state. Name the candidate
explicitly in each question's instructions: API question-map keys are not shown
to the model. Compute age, sizes, hashes, and budget arithmetic in code.

Start with an approximately 8k-token state budget per Jev request, leaving room
for question text. Enforce both documented request limits with conservative
estimates and split batches if a request is rejected for size.

### 4. Compile an exact-excerpt view

The policy combines Jev answers with source type, recency, dependencies, and the
available token budget. Its actions are:

- **Keep:** retain an exchange or result in full.
- **Excerpt:** retain selected original tool-output spans with source labels and
  explicit omission markers.
- **Archive:** omit an older complete exchange from this request; retain it in
  the session and searchable index.

Uncertain classifications favor retention. The budget policy decides the final
selection; Jev does not directly mutate messages.

Preserve original chronology and roles. Every retained tool call must have its
matching result, including parallel batches. When excerpting results, retain the
message IDs and protocol structure. Archive a whole tool-call group when none of
its material survives. Keep evidence in its source role rather than promoting it
to system instructions.

The compiled request must account for system content, tool schemas, message
overhead, and an output reserve. Use a configurable working-context target,
initially around 24k–32k tokens where the model supports it, bounded by the actual
model limit. Treat these as starting parameters for evaluation.

Protected content can exceed the soft target. Expand toward the hard input
limit before sacrificing useful evidence. If even the minimum valid protected
context cannot fit, surface a clear budget error instead of sending an invalid
request or silently dropping user requirements.

### 5. Make omitted history recoverable

Expose one bounded tool:

```text
recall_context({ query?, ids?, limit? })
```

It searches the active session branch or retrieves exact source IDs. Return
original text, provenance, and pagination/size limits. Use lexical/path/symbol
search for the first implementation.

At new user requests and material changes in active paths, shortlist older
archived candidates for re-scoring. A task switch can make previously omitted
material useful again. Search plus re-scoring complements explicit recall.

## Scheduling, persistence, and failure behavior

- Observe new completed messages continuously; apply the compiled view at each
  `context` event. Use finalized messages as the ordering boundary for parallel tools.
- Score newly eligible older material and invalidated candidates, rather than
  repeatedly sending the full transcript to Jev.
- Cache using content hashes, task/relevant-evidence revision, policy version,
  and Jev model version. Increment the task revision on new user input.
- Keep retained older selections stable between pruning checkpoints. Batch
  changes as content leaves the recent window or crosses a working-budget
  watermark, reducing prompt-prefix churn.
- Store scores, decisions, and outgoing-context manifests for inspection and
  replay. The index is rebuildable from the source session.
- Scope selection state to the active branch. Rebuild/revalidate on resume,
  fork, tree navigation, and model changes.
- Propagate cancellation and set a short total Jev deadline with bounded
  retries. On failure, use cached decisions and a deterministic bounded policy
  that prioritizes protected and recent complete exchanges.
- In active mode, let this policy own context reduction. Configure Pi's
  automatic compaction through harness-local settings and route manual
  compaction through the same extractive compiler. Verify overflow recovery
  explicitly in the integration spike.

Prompt-prefix stability is part of the design: reduced input length can still
increase billed cost when it invalidates an effective provider cache.

## User-facing controls

Install the package and use the normal Pi CLI:

```sh
pi install git:git@github.com:Dhaiwat10/pi-jev.git
PI_JEV_MODE=on pi
```

Modes:

- `off`: baseline Pi behavior.
- `on` (default): send the selected context to the coding model.

Proposed commands:

- `/context-cleaning stats`: estimated before/after tokens, selection counts, Jev latency
  and usage, cache/fallback counts.
- `/context-cleaning inspect`: inspect selected source IDs, excerpts, and policy decisions.
- `/context-cleaning on` and `/context-cleaning off`: toggle cleaning for subsequent calls.

Decision explanations come from recorded scores and deterministic reason codes.

## Implementation milestones

### 1. Prove the Pi integration

Build a pass-through context extension and package it for Pi. Reuse Pi's normal
CLI, interactive UI, tools, model configuration, and persistent sessions.

**Done when:** `pi-jev` can perform a small read/edit/test task; the hook fires
before every model invocation; cancellation and resume work; outgoing messages
can be inspected; compaction/overflow behavior of the pinned release is understood.

### 2. Build the deterministic context pipeline

Implement indexing, exchange grouping, text spans, token budgeting, source
references, recall, and a compiler driven by fixture selection decisions.

**Done when:** a selected view fits its budget, preserves protocol validity, and
can recover an omitted excerpt exactly. This establishes the machinery Jev drives.

### 3. Integrate and evaluate Jev

Implement the typed scoring client, small-batch question construction, caching,
deadlines, and decision logging. Requires `TYPESAFE_API_KEY` and a configured Pi
coding provider. Pin the resolved Jev version.

**Done when:** real coding sessions produce inspectable keep/excerpt/archive
decisions, with measured overhead and useful evidence for tuning the rubrics.

### 4. Enable active context selection

Connect scores to compilation, add stable pruning checkpoints, lifecycle
reconstruction, task-switch re-scoring, and the user-facing controls.

**Done when:** a long multi-turn task runs through repeated pruning, recall,
restart, and a Jev failure without losing the work state or breaking tool messages.

### 5. Evaluate and choose defaults

Compare three configurations on the same small set of coding tasks:

1. Baseline Pi.
2. A deterministic recent-window policy using the same recall/budget machinery.
3. The Jev-guided policy.

Use replay fixtures to check selection quality, and live end-to-end runs to
check coding outcomes: pruning changes subsequent agent actions, which transcript
replay alone cannot evaluate.

Measure:

- Task completion, checks passed, and final patch correctness.
- Preservation of required facts and avoidance of repeated failed approaches.
- Input tokens, cache-read/cache-write usage, and total provider plus Jev cost.
- Added latency, including p50/p95 Jev overhead.
- Recall frequency, repeated reads, and unnecessary additional tool calls.

Use repeated runs for noisy tasks. Choose reduction and latency targets after
collecting a baseline. The acceptance criterion is materially smaller working
context with comparable task outcomes and an acceptable measured cost/latency
tradeoff. Jev should show value over the deterministic baseline.

## Focused verification cases

- Parallel tool calls and mixed success/error results preserve all required IDs.
- Important failure evidence survives after a later successful but unrelated test.
- A superseded file snapshot is distinguished from the current file contents.
- User corrections and early requirements survive many pruning checkpoints.
- Switching back to an earlier task makes its archived evidence discoverable.
- Budget accounting includes tool definitions and response headroom.
- Timeout, cancellation, restart, and branch navigation produce valid contexts.
- Omitted original spans can be recalled; omission markers are unambiguous.

## Proposed source layout

```text
src/
  extension.ts            # Pi package entry point, lifecycle hooks, and commands
  context/
    index.ts              # Source IDs, exchange groups, spans, persistence
    policy.ts             # Protected context and selection rules
    compiler.ts           # Ordered, protocol-valid, budgeted message view
    recall.ts             # Search/retrieve source history
  jev.ts                  # Questions, batching, client, score cache
  telemetry.ts            # Decisions, manifests, usage, timing
eval/
  fixtures/               # Sessions and expected retention cases
  run.ts                  # Baseline/deterministic/Jev comparisons
```

## First vertical slice

Run a task that reads files and produces a noisy test log. Let the coding model
observe the result. Once that exchange leaves the recent window, have Jev select
the useful error sections, compile the next request with those exact excerpts,
and retrieve an omitted section through `recall_context`.

That proves the central loop: **observe -> score -> select -> continue -> recall**.

## Sources

- [Pi extensions](https://pi.dev/docs/latest/extensions)
- [Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [Pi compaction](https://pi.dev/docs/latest/compaction)
- [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)
- [TypeSafe HTTP API](https://docs.typesafe.ai/api)
- [Jev model limits](https://docs.typesafe.ai/models)
- [TypeSafe confidence](https://docs.typesafe.ai/confidence)
- [Jev 1.13 behavior notes](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
