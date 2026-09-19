#!/usr/bin/env node

import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  runPrintMode,
  SessionManager,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { createContextExtension } from "./extension.js";
import type { ContextMode } from "./types.js";

interface CliOptions {
  cwd: string;
  contextMode: ContextMode;
  continueRecent: boolean;
  prompt?: string;
  print: boolean;
  model?: string;
}

function usage(): string {
  return `pi-jev - Pi with Jev-guided working context

Usage: pi-jev [options] [directory]

Options:
  --context-mode <off|shadow|on>  Context policy mode (default: shadow)
  --continue                     Resume the most recent session for the directory
  --prompt <text>                 Send an initial prompt after startup
  --print                         Print the response and exit (requires --prompt)
  --model <provider/model>        Override the configured Pi model
  -h, --help                      Show this help

The coding model and provider use your normal Pi configuration. Change them in
the TUI with /model. Set TYPESAFE_API_KEY to enable Jev scoring.
`;
}

function parseArgs(args: readonly string[]): CliOptions {
  let cwd = process.cwd();
  let contextMode: ContextMode = "shadow";
  let continueRecent = false;
  let prompt: string | undefined;
  let print = false;
  let model: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(usage());
      process.exit(0);
    }
    if (arg === "--continue") {
      continueRecent = true;
      continue;
    }
    if (arg === "--print") {
      print = true;
      continue;
    }
    if (arg === "--model") {
      model = args[++index];
      if (!model?.includes("/")) throw new Error("--model requires provider/model");
      continue;
    }
    if (arg === "--context-mode") {
      const value = args[++index];
      if (value !== "off" && value !== "shadow" && value !== "on") {
        throw new Error("--context-mode must be off, shadow, or on");
      }
      contextMode = value;
      continue;
    }
    if (arg === "--prompt") {
      prompt = args[++index];
      if (!prompt) throw new Error("--prompt requires text");
      continue;
    }
    if (arg?.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    if (arg) cwd = resolve(arg);
  }

  if (print && !prompt) throw new Error("--print requires --prompt");
  return {
    cwd,
    contextMode,
    continueRecent,
    print,
    ...(prompt ? { prompt } : {}),
    ...(model ? { model } : {}),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const agentDir = getAgentDir();

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      resourceLoaderOptions: {
        extensionFactories: [createContextExtension({ mode: options.contextMode })],
      },
    });
    let selectedModel;
    if (options.model) {
      const slash = options.model.indexOf("/");
      const provider = options.model.slice(0, slash);
      const modelId = options.model.slice(slash + 1);
      selectedModel = services.modelRuntime.getModel(provider, modelId);
      if (!selectedModel) throw new Error(`Unknown model: ${options.model}`);
    }
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(sessionStartEvent ? { sessionStartEvent } : {}),
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  const sessionManager = options.continueRecent
    ? SessionManager.continueRecent(options.cwd)
    : SessionManager.create(options.cwd);
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: options.cwd,
    agentDir,
    sessionManager,
  });

  if (options.print) {
    process.exitCode = await runPrintMode(runtime, {
      mode: "text",
      initialMessage: options.prompt!,
    });
    return;
  }

  const interactive = new InteractiveMode(runtime, {
    startupDiagnostics: [...runtime.diagnostics],
    ...(runtime.modelFallbackMessage ? { modelFallbackMessage: runtime.modelFallbackMessage } : {}),
    ...(options.prompt ? { initialMessage: options.prompt } : {}),
  });
  await interactive.run();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`pi-jev: ${message}\n`);
  process.exitCode = 1;
});
