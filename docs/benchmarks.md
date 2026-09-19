# Preliminary benchmark

This page records early measurements for `pi-jev`. They are a case study, not a
general benchmark. More repositories, task types, models, and repeated runs are
needed before drawing broad conclusions.

## Rudu repository inspection

**Date:** 2026-09-19  
**Repository:** Rudu, a React/Tauri application  
**Coding model:** `openai-codex/gpt-5.6-sol`  
**Jev model:** `jev-1.13.0`

The agent was asked to inspect at least eight frontend and Rust files, explain
the pull-request review-comment flow, describe module boundaries, and identify
a maintenance risk. It was restricted to read/search/list tools and made no
repository changes.

### Context reduction

| Run | Checkpoint | Baseline-equivalent context | Selected context | Removed | Reduction |
|---|---:|---:|---:|---:|---:|
| Shadow | Final observed | 43,140 | 23,701 | 19,439 | **45.1%** |
| Active | Final observed | 59,040 | 34,247 | 24,793 | **42.0%** |
| Active | Highest observed reduction | 35,607 | 14,777 | 20,830 | **58.5%** |

The values are `pi-jev`'s fast token estimates (approximately four characters
per token), not provider-reported billing tokens. “Baseline-equivalent” means
the messages before `pi-jev` filtering at that checkpoint. In shadow mode those
unfiltered messages were what Pi actually sent, making it a same-transcript
counterfactual for selection. It is not a separately repeated vanilla-Pi run.

Reduction is calculated as:

```text
(baseline context - selected context) / baseline context
```

### Jev reliability

| Run | Successful Jev requests | Jev errors |
|---|---:|---:|
| Shadow | 10 | 0 |
| Active | 14 | 0 |

A separate minimal live probe completed in **432 ms**. We did not capture a
latency distribution or total Jev latency for the full runs, so this number
must not be interpreted as average per-turn overhead.

### Outcome check

Both the shadow and active runs:

- Produced coherent descriptions of the React → Tauri → GitHub comment flow.
- Correctly described the intended frontend, command, service, transport, and
  model boundaries.
- Independently identified the same concrete maintenance risk: review threads
  and comments are requested with `first: 100` but without pagination.
- Left the Rudu working tree unchanged from its pre-test state.

This is encouraging evidence that active filtering preserved the information
needed for this task. It is not a correctness score: there was one run per mode,
no blinded grading, and no test suite or patch output because the task was
read-only.

## What the numbers support

For this repository-inspection task, `pi-jev` reduced the final observed
model-facing working context by **42–45%** while retaining enough context to
produce a comparable analysis. At one intermediate active checkpoint it removed
**58.5%**.

The likely benefit over unfiltered Pi is lower attention spent on old tool
output and potentially fewer uncached input tokens. The current evidence does
**not** establish:

- A 42–45% reduction in API cost. Provider prompt caching can change billing.
- Faster end-to-end execution. Jev adds network calls and latency.
- Equal coding quality across implementation or debugging tasks.
- Better performance than Pi's built-in compaction on very long sessions.

## Next benchmark

Run baseline Pi, deterministic recency filtering, and Jev filtering on repeated
read, edit, debugging, and test-repair tasks. Capture provider-reported input,
cache-read, cache-write, output, cost, wall-clock time, checks passed, repeated
tool calls, and final patch quality. Those measurements can turn this case study
into a defensible comparison.
