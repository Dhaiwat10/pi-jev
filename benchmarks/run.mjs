import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const fixturesRoot = join(import.meta.dirname, "projects");
const resultsRoot = join(root, ".benchmark-results");
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const runRoot = join(resultsRoot, runId);
const model = process.env.BENCHMARK_MODEL ?? "openai-codex/gpt-5.6-sol";
const projects = ["ledger", "planner"];
const modes = ["off", "on"];

if (!process.env.TYPESAFE_API_KEY) {
  throw new Error("TYPESAFE_API_KEY must be set before running the benchmark");
}

const prompts = [
  "Read AGENTS.md, README.md, the implementation, and all tests. Implement every documented requirement without changing tests or adding dependencies. Run npm test until it passes. Write a concise REPORT.md describing the implementation and validation.",
  "Run npm test now. Fix every remaining failure without weakening or modifying tests. Re-read README.md for requirements that passing tests might not fully cover.",
  "Perform a final edge-case and input-mutation review against README.md. Make any necessary corrections, run npm test one final time, and ensure REPORT.md accurately describes the finished work.",
];

async function run(command, args, options = {}) {
  const started = performance.now();
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => resolvePromise({
      code: code ?? 1,
      signal,
      stdout,
      stderr,
      durationMs: Math.round(performance.now() - started),
    }));
  });
}

function parseJsonl(text) {
  return text.split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function sumUsage(events) {
  const result = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 };
  for (const event of events) {
    if (event.type !== "message_end" || event.message?.role !== "assistant") continue;
    const usage = event.message.usage;
    if (!usage) continue;
    result.input += usage.input ?? 0;
    result.output += usage.output ?? 0;
    result.cacheRead += usage.cacheRead ?? 0;
    result.cacheWrite += usage.cacheWrite ?? 0;
    result.totalTokens += usage.totalTokens ?? 0;
    result.cost += usage.cost?.total ?? 0;
  }
  result.cost = Number(result.cost.toFixed(6));
  return result;
}

function parseContextTelemetry(stderr) {
  const rows = [];
  const pattern = /\[pi-jev\] mode=(on|off) candidates=(\d+) keep\/excerpt\/archive=(\d+)\/(\d+)\/(\d+) tokens=(\d+)->(\d+) Jev successes\/errors=(\d+)\/(\d+)/g;
  for (const match of stderr.matchAll(pattern)) {
    const before = Number(match[6]);
    const after = Number(match[7]);
    rows.push({
      mode: match[1],
      candidates: Number(match[2]),
      kept: Number(match[3]),
      excerpted: Number(match[4]),
      archived: Number(match[5]),
      beforeTokens: before,
      afterTokens: after,
      reductionPercent: before > 0 ? Number((((before - after) / before) * 100).toFixed(1)) : 0,
      jevSuccesses: Number(match[8]),
      jevErrors: Number(match[9]),
    });
  }
  return rows;
}

async function hashTree(directory) {
  const hash = createHash("sha256");
  async function visit(path, prefix) {
    const entries = await readdir(path, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const child = join(path, entry.name);
      const relative = join(prefix, entry.name);
      if (entry.isDirectory()) await visit(child, relative);
      else {
        hash.update(relative);
        hash.update(await readFile(child));
      }
    }
  }
  await visit(directory, "");
  return hash.digest("hex");
}

async function benchmark(project, mode) {
  const source = join(fixturesRoot, project);
  const workdir = join(runRoot, `${project}-${mode}`);
  await cp(source, workdir, { recursive: true });
  const testsBefore = await hashTree(join(workdir, "test"));

  const agent = await run("pi", [
    "--no-session",
    "--mode", "json",
    "--model", model,
    "--tools", "read,bash,edit,write,grep,find,ls",
    ...prompts,
  ], {
    cwd: workdir,
    env: { ...process.env, PI_JEV_MODE: mode, PI_JEV_DEBUG: "1" },
  });
  await writeFile(join(workdir, "agent.jsonl"), agent.stdout);
  await writeFile(join(workdir, "agent.stderr.log"), agent.stderr);

  const test = await run("npm", ["test"], { cwd: workdir });
  await writeFile(join(workdir, "verification.log"), `${test.stdout}\n${test.stderr}`);
  const testsAfter = await hashTree(join(workdir, "test"));
  const events = parseJsonl(agent.stdout);
  const telemetry = parseContextTelemetry(agent.stderr);
  const lastTelemetry = telemetry.at(-1);

  return {
    project,
    mode,
    model,
    agentExitCode: agent.code,
    durationMs: agent.durationMs,
    verificationExitCode: test.code,
    testsPassed: test.code === 0,
    testsUnchanged: testsBefore === testsAfter,
    reportWritten: await readFile(join(workdir, "REPORT.md"), "utf8").then(() => true, () => false),
    turns: events.filter((event) => event.type === "turn_start").length,
    toolCalls: events.filter((event) => event.type === "tool_execution_start").length,
    usage: sumUsage(events),
    context: lastTelemetry ?? null,
    maxReductionPercent: telemetry.reduce((max, row) => Math.max(max, row.reductionPercent), 0),
    jevSuccesses: telemetry.reduce((max, row) => Math.max(max, row.jevSuccesses), 0),
    jevErrors: telemetry.reduce((max, row) => Math.max(max, row.jevErrors), 0),
    resultDirectory: workdir,
  };
}

await mkdir(runRoot, { recursive: true });
const results = [];
for (const project of projects) {
  for (const mode of modes) {
    process.stderr.write(`Running ${project} with context cleaning ${mode}...\n`);
    const result = await benchmark(project, mode);
    results.push(result);
    process.stderr.write(`  tests=${result.testsPassed} tokens=${result.usage.totalTokens} duration=${result.durationMs}ms\n`);
  }
}

const summary = { runId, model, prompts, results };
await writeFile(join(runRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(join(resultsRoot, "latest.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
