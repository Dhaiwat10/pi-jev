import type { CandidateDecision, CandidateScore, ContextCandidate } from "../types.js";

export interface PolicyOptions {
  recentMessageCount: number;
  excerptTokenThreshold: number;
  archiveTokenThreshold: number;
  fullResultKeepThreshold: number;
}

export const DEFAULT_POLICY: PolicyOptions = {
  recentMessageCount: 6,
  excerptTokenThreshold: 500,
  archiveTokenThreshold: 160,
  fullResultKeepThreshold: 0.68,
};

export function decideCandidate(
  candidate: ContextCandidate,
  totalMessages: number,
  score: CandidateScore | undefined,
  options: PolicyOptions = DEFAULT_POLICY,
): CandidateDecision {
  // Tool output is the primary flooding source. Keep assistant reasoning and
  // conclusions stable rather than repeatedly rewriting the conversation.
  if (candidate.kind !== "tool-result") {
    return { candidateId: candidate.id, action: "keep", reason: "assistant-anchor" };
  }

  if (candidate.messageIndex >= totalMessages - options.recentMessageCount) {
    return { candidateId: candidate.id, action: "keep", reason: "recent" };
  }

  if (!score) {
    return { candidateId: candidate.id, action: "keep", reason: "unscored-conservative" };
  }

  if (candidate.tokenEstimate < options.archiveTokenThreshold) {
    return { candidateId: candidate.id, action: "keep", reason: "small-result", score };
  }

  const important = score.usefulness >= 1.65 || score.unresolved >= 0.62 || score.failedApproach >= 0.7;
  if (!important && score.fullResultNeeded < 0.45) {
    return { candidateId: candidate.id, action: "archive", reason: "low-relevance", score };
  }

  if (
    candidate.tokenEstimate >= options.excerptTokenThreshold
    && score.fullResultNeeded < options.fullResultKeepThreshold
  ) {
    return { candidateId: candidate.id, action: "excerpt", reason: "full-result-unneeded", score };
  }

  if (!important) return { candidateId: candidate.id, action: "archive", reason: "stale-result", score };

  return { candidateId: candidate.id, action: "keep", reason: "full-result-needed", score };
}
