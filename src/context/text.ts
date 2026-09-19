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
