# Benchmarks

## Write/test benchmark

This is the primary benchmark for `pi-jev`. It uses fresh coding projects,
requires file edits, runs tests repeatedly, and verifies the resulting code
outside the agent loop.

- **Date:** 2026-09-19
- **Coding model:** `openai-codex/gpt-5.6-sol`
- **Jev model:** `jev-1.13.0`
- **Sample:** 2 projects × 2 repetitions × context cleaning off/on = 8 runs

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
produce realistic tool-result history.

The runner checks that:

- The independent final `npm test` succeeds.
- The agent did not modify tests.
- The required `REPORT.md` was written.
- Provider usage, cost, tool calls, wall time, and extension telemetry are saved.

Run it with:

```sh
export TYPESAFE_API_KEY='...'
node benchmarks/run.mjs
```

Generated workspaces and full logs are ignored by Git. The normalized raw
results are committed at
[`benchmarks/results/write-benchmark-2026-09-19.json`](../benchmarks/results/write-benchmark-2026-09-19.json).

### Aggregate results

| Metric | Cleaning off | Cleaning on | Change |
|---|---:|---:|---:|
| Tasks passing | 4/4 | 4/4 | Equal |
| Tests unchanged | 4/4 | 4/4 | Equal |
| Provider total tokens | 488,363 | 431,518 | **−11.6%** |
| Uncached input tokens | 108,228 | 249,936 | **+130.9%** |
| Cache-read tokens | 361,472 | 162,944 | **−54.9%** |
| Output tokens | 18,663 | 18,638 | −0.1% |
| Coding-model cost | $1.2818 | $1.8903 | **+47.5%** |
| Wall time | 535.2 s | 525.7 s | −1.8% |
| Tool calls | 90 | 82 | −8.9% |
| Assistant turns | 58 | 56 | −3.4% |
| Jev requests | 0 | 73 | +73 |
| Jev errors | 0 | 0 | Equal |

The coding-model cost excludes Jev, so total system cost increased by more than
the table's 47.5%.

### Individual runs

| Project | Repeat | Cleaning | Tests | Provider tokens | Cost | Time | Final estimated context reduction |
|---|---:|---|---:|---:|---:|---:|---:|
| Ledger | 1 | Off | Pass | 142,979 | $0.3437 | 135.6 s | 0% |
| Ledger | 1 | On | Pass | 119,409 | $0.6143 | 165.9 s | 1.1% |
| Planner | 1 | Off | Pass | 99,516 | $0.3068 | 113.8 s | 0% |
| Planner | 1 | On | Pass | 90,099 | $0.3745 | 105.4 s | 0.0% |
| Ledger | 2 | Off | Pass | 143,709 | $0.3906 | 157.9 s | 0% |
| Ledger | 2 | On | Pass | 90,910 | $0.3878 | 112.1 s | 0.4% |
| Planner | 2 | Off | Pass | 102,159 | $0.2407 | 128.0 s | 0% |
| Planner | 2 | On | Pass | 131,100 | $0.5138 | 142.2 s | 0.9% |

### Finding

Cleaning preserved task quality in this small sample and coincided with fewer
total provider tokens and tool calls. However, it did not materially reduce the
compiled context on these workloads: final reduction was 0–1.1%, with a maximum
observed checkpoint of 1.3%.

The current implementation changes older prompt content frequently. That breaks
provider prefix-cache reuse: cache reads fell 54.9% while expensive uncached
input rose 130.9%. As a result, coding-model cost increased 47.5%, before paying
for Jev's 73 requests.

**Conclusion:** this benchmark does not support a cost-efficiency claim for the
current policy on short-to-medium write/test sessions. The next version should
avoid pruning below a context threshold, batch changes at stable checkpoints,
and target large tool outputs rather than frequently rewriting short messages.
It should then be rerun on these same fixtures.

### Limitations

- Two repetitions per mode are enough to expose the cache effect, not to make a
  strong claim about coding quality.
- Agent trajectories are stochastic and cannot be perfectly paired.
- Each repetition ran cleaning off before cleaning on; execution order was not
  randomized.
- The fixtures are small Node.js projects, not large production repositories.
- Jev usage and cost are not included in the provider cost totals.
- A discarded pilot run used two inconsistent test expectations. Those fixtures
  were corrected before the two reported repetitions; pilot numbers are not
  included.

## Earlier read-only case study

An earlier Rudu repository-inspection task showed estimated final context
reductions of 37–45%, with coherent answers and no Jev errors. One intermediate
checkpoint reached 58.5%.

That result demonstrated that the extension can remove substantial old read
output in a long inspection session, but it used approximate context estimates,
one run per mode, and no code edits or correctness tests. It should not be used
as the headline benchmark, and it did not measure the prompt-cache cost exposed
by the write/test benchmark above.
