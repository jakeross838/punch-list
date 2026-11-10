// Made by tools/build-functions.mjs from packages/core. Change it there, then run that.
// packages/core/src/features.ts
var FEATURES = ["types", "hours", "visits", "ownerPage"];
var SHIPPED = { types: false, hours: false, visits: false, ownerPage: false };
var state = { ...SHIPPED };
function featureOn(feature) {
  return state[feature];
}
function setFeatures(next) {
  for (const f of FEATURES) {
    const on = next[f];
    if (typeof on === "boolean") state[f] = on;
  }
}
function featuresFrom(text) {
  const names = (text ?? "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (names.includes("all")) return { types: true, hours: true, visits: true, ownerPage: true };
  const out = {};
  for (const f of FEATURES) if (names.includes(f.toLowerCase())) out[f] = true;
  return out;
}
function named() {
  try {
    return globalThis.process?.env?.EXPO_PUBLIC_FEATURES;
  } catch {
    return void 0;
  }
}
setFeatures(featuresFrom(named()));

// packages/core/src/emails.ts
var jobPlace = (job) => job.address.trim() || job.name.trim();
var firstName = (name) => name.trim().split(/\s+/)[0] ?? "";
var signedBy = (from, company = "") => firstName(from?.name ?? "") || company.trim();
var thanks = (from, company) => {
  const who = signedBy(from, company);
  return who ? ["Thanks,", who] : ["Thanks."];
};
function greeting(contacts) {
  const names = [...new Set(contacts.map((c) => firstName(c.name)).filter(Boolean))];
  if (names.length === 0) return "Hi,";
  if (names.length <= 2) return `Hi ${names.join(" and ")},`;
  return "Hi everyone,";
}
function companyListEmail(input) {
  const place = jobPlace(input.job);
  const lines = [
    greeting(input.contacts),
    "",
    `Here is your current list for ${place}. Take a look and let me know if anything is missing or needs adjusting.${input.ready > 0 ? " Anything marked ready can be done any time, so if you have an open day I would love to get those cleared out. It is numbered in the order to do it, starting with what holds up the most other work." : ""}`
  ];
  if (input.link) {
    lines.push(
      "",
      featureOn("hours") ? "It is also on your page with the photos, kept up to date. There you can confirm each item, put in how long it takes, mark it done and comment on anything:" : "It is also on your page with the photos, kept up to date. There you can confirm each item, mark it done and comment on anything:",
      input.link
    );
  }
  lines.push("", ...thanks(input.from, input.company));
  return { subject: `${place} Completion List`, body: lines.join("\n") };
}
function inviteEmail(input) {
  const first = firstName(input.person.name);
  const at = input.company.trim() ? ` for ${input.company.trim()}` : "";
  const body = [
    first ? `Hi ${first},` : "Hi,",
    "",
    `I set you up on ${input.app}${at}, the app we use for every job's list. You can get it here:`,
    input.link,
    "",
    `Once it is on your phone, sign in with ${input.person.email} and your jobs will be there.`,
    "",
    ...thanks(input.from, input.company)
  ].join("\n");
  return { subject: `You are set up on ${input.app}${at}`, body };
}

// packages/core/src/claude.ts
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
export {
  companyListEmail,
  costCents,
  inviteEmail
};
