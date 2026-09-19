export type ContextMode = "off" | "shadow" | "on";

export type CandidateKind = "assistant" | "tool-result";

export interface ContextCandidate {
  id: string;
  kind: CandidateKind;
  messageIndex: number;
  text: string;
  tokenEstimate: number;
  toolName?: string;
  toolCallId?: string;
}

export interface CandidateScore {
  candidateId: string;
  usefulness: number;
  usefulnessConfidence: number;
  unresolved: number;
  failedApproach: number;
  scoredAt: number;
  model: string;
}

export type SelectionAction = "keep" | "excerpt" | "archive";

export interface CandidateDecision {
  candidateId: string;
  action: SelectionAction;
  reason: string;
  score?: CandidateScore;
}

export interface ContextStats {
  mode: ContextMode;
  calls: number;
  candidates: number;
  kept: number;
  excerpted: number;
  archived: number;
  beforeTokens: number;
  afterTokens: number;
  jevAttempts: number;
  jevCalls: number;
  jevErrors: number;
  jevLatencyMs: number;
  lastJevError?: string;
}
