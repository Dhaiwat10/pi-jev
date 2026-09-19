# Benchmarks

## Write/test benchmark — v0.4.0

This benchmark uses fresh coding projects, requires file edits and repeated test
runs, and verifies the resulting code outside the agent loop.

- **Date:** 2026-09-19
- **Coding model:** `openai-codex/gpt-5.6-sol`
- **Jev model:** `jev-1.13.0`
- **Sample:** 2 projects × 2 repetitions × context cleaning off/on = 8 runs
- **Mode order:** on/off in repetition 1, off/on in repetition 2

### Projects

- **Ledger importer:** repair CSV parsing, exact decimal conversion, validation,
  monthly summaries, and deterministic expense selection. The fixture starts
  with 11 of 14 tests failing.
- **Dependency planner:** repair graph validation, cycle reporting,
  dependency-safe batching, priority ordering, and immutability. The fixture
  starts with 12 of 14 tests failing.

Each run starts from a fresh copy and receives the same three prompts: implement
all requirements, fix every remaining test failure, then perform a final
requirements and edge-case review. Tests contain noisy preflight output to
exercise context cleaning during real edit/test loops.

The runner checks that the independent final `npm test` succeeds, tests remain
unchanged, and the required `REPORT.md` is written. It records provider usage,
cost, tool calls, wall time, and extension telemetry.

Run it with:

```sh
export TYPESAFE_API_KEY='...'
node benchmarks/run.mjs
```

The runner explicitly loads the extension from the current checkout. Generated
workspaces and full logs are ignored by Git. Normalized results are committed at
[`benchmarks/results/write-benchmark-v0.4.0-2026-09-19.json`](../benchmarks/results/write-benchmark-v0.4.0-2026-09-19.json).

### Aggregate results

| Metric | Cleaning off | Cleaning on | Change |
|---|---:|---:|---:|
| Tasks passing | 4/4 | 4/4 | Equal |
| Tests unchanged | 4/4 | 4/4 | Equal |
| Final model-facing context | 33,415 | 22,515 of 33,354 | **−32.5%** |
| Maximum observed reduction | 0% | 36.3% | +36.3 points |
| Provider total tokens | 459,106 | 418,960 | −8.7% |
| Uncached input tokens | 91,341 | 133,779 | +46.5% |
| Cache-read tokens | 348,800 | 266,752 | −23.5% |
| Output tokens | 18,965 | 18,429 | −2.8% |
| Coding-model cost | $1.2001 | $1.3551 | +12.9% |
| Wall time | 519.2 s | 525.5 s | +1.2% |
| Tool calls | 86 | 80 | −7.0% |
| Jev requests | 0 | 18 | +18 |
| Jev errors | 0 | 0 | Equal |

The two modes followed different stochastic trajectories, so provider usage and
tool-call differences are not same-transcript counterfactuals. Coding-model cost
also excludes Jev.

### Individual runs

| Project | Repeat | Cleaning | Tests | Provider tokens | Cost | Time | Final context reduction |
|---|---:|---|---:|---:|---:|---:|---:|
| Ledger | 1 | On | Pass | 110,020 | $0.3795 | 136.9 s | 34.0% |
| Ledger | 1 | Off | Pass | 101,626 | $0.3002 | 136.8 s | 0% |
| Planner | 1 | On | Pass | 129,661 | $0.3261 | 143.7 s | 34.1% |
| Planner | 1 | Off | Pass | 86,111 | $0.2188 | 101.1 s | 0% |
| Ledger | 2 | Off | Pass | 171,153 | $0.4091 | 169.0 s | 0% |
| Ledger | 2 | On | Pass | 80,306 | $0.3233 | 138.5 s | 29.6% |
| Planner | 2 | Off | Pass | 100,216 | $0.2719 | 112.4 s | 0% |
| Planner | 2 | On | Pass | 98,973 | $0.3262 | 106.4 s | 31.6% |

### Finding

The v0.4.0 policy materially reduced context flooding while preserving measured
task quality. It focuses on substantial old tool results, separately asks Jev
whether the complete output is needed, retains exact diagnostic line ranges,
and applies non-keep decisions at stable checkpoints. User and assistant text
remain untouched, and omitted source output remains available through
`recall_context`.

Across the four active runs, final model-facing context was 29.6–34.1% smaller
(32.5% weighted aggregate), with no Jev errors. Jev requests fell to 18 from 73
under the previous policy.

Prompt-cache reuse still decreased, raising coding-model cost 12.9% before Jev.
That is a secondary tradeoff rather than the primary objective: unlike v0.3.2,
the new policy produced a substantial reduction in model-facing clutter. Future
work should preserve this cleaning level while reducing checkpoint cache breaks.

### Limitations

- Two repetitions per mode are enough to validate the cleaning mechanism, not
  to establish a strong coding-quality or cost claim.
- Agent trajectories are stochastic and cannot be perfectly paired.
- The fixtures are small Node.js projects, not large production repositories.
- Jev usage and cost are not included in the provider cost totals.
- Context counts use the extension's approximate estimator rather than provider
  tokenization.

## Previous policy — v0.3.2

The same corrected fixtures previously produced 4/4 passing tasks in both modes,
but cleaning reduced final context by only 0–1.1% (1.3% maximum). It made 73 Jev
requests, reduced cache reads by 54.9%, and increased coding-model cost by 47.5%.

That policy scored whole assistant and tool-result messages on every context
event. It frequently rewrote older prompt content while retaining noisy outputs
that contained any useful evidence. The v0.4.0 benchmark was created after
replacing that behavior; the original normalized results remain at
[`benchmarks/results/write-benchmark-2026-09-19.json`](../benchmarks/results/write-benchmark-2026-09-19.json).

## Earlier read-only case study

An earlier Rudu repository-inspection task showed estimated final context
reductions of 37–45%, with coherent answers and no Jev errors. One intermediate
checkpoint reached 58.5%.

That result demonstrated substantial removal of old read output in one long
inspection session, but it used approximate estimates, one run per mode, and no
code edits or correctness tests. The write/test benchmark above is the primary
result.
