import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import { parsePiSessionModels } from "../src/runtime/pi-models.ts";

function model(extra: Partial<Model<"openai-completions">> = {}): Model<"openai-completions"> {
  return {
    id: "custom",
    name: "Custom",
    provider: "fixture",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:1",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 256,
    ...extra,
  };
}

test("session model projection agrees with installed Pi levels and excludes provider secrets", () => {
  for (const source of [
    model(),
    model({ reasoning: false }),
    model({
      thinkingLevelMap: { off: null, minimal: null, low: "low", xhigh: "xhigh", max: "max" },
    }),
    model({ thinkingLevelMap: { low: null, medium: null, high: null, xhigh: null, max: null } }),
  ]) {
    source.headers = { Authorization: "private-provider-header" };
    const [value] = parsePiSessionModels({ models: [source] });
    assert.deepEqual(value, {
      provider: source.provider,
      id: source.id,
      supportsImages: true,
      thinkingLevels: getSupportedThinkingLevels(source),
    });
    assert.equal(JSON.stringify(value).includes("private-provider-header"), false);
    assert.equal(JSON.stringify(value).includes("baseUrl"), false);
  }
});

test("session registry rejects malformed, duplicate and excessive model metadata", () => {
  for (const models of [
    [model(), model()],
    [{ ...model(), input: "image" }],
    [{ ...model(), reasoning: "yes" }],
    [{ ...model(), thinkingLevelMap: { low: {} } }],
    [{ ...model(), thinkingLevelMap: { high: 1024 } }],
    [{ ...model(), provider: "" }],
    Array.from({ length: 10_001 }, () => model()),
  ])
    assert.throws(() => parsePiSessionModels({ models }));
  assert.deepEqual(parsePiSessionModels({ models: [] }), []);
});
