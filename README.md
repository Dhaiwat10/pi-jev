# pi-jev

A small coding-agent harness that runs Pi with a Jev-guided working-context
layer. Pi keeps the durable session; `pi-jev` derives a smaller model-facing view
and keeps omitted material available through `recall_context`.

This repository currently contains an early vertical slice. Shadow mode is the
default while the scoring policy is evaluated.

## Requirements

- Node.js 22.19 or newer
- A coding-model provider configured for Pi
- `TYPESAFE_API_KEY` for Jev scoring (optional in `off`/pass-through use)

## Setup

```sh
npm install
npm run build
npm link
```

Run in a project:

```sh
pi-jev --context-mode shadow /path/to/project
```

Resume the most recent session:

```sh
pi-jev --continue --context-mode shadow /path/to/project
```

For automation or a single prompt:

```sh
pi-jev --print --prompt "Inspect the project without modifying files" /path/to/project
```

Inside the TUI:

```text
/context stats
/context inspect
/context probe
/context mode off|shadow|on
```

Use `/model` to select any model configured through Pi.

## Modes

- `off`: no Jev scoring and no model-facing filtering.
- `shadow`: score and report decisions while sending Pi's original context.
- `on`: apply the current extractive policy. Older plain assistant messages may
  be omitted and older tool-result bodies may be excerpted or replaced by a
  recall marker. Tool-call/result protocol pairs remain intact.

If Jev is unavailable or a request fails, candidates without cached scores are
kept conservatively.

See [PLAN.md](PLAN.md) for the complete design and evaluation plan.
