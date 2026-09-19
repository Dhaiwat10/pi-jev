import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { JevScorer } from "../src/jev.js";
import type { ContextCandidate } from "../src/types.js";

const original = {
  key: process.env.TYPESAFE_API_KEY,
  baseURL: process.env.TYPESAFE_BASE_URL,
};

afterEach(() => {
  if (original.key === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = original.key;
  if (original.baseURL === undefined) delete process.env.TYPESAFE_BASE_URL;
  else process.env.TYPESAFE_BASE_URL = original.baseURL;
});

describe("Jev scorer transport", () => {
  it("sends valid typed questions and converts the answers", async () => {
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const payload = JSON.parse(body) as {
          questions: Record<string, { type: "score" | "noul"; criteria?: unknown[] }>;
        };
        const answers = Object.fromEntries(Object.entries(payload.questions).map(([key, question]) => {
          if (question.type === "score") {
            return [key, {
              type: "score",
              score: 0.2,
              confidence: 0.9,
              legend: { "0": "irrelevant", "1": "background", "2": "useful", "3": "essential" },
              probabilities: { "0": 0.85, "1": 0.1, "2": 0.04, "3": 0.01 },
            }];
          }
          return [key, { type: "noul", noul: 0.1 }];
        }));
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ model: "jev-mock", answers, usage: { input_tokens: 100, output_tokens: 10 } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("mock server has no TCP address");
      process.env.TYPESAFE_API_KEY = "test-key";
      process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${address.port}`;

      const candidate: ContextCandidate = {
        id: "candidate123",
        kind: "tool-result",
        messageIndex: 0,
        text: "All tests passed. Repetitive output follows.",
        tokenEstimate: 10,
        toolName: "bash",
        toolCallId: "call-1",
      };
      const scorer = new JevScorer({ model: "jev-test" });
      const result = await scorer.scoreCandidates([candidate], "Fix the failing build");

      expect(result.calls).toBe(1);
      expect(result.scores).toHaveLength(1);
      expect(result.scores[0]).toMatchObject({
        candidateId: candidate.id,
        usefulness: 0.2,
        fullResultNeeded: 0.1,
        unresolved: 0.1,
        failedApproach: 0.1,
        model: "jev-mock",
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
