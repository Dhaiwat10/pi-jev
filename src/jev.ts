import { APIError, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import type { CandidateScore, ContextCandidate } from "./types.js";
import { stableId } from "./context/text.js";

const USEFULNESS_LEVELS = [
  "Irrelevant or redundant for continuing the current coding task",
  "Background that is mildly useful but safe to omit",
  "Useful evidence, decision, or implementation detail",
  "Essential requirement, unresolved error, or fact needed for the next steps",
] as const;

export interface JevScorerOptions {
  model?: string;
  timeoutMs?: number;
  batchSize?: number;
}

export function describeJevError(error: unknown): string {
  if (error instanceof APIError) {
    const body = typeof error.body === "string" ? error.body : JSON.stringify(error.body);
    return `${error.name} HTTP ${error.status}: ${error.message}${body ? `; ${body}` : ""}`.slice(0, 1_000);
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 1_000);
  return String(error).slice(0, 1_000);
}

export class JevScorer {
  private readonly client: TypeSafeClient | undefined;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly batchSize: number;
  private readonly cache = new Map<string, CandidateScore>();

  constructor(options: JevScorerOptions = {}) {
    // Password managers and formatted dashboards can insert ordinary or narrow
    // no-break spaces while copying a key. API keys cannot contain whitespace,
    // and undici rejects non-ByteString header characters before making a request.
    const apiKey = process.env.TYPESAFE_API_KEY?.replace(/[^\x21-\x7E]/gu, "");
    this.model = options.model ?? process.env.TYPESAFE_DEFAULT_MODEL ?? "jev-1.13.0";
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.batchSize = options.batchSize ?? 4;
    this.client = apiKey
      ? new TypeSafeClient({
          apiKey,
          defaultModel: this.model,
          timeout: this.timeoutMs,
          retry: { maxRetries: 1 },
          logLevel: "off",
        })
      : undefined;
  }

  get available(): boolean {
    return this.client !== undefined;
  }

  private cacheKey(candidateId: string, task: string): string {
    return `${candidateId}:${stableId([task])}`;
  }

  getCached(candidateId: string, task: string): CandidateScore | undefined {
    return this.cache.get(this.cacheKey(candidateId, task));
  }

  async probe(): Promise<{ model: string; latencyMs: number }> {
    if (!this.client) throw new Error("TYPESAFE_API_KEY is not configured");
    const started = performance.now();
    const response = await this.client.systemOne(
      {
        state: "A coding agent ran a test and it failed with a type error.",
        questions: {
          useful: noul("Is this potentially useful context for continuing a coding task?"),
        },
        model: this.model,
      },
      { timeout: this.timeoutMs, retry: { maxRetries: 0 } },
    );
    return { model: response.model, latencyMs: Math.round(performance.now() - started) };
  }

  async scoreCandidates(
    candidates: readonly ContextCandidate[],
    task: string,
    signal?: AbortSignal,
  ): Promise<{ scores: CandidateScore[]; calls: number; latencyMs: number }> {
    if (!this.client || candidates.length === 0) return { scores: [], calls: 0, latencyMs: 0 };

    const missing = candidates.filter((candidate) => !this.cache.has(this.cacheKey(candidate.id, task)));
    let calls = 0;
    const started = performance.now();

    for (let offset = 0; offset < missing.length; offset += this.batchSize) {
      const batch = missing.slice(offset, offset + this.batchSize);
      if (batch.length === 0) continue;

      const state = {
        current_task: task || "No explicit user task was found.",
        candidates: batch.map((candidate) => ({
          id: candidate.id,
          kind: candidate.kind,
          tool: candidate.toolName ?? null,
          text: candidate.text.slice(0, 12_000),
        })),
      };

      const questions = Object.fromEntries(
        batch.flatMap((candidate) => [
          [
            `usefulness_${candidate.id}`,
            score(
              `Rate candidate ${candidate.id}'s usefulness for continuing the current coding task. Preserve requirements, decisions and rationale, exact errors, negative findings, unfinished work, and implementation facts. Judge only that candidate.`,
              USEFULNESS_LEVELS,
            ),
          ],
          [
            `unresolved_${candidate.id}`,
            noul(`Does candidate ${candidate.id} document a problem that remains unresolved in the supplied state?`),
          ],
          [
            `full_${candidate.id}`,
            noul(`Does the complete output of candidate ${candidate.id} need to remain verbatim for the next coding steps? Answer no when only its errors, final summary, or a few diagnostic lines matter and the rest is repetitive progress, successful checks, or stale output.`),
          ],
          [
            `failed_${candidate.id}`,
            noul(`Does candidate ${candidate.id} record a failed approach that would help avoid repeating work?`),
          ],
        ]),
      );

      const response = await this.client.systemOne(
        { state, questions, model: this.model },
        {
          ...(signal ? { signal } : {}),
          timeout: this.timeoutMs,
          retry: { maxRetries: 1 },
        },
      );
      calls += 1;

      for (const candidate of batch) {
        const usefulness = response.answers[`usefulness_${candidate.id}`];
        const unresolved = response.answers[`unresolved_${candidate.id}`];
        const fullResultNeeded = response.answers[`full_${candidate.id}`];
        const failed = response.answers[`failed_${candidate.id}`];
        if (!usefulness || usefulness.type !== "score") continue;
        if (!unresolved || unresolved.type !== "noul") continue;
        if (!fullResultNeeded || fullResultNeeded.type !== "noul") continue;
        if (!failed || failed.type !== "noul") continue;

        this.cache.set(this.cacheKey(candidate.id, task), {
          candidateId: candidate.id,
          usefulness: usefulness.score,
          usefulnessConfidence: usefulness.confidence,
          fullResultNeeded: fullResultNeeded.noul,
          unresolved: unresolved.noul,
          failedApproach: failed.noul,
          scoredAt: Date.now(),
          model: response.model,
        });
      }
    }

    return {
      scores: candidates.flatMap((candidate) => {
        const cached = this.cache.get(this.cacheKey(candidate.id, task));
        return cached ? [cached] : [];
      }),
      calls,
      latencyMs: Math.round(performance.now() - started),
    };
  }
}
