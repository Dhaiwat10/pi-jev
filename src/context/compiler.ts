import type { CandidateDecision, ContextCandidate } from "../types.js";
import { contentToText, excerptText, estimateTokens } from "./text.js";

type ContentPart = Record<string, unknown>;
type MessageLike = {
  role?: string;
  content?: unknown;
  toolCallId?: string;
};

export interface CompileResult<T> {
  messages: T[];
  beforeTokens: number;
  afterTokens: number;
}

function hasToolCall(message: MessageLike): boolean {
  return Array.isArray(message.content)
    && message.content.some((part) => part && typeof part === "object" && (part as ContentPart).type === "toolCall");
}

function replaceTextContent(content: unknown, replacement: string): unknown {
  if (typeof content === "string") return replacement;
  if (!Array.isArray(content)) return content;

  let replaced = false;
  const next = content.map((part) => {
    if (!part || typeof part !== "object") return part;
    const item = part as ContentPart;
    if (item.type !== "text") return part;
    if (replaced) return { ...item, text: "" };
    replaced = true;
    return { ...item, text: replacement };
  });
  return replaced ? next : content;
}

export function compileContext<T extends MessageLike>(
  messages: readonly T[],
  candidates: readonly ContextCandidate[],
  decisions: readonly CandidateDecision[],
): CompileResult<T> {
  const candidateByIndex = new Map(candidates.map((candidate) => [candidate.messageIndex, candidate]));
  const decisionById = new Map(decisions.map((decision) => [decision.candidateId, decision]));
  const compiled: T[] = [];

  messages.forEach((message, index) => {
    const candidate = candidateByIndex.get(index);
    const decision = candidate ? decisionById.get(candidate.id) : undefined;

    if (!candidate || !decision || decision.action === "keep") {
      compiled.push(message);
      return;
    }

    if (message.role === "assistant" && !hasToolCall(message)) {
      if (decision.action === "archive") return;
      compiled.push({
        ...message,
        content: replaceTextContent(message.content, excerptText(candidate.text)),
      } as T);
      return;
    }

    if (message.role === "toolResult") {
      const replacement = decision.action === "excerpt"
        ? excerptText(candidate.text)
        : `[Archived tool result ${candidate.id}; use recall_context with this id to retrieve it.]`;
      compiled.push({ ...message, content: replaceTextContent(message.content, replacement) } as T);
      return;
    }

    // Assistant tool calls and unknown protocol messages remain untouched.
    compiled.push(message);
  });

  return {
    messages: compiled,
    beforeTokens: messages.reduce((sum, message) => sum + estimateTokens(contentToText(message.content)), 0),
    afterTokens: compiled.reduce((sum, message) => sum + estimateTokens(contentToText(message.content)), 0),
  };
}
