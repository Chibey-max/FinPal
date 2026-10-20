import type { DecisionDetail } from "@finpal/contracts";
import { describe, expect, it, vi } from "vitest";

import { createGroqHttpClient } from "../../src/integrations/groq/groq-http-client";
import type { LlmClient } from "../../src/integrations/groq/llm-client";
import {
  createAssistantService,
  parseProposalText,
} from "../../src/use-cases/assistant";

const ID = "00000000-0000-4000-8000-000000000001";

function detail(
  outcome: DecisionDetail["decision"]["outcome"] = "MANUAL_REVIEW",
): DecisionDetail {
  return {
    proposal: {
      id: ID,
      productName: "Leica M6 strap",
      proposedPrice: 185,
      currency: "USD",
      source: "MANUAL",
      sourceEventId: null,
      proposedFor: null,
      createdAt: "2026-10-20T10:00:00.000Z",
    },
    evaluation: {
      id: ID,
      proposalId: ID,
      quality: {
        score: "INSUFFICIENT_DATA",
        explanation: "Fewer than 3 comparable offers were found.",
        proposedPrice: 185,
        currency: "USD",
        offerCount: 2,
        medianPrice: null,
        lowestPrice: null,
        ratioToMedian: null,
        thresholds: { goodMaxRatio: 1.05, fairMaxRatio: 1.2 },
        offerStatus: "OK",
        offers: [],
      },
      constraintCheck: {
        constraints: "PASS",
        amount: "UNDER_CAP",
        reasons: [],
      },
      trustSignal: "NOT_CHECKED",
      trustEvidence: {},
      createdAt: "2026-10-20T10:00:00.000Z",
    },
    decision: {
      id: ID,
      evaluationId: ID,
      outcome,
      reason: "Needs review: the price cannot be scored.",
      reasons: [],
      decidedAt: "2026-10-20T10:00:00.000Z",
      reviewerId: null,
      reviewStatus: null,
      reviewedAt: null,
    },
    payment: null,
    events: [],
  } as unknown as DecisionDetail;
}

const fakeLlm = (reply: string | Error): LlmClient => ({
  model: "test-model",
  complete: vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  }),
});

describe("parseProposalText", () => {
  it.each([
    [
      "Buy AirPods Pro 2 for $229 at 6pm",
      {
        productName: "AirPods Pro 2",
        proposedPrice: 229,
        currency: "USD",
        time: "18:00",
      },
    ],
    [
      "get me a Kindle Paperwhite under 149.99 eur",
      {
        productName: "Kindle Paperwhite",
        proposedPrice: 149.99,
        currency: "EUR",
        time: null,
      },
    ],
    [
      "Sony WH-1000XM5 £1,299.50 tomorrow at 09:30",
      {
        productName: "Sony WH-1000XM5",
        proposedPrice: 1299.5,
        currency: "GBP",
        time: "09:30",
      },
    ],
    [
      "order a garmin forerunner 265 for 449",
      {
        productName: "garmin forerunner 265",
        proposedPrice: 449,
        currency: null,
        time: null,
      },
    ],
    [
      "Nintendo Switch OLED",
      {
        productName: "Nintendo Switch OLED",
        proposedPrice: null,
        currency: null,
        time: null,
      },
    ],
  ])("parses %j", (text, expected) => {
    expect(parseProposalText(text)).toEqual(expected);
  });
});

describe("parseProposalText edge cases", () => {
  it("trims punctuation and trailing fillers", () => {
    expect(
      parseProposalText(
        "please buy me the Kindle Paperwhite, for $139 next week",
      ),
    ).toEqual({
      productName: "Kindle Paperwhite",
      proposedPrice: 139,
      currency: "USD",
      time: null,
    });
  });

  it("stays fast on long adversarial input", () => {
    const text = `a${" ".repeat(400)}for${"-".repeat(90)}`;
    const started = performance.now();
    parseProposalText(text);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe("assistant explanations", () => {
  it("uses the rules when no model is configured", async () => {
    const service = createAssistantService();
    const result = await service.explainDecision(detail());
    expect(service.configured).toBe(false);
    expect(result.source).toBe("rules");
    expect(result.text).toContain("needs a person to approve it");
    expect(result.text).toContain("Fewer than 3 comparable offers");
  });

  it("returns the model's wording when it stays faithful", async () => {
    const llm = fakeLlm(
      "This purchase is waiting for your review because only two comparable offers were found.",
    );
    const result = await createAssistantService({ llm }).explainDecision(
      detail(),
    );
    expect(result).toEqual({
      text: "This purchase is waiting for your review because only two comparable offers were found.",
      source: "llm",
      model: "test-model",
    });
  });

  it("falls back when the model names a different outcome", async () => {
    const llm = fakeLlm("Good news: this was AUTO_APPROVE and paid.");
    const result = await createAssistantService({ llm }).explainDecision(
      detail(),
    );
    expect(result.source).toBe("rules");
  });

  it("falls back and reports when the model fails", async () => {
    const onError = vi.fn();
    const llm = fakeLlm(new Error("down"));
    const result = await createAssistantService({
      llm,
      onError,
    }).explainDecision(detail("BLOCK"));
    expect(result.source).toBe("rules");
    expect(result.text).toMatch(/^FinPal blocked this purchase\./);
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("assistant proposal drafts", () => {
  it("keeps validated model fields and fills the default currency", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        productName: "AirPods Pro 2",
        proposedPrice: 229,
        currency: null,
        time: "18:00",
      }),
    );
    const result = await createAssistantService({ llm }).draftProposal({
      text: "airpods pro 2, 229, after work around 6pm",
      currency: "USD",
    });
    expect(result).toEqual({
      draft: {
        productName: "AirPods Pro 2",
        proposedPrice: 229,
        currency: "USD",
        time: "18:00",
      },
      missing: [],
      source: "llm",
      model: "test-model",
    });
  });

  it("drops a price the message never stated", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        productName: "Kindle Paperwhite",
        proposedPrice: 139.99,
        currency: "USD",
        time: null,
      }),
    );
    const result = await createAssistantService({ llm }).draftProposal({
      text: "a new kindle paperwhite",
    });
    expect(result.draft.proposedPrice).toBeNull();
    expect(result.missing).toEqual(["proposedPrice"]);
  });

  it("uses the rules when the model replies with invalid JSON", async () => {
    const result = await createAssistantService({
      llm: fakeLlm("not json"),
    }).draftProposal({ text: "Buy AirPods Pro 2 for $229" });
    expect(result.source).toBe("rules");
    expect(result.draft.proposedPrice).toBe(229);
  });
});

describe("groq http client", () => {
  it("posts a chat completion and returns the text", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: " Hello. " } }] }),
    );
    const client = createGroqHttpClient({
      apiKey: "test-key",
      model: "m",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      client.complete({
        messages: [{ role: "user", content: "hi" }],
        json: true,
      }),
    ).resolves.toBe("Hello.");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "m",
      response_format: { type: "json_object" },
    });
  });

  it("maps 401 to LLM_AUTH_FAILED", async () => {
    const client = createGroqHttpClient({
      apiKey: "bad",
      fetch: (async () => new Response("", { status: 401 })) as typeof fetch,
    });
    await expect(
      client.complete({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ code: "LLM_AUTH_FAILED" });
  });
});
