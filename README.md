# pi-jev

A [Pi](https://pi.dev/) extension that uses TypeSafe AI's Jev model to remove
stale or low-value conversation and tool output from the coding model's working
context. Pi's full session remains intact, and omitted content can be recovered
with the `recall_context` tool.

Context cleaning is **on by default**.

## Install

Requirements: Pi, Node.js 22.19+, and a
[TypeSafe AI](https://typesafe.ai/) API key.

```sh
pi install git:git@github.com:Dhaiwat10/pi-jev.git
export TYPESAFE_API_KEY='your-typesafe-key'
pi
```

The repository is currently private, so installation requires GitHub SSH access.
Do not commit your API key.

## Use

Run Pi normally. The footer shows whether context cleaning is on and its latest
estimated reduction.

```text
/context-cleaning on       Enable context cleaning
/context-cleaning off      Disable context cleaning
/context-cleaning stats    Show reduction and Jev request statistics
```

Setup check and detailed decisions:

```text
/context-cleaning probe
/context-cleaning inspect
```

If Jev is unavailable, the extension keeps unscored context rather than dropping
it.

## Results

In preliminary read-only repository inspections, active cleaning reduced the
final observed working context by **37–42%** while preserving a coherent analysis.
These are approximate token estimates from a small case study, not general cost
or quality claims. See [docs/benchmarks.md](docs/benchmarks.md) for details.

## Update or remove

```sh
pi update
pi remove git:git@github.com:Dhaiwat10/pi-jev.git
```

## Development

```sh
npm install
npm run check
npm run build
pi -e "$PWD"
```

See [PLAN.md](PLAN.md) for the design and evaluation plan.
