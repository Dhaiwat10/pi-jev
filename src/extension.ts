import type { ContextEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { compileContext } from "./context/compiler.js";
import { ContextIndex } from "./context/index.js";
import { decideCandidate, DEFAULT_POLICY } from "./context/policy.js";
import { contentToText } from "./context/text.js";
import { describeJevError, JevScorer } from "./jev.js";
import type { CandidateDecision, ContextMode, ContextStats } from "./types.js";

export interface ContextExtensionOptions {
  mode?: ContextMode;
}

export interface NamedContextExtension {
  name: string;
  factory: (pi: ExtensionAPI) => void;
}

function modeFromEnvironment(): ContextMode {
  const mode = process.env.PI_JEV_MODE;
  return mode === "off" ? "off" : "on";
}

function statusLabel(mode: ContextMode, detail?: string): string {
  return `Context cleaning: ${mode === "on" ? "ON" : "OFF"}${detail ? ` · ${detail}` : ""}`;
}

function emptyStats(mode: ContextMode): ContextStats {
  return {
    mode,
    calls: 0,
    candidates: 0,
    kept: 0,
    excerpted: 0,
    archived: 0,
    beforeTokens: 0,
    afterTokens: 0,
    jevAttempts: 0,
    jevCalls: 0,
    jevErrors: 0,
    jevLatencyMs: 0,
  };
}

function latestUserTask(messages: readonly ContextEvent["messages"][number][]): string {
  const tasks: string[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") tasks.unshift(contentToText(message.content));
    if (tasks.length === 3) break;
  }
  return tasks.join("\n\n--- next user message ---\n\n").slice(-8_000);
}

function formatStats(stats: ContextStats, jevAvailable: boolean): string {
  const reduction = stats.beforeTokens > 0
    ? Math.round((1 - stats.afterTokens / stats.beforeTokens) * 100)
    : 0;
  return [
    `mode=${stats.mode}`,
    `Jev=${jevAvailable ? "available" : "disabled (set TYPESAFE_API_KEY)"}`,
    `calls=${stats.calls}`,
    `candidates=${stats.candidates}`,
    `keep/excerpt/archive=${stats.kept}/${stats.excerpted}/${stats.archived}`,
    `tokens=${stats.beforeTokens}->${stats.afterTokens} (${reduction}% reduction)`,
    `Jev attempts/successes/errors/latency=${stats.jevAttempts}/${stats.jevCalls}/${stats.jevErrors}/${stats.jevLatencyMs}ms`,
    ...(stats.lastJevError ? [`last Jev error=${stats.lastJevError}`] : []),
  ].join("\n");
}

export function createContextExtension(options: ContextExtensionOptions = {}): NamedContextExtension {
  return {
    name: "pi-jev-context",
    factory: (pi: ExtensionAPI) => {
      const index = new ContextIndex();
      const scorer = new JevScorer();
      let mode: ContextMode = options.mode ?? "on";
      let stats = emptyStats(mode);
      let lastDecisions: CandidateDecision[] = [];
      const debug = process.env.PI_JEV_DEBUG === "1";

      pi.registerTool({
        name: "recall_context",
        label: "Recall context",
        description: "Search omitted Pi session context or retrieve exact context candidate IDs.",
        parameters: Type.Object({
          query: Type.Optional(Type.String({ description: "Words, file paths, symbols, or errors to find" })),
          ids: Type.Optional(Type.Array(Type.String(), { maxItems: 10 })),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
        }),
        async execute(_toolCallId, params) {
          const limit = params.limit ?? 5;
          const byId = (params.ids ?? []).flatMap((id) => {
            const candidate = index.get(id);
            return candidate ? [candidate] : [];
          });
          const found = byId.length > 0 ? byId.slice(0, limit) : index.search(params.query ?? "", limit);
          const text = found.length === 0
            ? "No matching context candidates found."
            : found.map((candidate) =>
                `## ${candidate.id} (${candidate.kind}${candidate.toolName ? `, ${candidate.toolName}` : ""})\n${candidate.text}`,
              ).join("\n\n");
          return { content: [{ type: "text", text }], details: { ids: found.map(({ id }) => id) } };
        },
      });

      pi.registerCommand("context", {
        description: "Control context cleaning: on | off | stats | inspect | probe",
        async handler(args, ctx) {
          const [command = "stats", value] = args.trim().split(/\s+/);
          const requestedMode = command === "on" || command === "off"
            ? command
            : command === "mode" && (value === "on" || value === "off")
              ? value
              : undefined;
          if (requestedMode) {
            mode = requestedMode;
            stats.mode = mode;
            ctx.ui.setStatus(
              "pi-jev",
              statusLabel(mode, mode === "on" && !scorer.available ? "Jev key required" : undefined),
            );
            ctx.ui.notify(statusLabel(mode), "info");
            return;
          }
          if (command === "inspect") {
            const lines = lastDecisions.map((decision) => {
              const candidate = index.get(decision.candidateId);
              const scoreText = decision.score
                ? ` usefulness=${decision.score.usefulness.toFixed(2)} unresolved=${decision.score.unresolved.toFixed(2)} failed=${decision.score.failedApproach.toFixed(2)}`
                : "";
              return `${decision.action.padEnd(7)} ${decision.candidateId} ${candidate?.kind ?? "?"} ${decision.reason}${scoreText}`;
            });
            ctx.ui.notify(lines.join("\n") || "No context decision has run yet.", "info");
            return;
          }
          if (command === "probe") {
            try {
              const result = await scorer.probe();
              delete stats.lastJevError;
              ctx.ui.notify(`Jev probe succeeded: model=${result.model}, latency=${result.latencyMs}ms`, "info");
            } catch (error) {
              const message = describeJevError(error);
              stats.lastJevError = message;
              ctx.ui.notify(`Jev probe failed: ${message}`, "error");
            }
            return;
          }
          ctx.ui.notify(formatStats(stats, scorer.available), "info");
        },
      });

      pi.on("session_start", (_event, ctx) => {
        ctx.ui.setStatus(
          "pi-jev",
          statusLabel(mode, mode === "on" && !scorer.available ? "Jev key required" : undefined),
        );
      });

      pi.on("context", async (event, ctx) => {
        stats.calls += 1;
        const candidates = index.rebuild(event.messages);
        const task = latestUserTask(event.messages);
        const eligible = candidates.filter(
          (candidate) => candidate.messageIndex < event.messages.length - DEFAULT_POLICY.recentMessageCount,
        );

        if (mode !== "off" && scorer.available) {
          try {
            const unscored = eligible.filter((candidate) => !scorer.getCached(candidate.id, task));
            if (unscored.length > 0) stats.jevAttempts += 1;
            const scored = await scorer.scoreCandidates(unscored.slice(-8), task, ctx.signal);
            stats.jevCalls += scored.calls;
            stats.jevLatencyMs += scored.latencyMs;
            if (scored.calls > 0) delete stats.lastJevError;
          } catch (error) {
            stats.jevErrors += 1;
            stats.lastJevError = describeJevError(error);
            if (debug) process.stderr.write(`[pi-jev] Jev error: ${stats.lastJevError}\n`);
            ctx.ui.setStatus("pi-jev", statusLabel(mode, "Jev unavailable; using safe fallback"));
          }
        }

        lastDecisions = candidates.map((candidate) => mode === "off"
          ? { candidateId: candidate.id, action: "keep", reason: "context-cleaning-off" }
          : decideCandidate(candidate, event.messages.length, scorer.getCached(candidate.id, task))
        );
        const compiled = compileContext(event.messages, candidates, lastDecisions);

        stats = {
          ...stats,
          mode,
          candidates: candidates.length,
          kept: lastDecisions.filter(({ action }) => action === "keep").length,
          excerpted: lastDecisions.filter(({ action }) => action === "excerpt").length,
          archived: lastDecisions.filter(({ action }) => action === "archive").length,
          beforeTokens: compiled.beforeTokens,
          afterTokens: compiled.afterTokens,
        };
        const reduction = compiled.beforeTokens > 0
          ? Math.round((1 - compiled.afterTokens / compiled.beforeTokens) * 100)
          : 0;
        ctx.ui.setStatus(
          "pi-jev",
          statusLabel(
            mode,
            mode === "on" && !scorer.available
              ? "Jev key required"
              : mode === "on" && reduction > 0
                ? `${reduction}% smaller`
                : undefined,
          ),
        );
        if (debug) {
          process.stderr.write(
            `[pi-jev] mode=${mode} candidates=${candidates.length} keep/excerpt/archive=${stats.kept}/${stats.excerpted}/${stats.archived} tokens=${compiled.beforeTokens}->${compiled.afterTokens} Jev successes/errors=${stats.jevCalls}/${stats.jevErrors}\n`,
          );
        }

        if (mode === "on") return { messages: compiled.messages };
      });
    },
  };
}

/** Pi package entry point. */
export default function piJevExtension(pi: ExtensionAPI): void {
  createContextExtension({ mode: modeFromEnvironment() }).factory(pi);
}
