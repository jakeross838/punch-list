// Made by tools/build-functions.mjs from packages/core. Change it there, then run that.
// packages/core/src/rules.ts
var TITLE_MAX = 80;

// packages/core/src/suggest.ts
var COLOR = { red: "red", yellow: "yellow", white: "white", black: "black" };
var pct = (v) => `${Math.round(v * 100)}%`;
function describeMarks(marks) {
  return marks.flatMap((m) => {
    switch (m.tool) {
      case "circle":
      case "box": {
        const [x1, y1] = m.from;
        const [x2, y2] = m.to;
        const shape = m.tool === "circle" ? "circle" : "box";
        return [`A ${COLOR[m.color]} ${shape} around the area from ${pct(Math.min(x1, x2))} to ${pct(Math.max(x1, x2))} across and ${pct(Math.min(y1, y2))} to ${pct(Math.max(y1, y2))} down.`];
      }
      case "arrow":
        return [`A ${COLOR[m.color]} arrow pointing at the spot ${pct(m.to[0])} across and ${pct(m.to[1])} down.`];
      case "pen": {
        const xs = m.points.map((p) => p[0]);
        const ys = m.points.map((p) => p[1]);
        return [`A ${COLOR[m.color]} line drawn over the area from ${pct(Math.min(...xs))} to ${pct(Math.max(...xs))} across and ${pct(Math.min(...ys))} to ${pct(Math.max(...ys))} down.`];
      }
      case "measure": {
        const size = m.text.trim();
        return [
          `A ${COLOR[m.color]} measurement from ${pct(m.from[0])} across and ${pct(m.from[1])} down to ${pct(m.to[0])} across and ${pct(m.to[1])} down${size ? `, marked "${size}"` : ""}.`
        ];
      }
      case "number":
        return [`Spot ${m.n}, a ${COLOR[m.color]} numbered dot at ${pct(m.at[0])} across and ${pct(m.at[1])} down.`];
      case "text":
        return [
          m.to ? `A note reading "${m.text}" with an arrow pointing at the spot ${pct(m.to[0])} across and ${pct(m.to[1])} down.` : `A note reading "${m.text}" at ${pct(m.at[0])} across and ${pct(m.at[1])} down.`
        ];
      default:
        return [];
    }
  });
}
var COUNT_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
function suggestPrompt(ctx) {
  const marks = describeMarks(ctx.marks);
  const spots = ctx.marks.filter((m) => m.tool === "number").length;
  const sized = ctx.marks.some((m) => m.tool === "measure" && m.text.trim() !== "");
  return [
    "You are filling in one item on the running list of work that still needs to be done on a home builder's job site, from one photo.",
    `The photo was taken in ${ctx.room}.`,
    marks.length > 0 ? `The superintendent marked the photo to show the problem:
${marks.map((m) => `- ${m}`).join("\n")}` : "The photo has no marks. Find the most likely unfinished work or problem in it.",
    ...ctx.words?.trim() ? [`They also said or typed: "${ctx.words.trim()}". That is the problem in their words: go by it.`] : [],
    "",
    "Write the item the way a builder writes it on a punch list:",
    '- title: a verb and the thing, as short as possible, like "Install toilet" or "Touch up paint". No room, no trade, no sizes, no brands. When one of the standard titles below fits, use it word for word.',
    "- description: where exactly and what is involved, in one short sentence with proper capitalization, or an empty string when the title says it all. Do not name the room.",
    ...spots > 1 ? [`- The ${spots} numbered spots are places with the same work: the description says so, like "${COUNT_WORDS[spots] ?? spots} spots, numbered on the photo."`] : [],
    ...sized ? ['- A size marked on the photo goes in the description as it is written, like "24 inches left of the vanity."'] : [],
    "- trade: one of the trades below, or null when unsure.",
    "- company: the company on this job for that trade, from the list below, or null when unsure.",
    "- others: when the marks point at separate problems that would be separate items (different work, or a different company), the first one goes above and each other one goes in others, in the same shape. Otherwise an empty list.",
    "",
    "Standard titles (title, trade):",
    ...ctx.titles.slice(0, 150).map((t) => `- ${t.title}${t.trade ? ` (${t.trade})` : ""}`),
    "",
    `Trades: ${ctx.trades.join(", ")}`,
    "",
    "Companies on this job (company, trade):",
    ...ctx.companies.map((c) => `- ${c.name} (${c.trade})`),
    "",
    'Reply with only JSON, like {"title": "Touch up paint", "description": "Ceiling at the hood soffit.", "trade": "Painting", "company": "Triple H Painting", "others": []}.'
  ].join("\n");
}

