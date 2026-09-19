import type { ContextCandidate } from "../types.js";
import { contentToText, estimateTokens, stableId } from "./text.js";

type MessageLike = {
  role?: string;
  content?: unknown;
  toolName?: string;
  toolCallId?: string;
};

export class ContextIndex {
  private readonly candidates = new Map<string, ContextCandidate>();

  rebuild(messages: readonly MessageLike[]): ContextCandidate[] {
    this.candidates.clear();

    messages.forEach((message, messageIndex) => {
      if (message.role !== "assistant" && message.role !== "toolResult") return;
      const text = contentToText(message.content);
      if (!text.trim()) return;

      const kind = message.role === "toolResult" ? "tool-result" : "assistant";
      const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : undefined;
      const id = stableId([
        kind,
        String(messageIndex),
        toolCallId ?? "",
        text,
      ]);
      const candidate: ContextCandidate = {
        id,
        kind,
        messageIndex,
        text,
        tokenEstimate: estimateTokens(text),
        ...(typeof message.toolName === "string" ? { toolName: message.toolName } : {}),
        ...(toolCallId ? { toolCallId } : {}),
      };
      this.candidates.set(id, candidate);
    });

    return this.all();
  }

  all(): ContextCandidate[] {
    return [...this.candidates.values()];
  }

  get(id: string): ContextCandidate | undefined {
    return this.candidates.get(id);
  }

  search(query: string, limit = 5): ContextCandidate[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.all()
      .map((candidate) => ({
        candidate,
        score: terms.reduce(
          (total, term) => total + (candidate.text.toLowerCase().includes(term) ? 1 : 0),
          0,
        ),
      }))
      .filter(({ score }) => score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score || b.candidate.messageIndex - a.candidate.messageIndex)
      .slice(0, limit)
      .map(({ candidate }) => candidate);
  }
}
