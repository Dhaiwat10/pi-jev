# pi-jev

A Pi extension that uses Jev to maintain a smaller, cleaner working context.
Pi keeps the durable session; the extension derives a model-facing view and
keeps omitted material available through `recall_context`.

This repository currently contains an early vertical slice. Shadow mode is the
default while the scoring policy is evaluated.

## Early results

In an initial read-only repository-inspection task, the final observed working
context was reduced by **45.1% in shadow mode** and **42.0% in active mode**.
The active run remained coherent and identified the same concrete maintenance
risk as the unfiltered shadow run. These are approximate token estimates from a
single case study, not general quality or cost claims.

See [docs/benchmarks.md](docs/benchmarks.md) for the setup, measurements,
limitations, and next evaluation steps.

## Requirements

- Node.js 22.19 or newer
- A coding-model provider configured for Pi
- `TYPESAFE_API_KEY` for Jev scoring (optional in `off`/pass-through use)

## Install as a Pi extension

This repository is private, so use the SSH source with a GitHub account that has
access:

```sh
pi install git:git@github.com:Dhaiwat10/pi-jev.git
```

For local development, install the checkout directly:

```sh
pi install /Users/Apple/code/pi-jev
```

Set the TypeSafe key in the environment that launches Pi. For the local private
environment file used during development:

```sh
source ~/.config/pi-jev/env
pi
```

The extension starts in safe `shadow` mode by default. To start directly in
another mode:

```sh
PI_JEV_MODE=on pi
```

To try the extension for one invocation without installing it:

```sh
pi -e /Users/Apple/code/pi-jev/src/extension.ts
```

Inside the TUI:

```text
/context stats
/context inspect
/context probe
/context mode off|shadow|on
```

Everything else remains normal Pi: use `pi`, `pi --continue`, `/model`, its
built-in tools, and its ordinary session management.

## Modes

- `off`: no Jev scoring and no model-facing filtering.
- `shadow`: score and report decisions while sending Pi's original context.
- `on`: apply the current extractive policy. Older plain assistant messages may
  be omitted and older tool-result bodies may be excerpted or replaced by a
  recall marker. Tool-call/result protocol pairs remain intact.

If Jev is unavailable or a request fails, candidates without cached scores are
kept conservatively.

See [PLAN.md](PLAN.md) for the complete design and evaluation plan.