// packages/core/src/claude.ts
var record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function clip(v, most) {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(/\s+/g, " ").trim().slice(0, most);
}
function listOf(v, most, read) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const x of v) {
    if (out.length >= most) break;
    const r = read(x);
    if (r !== null && r !== "") out.push(r);
  }
  return out;
}
var textList = (v, most, size) => listOf(v, most, (x) => clip(x, size) || null);
function brief(v) {
  const r = record(v);
  const title = clip(r.title, TITLE_MAX);
  if (!title) return null;
  return { n: Math.max(0, Math.floor(Number(r.n) || 0)), title, description: clip(r.description, 300), location: clip(r.location, 60) };
}
var line = (i) => `#${i.n} ${i.title}${i.description ? `: ${i.description}` : ""}${i.location ? ` (in ${i.location})` : ""}`;
var COLORS = ["red", "yellow", "white", "black"];
var unit = (v) => typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
function point(v) {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = unit(v[0]);
  const y = unit(v[1]);
  return x === null || y === null ? null : [x, y];
}
function cleanMark(v) {
  const m = record(v);
  const color = COLORS.find((c) => c === m.color) ?? "red";
  switch (m.tool) {
    case "pen": {
      const points = listOf(m.points, 400, point);
      return points.length > 0 ? { tool: "pen", color, points } : null;
    }
    case "arrow":
    case "circle":
    case "box": {
      const from = point(m.from);
      const to = point(m.to);
      return from && to ? { tool: m.tool, color, from, to } : null;
    }
    case "measure": {
      const from = point(m.from);
      const to = point(m.to);
      return from && to ? { tool: "measure", color, from, to, text: clip(m.text, 40) } : null;
    }
    case "number": {
      const at = point(m.at);
      const n = Math.floor(Number(m.n));
      return at && n > 0 && n < 100 ? { tool: "number", color, at, n } : null;
    }
    case "text": {
      const at = point(m.at);
      const to = point(m.to);
      const text = clip(m.text, 60);
      return at && text ? { tool: "text", color, at, text, ...to ? { to } : {} } : null;
    }
    default:
      return null;
  }
}
function suggestInput(v) {
  const c = record(v);
  return {
    room: clip(c.room, 60) || "the job",
    titles: listOf(c.titles, 150, (t) => {
      const x = record(t);
      const title = clip(x.title, TITLE_MAX);
      return title ? { title, trade: clip(x.trade, 40) || null, hours: typeof x.hours === "number" && x.hours > 0 && x.hours < 200 ? x.hours : null } : null;
    }),
    companies: listOf(c.companies, 60, (t) => {
      const x = record(t);
      const name = clip(x.name, 80);
      return name ? { name, trade: clip(x.trade, 40) } : null;
    }),
    trades: textList(c.trades, 60, 40),
    marks: listOf(c.marks, 30, cleanMark),
    words: clip(c.words, 400)
  };
}
function sayItInput(v) {
  const r = record(v);
  return {
    words: clip(r.words, 4e3),
    here: clip(r.here, 60) || null,
    locations: textList(r.locations, 300, 60),
    companies: listOf(r.companies, 80, (c) => {
      const x = record(c);
      const name = clip(x.name, 80);
      return name ? { name, trade: clip(x.trade, 40) } : null;
    }),
    people: textList(r.people, 80, 80),
    titles: listOf(r.titles, 150, (t) => {
      const x = record(t);
      const title = clip(x.title, TITLE_MAX);
      return title ? { title, trade: clip(x.trade, 40) || null } : null;
    })
  };
}
function sayItPrompt(input) {
  return [
    "A superintendent walking a home builder's job said what is left to do. Turn it into items on the job's running list of work.",
    "",
    `What they said: "${input.words}"`,
    input.here ? `They are standing in ${input.here}.` : "They did not say where they are standing.",
    "",
    "Rules:",
    "- Each separate thing to do is its own item. Leave out filler, repeats and anything that is not work to do.",
    '- title: a verb and the thing, as short as possible, like "Install toilet" or "Touch up paint". When one of the standard titles below fits, use it word for word. No room, no company.',
    "- description: where exactly and what is involved, in one short sentence with proper capitalization, or an empty string. Keep sizes and spots they said.",
    `- location: one of the job's locations below, written exactly as it is there. When they name no location, use ${input.here ? `"${input.here}"` : "null"}. Never make one up.`,
    "- assignedTo: a company or a person from the lists below, written exactly as it is there, when they say who does it or the work plainly belongs to the trade one company does on this job. Otherwise null.",
    "- waitingOn: when they say it has to wait for something (other work, the owner, a part), a few words naming it; otherwise null.",
    "",
    "Locations on the job:",
    ...input.locations.map((l) => `- ${l}`),
    "",
    "Companies on the job (company, trade):",
    ...input.companies.map((c) => `- ${c.name} (${c.trade})`),
    "",
    `People on the team: ${input.people.join(", ") || "none"}`,
    "",
    "Standard titles (title, trade):",
    ...input.titles.map((t) => `- ${t.title}${t.trade ? ` (${t.trade})` : ""}`),
    "",
    'Reply with only JSON, like {"items": [{"title": "Adjust cabinet door", "description": "Upper left of the sink rubs the frame.", "location": "Kitchen 109", "assignedTo": "SMS Carpentry", "waitingOn": null}]}.'
  ].join("\n");
}
function sameItemInput(v) {
  const r = record(v);
  const item = brief({ ...record(r.item), n: 0 }) ?? { n: 0, title: "", description: "", location: "" };
  return { item: { title: item.title, description: item.description, location: item.location }, candidates: listOf(r.candidates, 12, brief), photos: r.photos === true };
}
function sameItemPrompt(input) {
  return [
    "Someone is adding an item to the running list of work left to do on a home builder's job. Is it the same work as one already on the list?",
    "",
    `The new item: ${input.item.title}${input.item.description ? `: ${input.item.description}` : ""}${input.item.location ? ` (in ${input.item.location})` : ""}`,
    "",
    "Already on the list:",
    ...input.candidates.map((c) => `- ${line(c)}`),
    ...input.photos ? ["", "The pictures are the new item's photo first, then the photos of the ones on the list, in the order above."] : [],
    "",
    "It is the same work when one visit to fix the one already on the list would fix this too: the same thing in the same spot, said another way. The same kind of work somewhere else, or a different part of the same thing, is not the same.",
    "",
    'Reply with only JSON: {"same": 12} with the number of the one it is, or {"same": null}.'
  ].join("\n");
}
function duplicatesInput(v) {
  const r = record(v);
  return {
    pairs: listOf(r.pairs, 60, (p) => {
      const x = record(p);
      const a = brief(x.a);
      const b = brief(x.b);
      return a && b ? { n: Math.max(0, Math.floor(Number(x.n) || 0)), a, b } : null;
    })
  };
}
function duplicatesPrompt(input) {
  return [
    "These are pairs of items on the running list of work left to do on a home builder's job that look alike. For each pair, say whether they are the same work written twice.",
    "",
    "They are the same when one visit to fix one would fix the other: the same thing in the same spot, said another way. The same kind of work somewhere else, or a different part of the same thing, is not the same.",
    "",
    ...input.pairs.map((p) => `Pair ${p.n}: ${line(p.a)} | ${line(p.b)}`),
    "",
    'Reply with only JSON: {"same": [1, 4]} with the numbers of the pairs that are the same work, or {"same": []}.'
  ].join("\n");
}
function standardTitleInput(v) {
  const r = record(v);
  return { title: clip(r.title, TITLE_MAX), titles: textList(r.titles, 300, TITLE_MAX) };
}
function standardTitlePrompt(input) {
  return [
    "A builder keeps a list of standard titles so the same work reads the same way on every list. Someone typed a new title. Is it one of the standard titles said another way?",
    "",
    `They typed: "${input.title}"`,
    "",
    "Standard titles:",
    ...input.titles.map((t) => `- ${t}`),
    "",
    'Only count it when it is plainly the same work: "towel bar is loose" is "Tighten towel bar", not "Install towel bar".',
    'Reply with only JSON: {"title": "Tighten towel bar"} with the standard title written exactly as it is above, or {"title": null}.'
  ].join("\n");
}
function companyCardInput(v) {
  const r = record(v);
  return { words: String(r.words ?? "").trim().slice(0, 2e3), card: r.card === true, trades: textList(r.trades, 80, 40) };
}
function companyCardPrompt(input) {
  const from = input.card && input.words ? "a photo of a business card and an email signature" : input.card ? "a photo of a business card" : "an email signature";
  return [
    `Read a company's details for a home builder's list of the companies it works with, from ${from}.`,
    ...input.words ? ["", "The email signature, between the lines:", "---", input.words, "---"] : [],
    "",
    "- name: the company's name, with normal capitalization. Not a person's name.",
    `- trade: the one of these trades the company does, written exactly as it is here, or null when unsure: ${input.trades.join(", ") || "none"}.`,
    "- phone: the company's main phone as written, or null. email: the company's main email, or null.",
    "- people: each person named, with their name, and their own phone and email as written (null for any not given).",
    "",
    'Reply with only JSON, like {"name": "Gator Plumbing", "trade": "Plumbing", "phone": "941-555-0101", "email": "office@gatorplumbing.com", "people": [{"name": "Dave Smith", "phone": "941-555-0102", "email": "dave@gatorplumbing.com"}]}.'
  ].join("\n");
}
function waitsOnInput(v) {
  const r = record(v);
  const it = record(r.item);
  return {
    item: { title: clip(it.title, TITLE_MAX), description: clip(it.description, 300), location: clip(it.location, 60), company: clip(it.company, 80) },
    candidates: listOf(r.candidates, 30, (c) => {
      const b = brief(c);
      return b ? { ...b, company: clip(record(c).company, 80) } : null;
    })
  };
}
function waitsOnPrompt(input) {
  return [
    "Someone is adding an item to the running list of work left to do on a home builder's job. Does it have to wait for any of the other open items in the same location to be done first?",
    "",
    `The new item: ${input.item.title}${input.item.description ? `: ${input.item.description}` : ""}${input.item.location ? ` (in ${input.item.location})` : ""}${input.item.company ? `, by ${input.item.company}` : ""}`,
    "",
    "Open in the same location:",
    ...input.candidates.map((c) => `- ${line(c)}${c.company ? `, by ${c.company}` : ""}`),
    "",
    "Only count work that plainly has to come first, the way a builder sequences a house: the tile floor before the toilet is set, the drywall before the paint, the countertop before the faucet. Not work that merely sits nearby.",
    'Reply with only JSON: {"waits": [12]} with the numbers of the items it waits on, or {"waits": []}.'
  ].join("\n");
}
function columnsInput(v) {
  const r = record(v);
  return { rows: listOf(r.rows, 8, (row) => Array.isArray(row) ? row.slice(0, 20).map((c) => clip(c, 80)) : null) };
}
function columnsPrompt(input) {
  return [
    "These are the first rows of a spreadsheet of work left to do on a home builder's job, written by someone else. Say which column holds what, counting the columns from 0.",
    "",
    ...input.rows.map((r, i) => `Row ${i + 1}: ${r.map((c, j) => `[${j}] ${c}`).join(" | ")}`),
    "",
    "- title: the work to do. description: more about it or where exactly. location: the room or area. assignedTo: the company or person who does it. waitingOn: what it waits for. done: says when a row is finished.",
    "- header: whether row 1 names the columns rather than being work.",
    'Reply with only JSON, like {"title": 1, "description": 2, "location": 0, "assignedTo": 3, "waitingOn": null, "done": null, "header": true}, with null for any column the spreadsheet does not have.'
  ].join("\n");
}
function doneCheckInput(v) {
  const r = record(v);
  return { title: clip(r.title, TITLE_MAX), description: clip(r.description, 300), location: clip(r.location, 60), marks: listOf(r.marks, 30, cleanMark) };
}
function doneCheckPrompt(input) {
  const marks = describeMarks(input.marks);
  return [
    "Someone says one item on the running list of work left to do on a home builder's job is finished. Check the work from two photos.",
    "",
    `The item: ${input.title}${input.description ? `: ${input.description}` : ""}${input.location ? ` (in ${input.location})` : ""}`,
    `The first picture is the photo of the problem, taken before the work.${marks.length > 0 ? " It was marked to show the problem:" : ""}`,
    ...marks.map((m) => `- ${m}`),
    "The second picture is the photo of the finished work.",
    "",
    "Does the second photo show this item done? Look only at what the item is about, in the same spot. When the second photo does not show that spot, or it is too dark or blurry to tell, say you cannot tell.",
    "",
    'Reply with only JSON: {"done": "yes"} when it looks done; {"done": "no", "left": "The left hinge still looks loose."} with one short sentence on what still looks left; or {"done": "unsure", "left": "The photo does not show the hinge."} with one short sentence on why.'
  ].join("\n");
}
var CLAUDE_TASKS = {
  "fill-in": { tier: "sharp", maxTokens: 900, images: 1, minImages: 1, prompt: (v) => suggestPrompt(suggestInput(v)), enough: () => true },
  "say-it": { tier: "sharp", maxTokens: 3e3, images: 0, minImages: 0, prompt: (v) => sayItPrompt(sayItInput(v)), enough: (v) => sayItInput(v).words !== "" },
  "same-item": {
    tier: "quick",
    maxTokens: 100,
    images: 6,
    minImages: 0,
    prompt: (v) => sameItemPrompt(sameItemInput(v)),
    enough: (v) => {
      const x = sameItemInput(v);
      return x.item.title !== "" && x.candidates.length > 0;
    }
  },
  duplicates: { tier: "quick", maxTokens: 400, images: 0, minImages: 0, prompt: (v) => duplicatesPrompt(duplicatesInput(v)), enough: (v) => duplicatesInput(v).pairs.length > 0 },
  "standard-title": {
    tier: "quick",
    maxTokens: 100,
    images: 0,
    minImages: 0,
    prompt: (v) => standardTitlePrompt(standardTitleInput(v)),
    enough: (v) => {
      const x = standardTitleInput(v);
      return x.title !== "" && x.titles.length > 0;
    }
  },
  "done-check": { tier: "sharp", maxTokens: 300, images: 2, minImages: 2, prompt: (v) => doneCheckPrompt(doneCheckInput(v)), enough: (v) => doneCheckInput(v).title !== "" },
  columns: { tier: "quick", maxTokens: 200, images: 0, minImages: 0, prompt: (v) => columnsPrompt(columnsInput(v)), enough: (v) => columnsInput(v).rows.length > 0 },
  "waits-on": {
    tier: "quick",
    maxTokens: 100,
    images: 0,
    minImages: 0,
    prompt: (v) => waitsOnPrompt(waitsOnInput(v)),
    enough: (v) => {
      const x = waitsOnInput(v);
      return x.item.title !== "" && x.candidates.length > 0;
    }
  },
  "company-card": {
    tier: "sharp",
    maxTokens: 600,
    images: 1,
    minImages: 0,
    prompt: (v) => companyCardPrompt(companyCardInput(v)),
    enough: (v) => {
      const x = companyCardInput(v);
      return x.words !== "" || x.card;
    }
  }
};
var isClaudeTask = (v) => typeof v === "string" && Object.hasOwn(CLAUDE_TASKS, v);
function taskPrompt(task, input) {
  return CLAUDE_TASKS[task].prompt(input);
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
export {
  CLAUDE_MODELS,
  CLAUDE_TASKS,
  costCents,
  isClaudeTask,
  taskPrompt
};
