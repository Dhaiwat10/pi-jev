import { describe, expect, it } from "vitest";
import { compileContext } from "../src/context/compiler.js";
import { ContextIndex } from "../src/context/index.js";
import { decideCandidate } from "../src/context/policy.js";
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
      unresolved: 0.1,
      failedApproach: 0.1,
      scoredAt: Date.now(),
      model: "jev-test",
    };
    expect(decideCandidate(candidate, 20, score).action).toBe("archive");
  });
});
