import { createHash } from "node:crypto";

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function stableId(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16);
}

export function excerptText(text: string, maxChars = 4_000): string {
  if (text.length <= maxChars) return text;

  const headSize = Math.floor(maxChars * 0.65);
  const tailSize = maxChars - headSize;
  const omitted = text.length - maxChars;
  return `${text.slice(0, headSize)}\n\n[... ${omitted} characters omitted; use recall_context for the original ...]\n\n${text.slice(-tailSize)}`;
}

const SIGNAL_LINE = /(?:\b(?:error|failed|failure|not ok|exception|panic|fatal|expected|actual|assertion|traceback)\b|^\s*at\s+|^[+-]\s)/i;

/**
 * Retains exact diagnostic line ranges from a large tool result. The output is
 * intentionally extractive: only omission markers are generated text.
 */
export function excerptToolOutput(text: string, candidateId: string, maxChars = 1_600): string {
  if (text.length <= maxChars) return text;

  const lines = text.split("\n");
  const selected = new Set<number>();
  const selectRange = (start: number, end: number): void => {
    for (let index = Math.max(0, start); index <= Math.min(lines.length - 1, end); index += 1) {
      selected.add(index);
    }
  };

  // Preserve command/test headers, final summaries, and focused windows around
  // failures even when they occur in the middle of a verbose result.
  selectRange(0, 5);
  selectRange(lines.length - 24, lines.length - 1);
  lines.forEach((line, index) => {
    if (SIGNAL_LINE.test(line)) selectRange(index - 2, index + 5);
  });

  let ordered = [...selected].sort((left, right) => left - right);
  const selectedChars = (): number => ordered.reduce((sum, index) => sum + (lines[index]?.length ?? 0) + 1, 0);
  if (selectedChars() > maxChars) {
    // Keep a small header, the final summary, and as many of the most recent
    // diagnostic windows as fit. This remains bounded even for stack traces in
    // which nearly every line looks significant.
    const compact = new Set<number>();
    for (let index = 0; index < Math.min(3, lines.length); index += 1) compact.add(index);
    for (let index = Math.max(0, lines.length - 16); index < lines.length; index += 1) compact.add(index);
    const compactChars = (): number => [...compact].reduce(
      (sum, index) => sum + (lines[index]?.length ?? 0) + 1,
      0,
    );
    const signalIndexes = lines.flatMap((line, index) => SIGNAL_LINE.test(line) ? [index] : []).reverse();
    for (const signalIndex of signalIndexes) {
      const additions: number[] = [];
      for (let index = Math.max(0, signalIndex - 1); index <= Math.min(lines.length - 1, signalIndex + 3); index += 1) {
        if (!compact.has(index)) additions.push(index);
      }
      const addedChars = additions.reduce((sum, index) => sum + (lines[index]?.length ?? 0) + 1, 0);
      if (compactChars() + addedChars <= maxChars - 160) additions.forEach((index) => compact.add(index));
    }
    ordered = [...compact].sort((left, right) => left - right);
  }

  const chunks: string[] = [];
  let previous = -1;
  for (const index of ordered) {
    if (index > previous + 1) {
      chunks.push(`[... lines ${previous + 2}-${index} archived as ${candidateId}; use recall_context ...]`);
    }
    chunks.push(lines[index] ?? "");
    previous = index;
  }
  if (previous < lines.length - 1) {
    chunks.push(`[... lines ${previous + 2}-${lines.length} archived as ${candidateId}; use recall_context ...]`);
  }
  return chunks.join("\n");
}

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const item = part as Record<string, unknown>;
      if (item.type === "text" && typeof item.text === "string") return item.text;
      if (item.type === "toolCall") {
        return `[tool call: ${String(item.name ?? "unknown")} ${JSON.stringify(item.arguments ?? {})}]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
