import { describe, expect, it } from "vitest";
import { compileContext } from "../src/context/compiler.js";
import { ContextIndex } from "../src/context/index.js";
import { decideCandidate } from "../src/context/policy.js";
import { excerptToolOutput } from "../src/context/text.js";
import type { CandidateScore } from "../src/types.js";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

describe("context compiler", () => {
  it("keeps a tool call/result protocol pair while archiving the result body", () => {
    const messages = [
      { role: "user", content: "run tests", timestamp: 1 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "npm test" } }],
        api: "test",
        provider: "test",
        model: "test",
        usage,
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "bash",
        content: [{ type: "text", text: "thousands of unhelpful passing test lines" }],
        isError: false,
        timestamp: 3,
      },
      { role: "user", content: "continue", timestamp: 4 },
    ];
    const index = new ContextIndex();
    const candidates = index.rebuild(messages);
    const resultCandidate = candidates.find(({ kind }) => kind === "tool-result");
    expect(resultCandidate).toBeDefined();

    const compiled = compileContext(messages, candidates, [{
      candidateId: resultCandidate!.id,
      action: "archive",
      reason: "test",
    }]);

    expect(compiled.messages).toHaveLength(messages.length);
    expect(JSON.stringify(compiled.messages[1])).toContain("call-1");
    expect(JSON.stringify(compiled.messages[2])).toContain("Archived tool result");
    expect(JSON.stringify(compiled.messages[2])).toContain(resultCandidate!.id);
  });

  it("removes an archived plain assistant message", () => {
    const messages = [
      { role: "assistant", content: [{ type: "text", text: "obsolete explanation" }] },
      { role: "user", content: "new task" },
    ];
    const index = new ContextIndex();
    const candidates = index.rebuild(messages);
    const compiled = compileContext(messages, candidates, [{
      candidateId: candidates[0]!.id,
      action: "archive",
      reason: "test",
    }]);
    expect(compiled.messages).toEqual([messages[1]]);
  });
});

describe("selection policy", () => {
  it("keeps unresolved old evidence", () => {
    const index = new ContextIndex();
    const candidate = index.rebuild([
      { role: "toolResult", toolCallId: "1", toolName: "bash", content: [{ type: "text", text: "type error" }] },
    ])[0]!;
    const score: CandidateScore = {
      candidateId: candidate.id,
      usefulness: 1,
      usefulnessConfidence: 0.8,
      fullResultNeeded: 0.9,
      unresolved: 0.9,
      failedApproach: 0.1,
      scoredAt: Date.now(),
      model: "jev-test",
    };
    expect(decideCandidate(candidate, 20, score).action).toBe("keep");
  });

  it("archives low-value old evidence", () => {
    const index = new ContextIndex();
    const candidate = index.rebuild([
      { role: "toolResult", toolCallId: "1", toolName: "bash", content: [{ type: "text", text: "ok" }] },
    ])[0]!;
    const score: CandidateScore = {
      candidateId: candidate.id,
      usefulness: 0.2,
      usefulnessConfidence: 0.9,
      fullResultNeeded: 0.1,
      unresolved: 0.1,
      failedApproach: 0.1,
      scoredAt: Date.now(),
      model: "jev-test",
    };
    expect(decideCandidate(candidate, 20, score, {
      recentMessageCount: 6,
      excerptTokenThreshold: 500,
      archiveTokenThreshold: 1,
      fullResultKeepThreshold: 0.68,
    }).action).toBe("archive");
  });

  it("excerpts a large useful result when its full body is unnecessary", () => {
    const index = new ContextIndex();
    const candidate = index.rebuild([{
      role: "toolResult",
      toolCallId: "1",
      toolName: "bash",
      content: [{ type: "text", text: "progress\n".repeat(700) + "not ok 1 - preserves failure" }],
    }])[0]!;
    const score: CandidateScore = {
      candidateId: candidate.id,
      usefulness: 2.4,
      usefulnessConfidence: 0.9,
      fullResultNeeded: 0.2,
      unresolved: 0.8,
      failedApproach: 0.1,
      scoredAt: Date.now(),
      model: "jev-test",
    };
    expect(decideCandidate(candidate, 20, score).action).toBe("excerpt");
  });
});

describe("tool output excerpts", () => {
  it("removes repetitive lines while preserving exact failure evidence", () => {
    const text = [
      "TAP version 13",
      ...Array.from({ length: 100 }, (_, index) => `fixture ${index + 1}/100 ok`),
      "not ok 1 - rejects malformed input",
      "Error: expected rejection",
      "# tests 1",
      "# fail 1",
    ].join("\n");
    const excerpt = excerptToolOutput(text, "candidate123", 600);
    expect(excerpt).toContain("TAP version 13");
    expect(excerpt).toContain("not ok 1 - rejects malformed input");
    expect(excerpt).toContain("Error: expected rejection");
    expect(excerpt).toContain("archived as candidate123");
    expect(excerpt.length).toBeLessThan(text.length);
  });
});
