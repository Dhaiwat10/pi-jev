import type { CandidateDecision, CandidateScore, ContextCandidate } from "../types.js";

export interface PolicyOptions {
  recentMessageCount: number;
  excerptTokenThreshold: number;
}

export const DEFAULT_POLICY: PolicyOptions = {
  recentMessageCount: 6,
  excerptTokenThreshold: 1_500,
};

export function decideCandidate(
  candidate: ContextCandidate,
  totalMessages: number,
  score: CandidateScore | undefined,
  options: PolicyOptions = DEFAULT_POLICY,
): CandidateDecision {
  if (candidate.messageIndex >= totalMessages - options.recentMessageCount) {
    return { candidateId: candidate.id, action: "keep", reason: "recent" };
  }

  if (!score) {
    return { candidateId: candidate.id, action: "keep", reason: "unscored-conservative" };
  }

  const important = score.usefulness >= 1.65 || score.unresolved >= 0.62 || score.failedApproach >= 0.7;
  if (!important) {
    return { candidateId: candidate.id, action: "archive", reason: "low-relevance", score };
  }

  if (candidate.tokenEstimate > options.excerptTokenThreshold && score.usefulness < 2.55) {
    return { candidateId: candidate.id, action: "excerpt", reason: "useful-large-output", score };
  }

  return { candidateId: candidate.id, action: "keep", reason: "jev-useful", score };
}
