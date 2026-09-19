# pi-jev

A Pi extension that uses Jev to maintain a smaller, cleaner working context.
Pi keeps the durable session; the extension derives a model-facing view and
keeps omitted material available through `recall_context`.

Context cleaning is enabled by default after installation. It can be turned on
or off at any time from inside Pi.

## Early results

In an initial read-only repository-inspection task, the final observed working
context was reduced by **45.1% in shadow mode** and **42.0% in active mode**.
The active run remained coherent and identified the same concrete maintenance
risk as the unfiltered shadow run. These are approximate token estimates from a
single case study, not general quality or cost claims. Shadow was a pre-release
measurement mode and is not part of the current on/off interface.

See [docs/benchmarks.md](docs/benchmarks.md) for the setup, measurements,
limitations, and next evaluation steps.

## Requirements

- [Pi](https://pi.dev/) with extension-package support
- Node.js 22.19 or newer
- A coding-model provider configured in Pi
- A [TypeSafe AI](https://typesafe.ai/) API key for Jev scoring

## Installation

Pi can install the extension globally for your user or locally for one project.
Pi extensions execute with your full system permissions, so review the source
before installing it.

### Install globally

The repository is currently private. Collaborators with SSH access can run:

```sh
pi install git:git@github.com:Dhaiwat10/pi-jev.git
```

This adds the package to `~/.pi/agent/settings.json`, clones it into Pi's package
directory, and installs its runtime dependencies. It then loads automatically in
every normal `pi` session.

If the repository becomes public, this shorter source also works:

```sh
pi install git:github.com/Dhaiwat10/pi-jev
```

### Install for one project

From the project directory:

```sh
pi install git:git@github.com:Dhaiwat10/pi-jev.git -l
```

The `-l` flag writes the package source to `.pi/settings.json`. Teammates can
then install the declared package after trusting the project.

### Install a local checkout

For extension development:

```sh
git clone git@github.com:Dhaiwat10/pi-jev.git
cd pi-jev
npm install
pi install "$PWD"
```

Use `-l` on the final command to install the checkout only for the current
project.

### Try without installing

Load the package for one Pi process:

```sh
pi -e git:git@github.com:Dhaiwat10/pi-jev.git
```

From a local checkout:

```sh
pi -e /path/to/pi-jev
```

## Configure TypeSafe

Set `TYPESAFE_API_KEY` in the environment that launches Pi:

```sh
export TYPESAFE_API_KEY='your-typesafe-key'
pi
```

If you keep secrets in an environment file, source it first. Pi does not load
arbitrary `.env` files automatically:

```sh
source ~/.config/pi-jev/env
pi
```

Do not commit the key to a project repository.

## Verify the installation

Start normal Pi—there is no separate `pi-jev` executable:

```sh
cd /path/to/your/project
pi
```

Then run:

```text
/context probe
```

A successful setup reports the resolved Jev model and request latency. Use:

```text
/context stats
```

to confirm that Jev calls begin succeeding after the session has enough older
assistant and tool messages to score.

## Configuration

The extension starts with context cleaning enabled.

Change mode for the current process from inside Pi:

```text
/context off
/context on
```

Or select the startup mode through the environment:

```sh
PI_JEV_MODE=on pi
```

Available startup values are `off` and `on`. You can inspect current decisions
and statistics at any time:

```text
/context inspect
/context stats
/context off
/context on
```

Command reference:

```text
/context stats
/context inspect
/context probe
/context on
/context off
```

Everything else remains normal Pi: use `pi`, `pi --continue`, `/model`, its
built-in tools, and its ordinary session management.

Optional debug telemetry can be printed to stderr:

```sh
PI_JEV_DEBUG=1 pi
```

It reports selection counts, estimated before/after tokens, and Jev failures;
it does not print the API key.

## Update or remove

Update installed extension packages:

```sh
pi update
```

Remove the global package:

```sh
pi remove git:git@github.com:Dhaiwat10/pi-jev.git
```

For a project-local installation, add `-l` to the remove command.

## Modes

- `off`: no Jev scoring and no model-facing filtering.
- `on` (default): apply the current extractive policy. Older plain assistant
  messages may be omitted and older tool-result bodies may be excerpted or
  replaced by a recall marker. Tool-call/result protocol pairs remain intact.

If Jev is unavailable or a request fails, candidates without cached scores are
kept conservatively.

See [PLAN.md](PLAN.md) for the complete design and evaluation plan.
