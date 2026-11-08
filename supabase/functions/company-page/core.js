// Made by tools/build-functions.mjs from packages/core. Change it there, then run that.
// packages/core/src/planReading.ts
function jsonIn(text) {
  const tries = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? "", text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const t of tries) {
    if (t.trim() === "") continue;
    try {
      return JSON.parse(t);
    } catch {
    }
  }
  return null;
}

// packages/core/src/claude.ts
var record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var TRANSLATE_AT_ONCE = 150;
function translatePrompt(texts) {
  return [
    "Translate these lines from a home builder's running list of work into Spanish, for a construction crew. Each is the title of the work to do, more about it, or a note from the builder.",
    "",
    ...texts.map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ").trim()}`),
    "",
    "Rules:",
    "- Use the plain Spanish a crew on a job site uses. Keep each line about as short as it is.",
    "- Keep names, room names and numbers, sizes, item numbers and brand names as they are.",
    "- Translate every line, in order, and nothing else.",
    "",
    'Reply with only JSON: {"es": ["...", "..."]} with one translation for each line, in the same order.'
  ].join("\n");
}
function readTranslations(raw, count2) {
  const list = answer(raw).es;
  const out = Array.from({ length: count2 }, () => null);
  if (!Array.isArray(list) || list.length !== count2) return out;
  for (let i = 0; i < count2; i++) {
    const t = typeof list[i] === "string" ? list[i].replace(/\s+/g, " ").trim().slice(0, 4e3) : "";
    out[i] = t || null;
  }
  return out;
}
var CLAUDE_MODELS = { quick: "claude-haiku-5-5", sharp: "claude-sonnet-5-5" };
var PRICES = [
  { model: "claude-haiku-5-5", input: 0.1, output: 0.5, long: { input: 0.5, output: 2.5 } },
  { model: "claude-sonnet-5-5", input: 2, output: 10 },
  { model: "claude-opus-5-5", input: 4, output: 20 }
];
var count = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
function costCents(model, usage) {
  const price = PRICES.find((p) => model.startsWith(p.model)) ?? PRICES[PRICES.length - 1];
  const fresh = count(usage.input_tokens);
  const written = count(usage.cache_creation_input_tokens);
  const read = count(usage.cache_read_input_tokens);
  const rate = price.long && fresh + written + read > 1e5 ? price.long : price;
  const dollars = ((fresh + written * 1.25 + read * 0.1) * rate.input + count(usage.output_tokens) * rate.output) / 1e6;
  return Math.round(dollars * 100 * 1e4) / 1e4;
}
var answer = (raw) => record(typeof raw === "string" ? jsonIn(raw) : raw);
export {
  CLAUDE_MODELS,
  TRANSLATE_AT_ONCE,
  costCents,
  readTranslations,
  translatePrompt
};
