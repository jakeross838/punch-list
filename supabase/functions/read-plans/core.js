// Made by tools/build-functions.mjs from packages/core. Change it there, then run that.
// packages/core/src/planReading.ts
var EXAMPLE = {
  name: "Smith Residence",
  address: "123 Gulf Drive, Holmes Beach, Florida 34217",
  levels: [
    {
      name: "Level 1",
      sheet: 3,
      rooms: [
        { name: "Garage", number: "101" },
        { name: "Foyer", number: "102" },
        { name: "Powder", number: "103" }
      ]
    },
    {
      name: "Level 2",
      sheet: 4,
      rooms: [
        { name: "Master Bedroom", number: "201" },
        { name: "Master Closet", number: null }
      ]
    }
  ],
  outside: ["Pool", "Driveway", "Dock"],
  notes: null
};
function planPrompt(options = {}) {
  const levels = (options.levels ?? []).filter((l) => l.trim() !== "");
  const lines = [
    "These are the plans for a house being built. Read them to set up the job's punch list: the job's name and address, and every location to walk on each level.",
    options.text ? "The plans are below as the text on each page. Each line gives where the text sits on the page, across and then down from the top left corner, from 0 to 1000, then the text." : "The plans are attached.",
    "",
    "Find the floor plans: the sheets titled like First Floor Plan, Level 2 Plan or Ground Floor Plan. Read each room's name and number from its room tag. Sheets that show a floor again for another trade (electrical, framing, lighting, finishes) can fill in a name the floor plan leaves out, but they are not more rooms.",
    "",
    "Rules:",
    "- Every room, closet, bath, hall, stair, porch, lanai and balcony on each level, and the garage.",
    "- Write each name out in full with normal capitalization, the way someone on site would say it: Master Bath, not M. BATH; Walk In Closet, not W.I.C.",
    "- Every name is different from every other room in the house. When the plans repeat a name without a number (Closet, Bath), name it for the room it opens off: Master Closet, Bedroom 2 Closet, Hall Bath.",
    "- The room number exactly as the plans give it (101, 2A, 204B), or null when the room has none.",
    "- Each level's rooms in the order you would walk them: from the front door or the top of the stair, room to room, each closet and bath right after the room it opens off. The room numbers usually give that order.",
    `- Levels from the lowest up, named the way the plans name them and written out: Ground Level, Level 1, Second Floor, Roof Deck.${levels.length > 0 ? ` The job already has these levels: ${levels.join(", ")}. Use those names for the same levels.` : ""}`,
    "- outside: Pool and Driveway, unless a site plan shows the house has none, then anything else outside the house that the plans show, like Dock, Spa or Fence. The elevations, the roof, the site and the whole house are already on every job.",
    "- name: the job's name from the title block, like Smith Residence, or null. address: the house's street address from the title block, in one line, not the architect's, or null.",
    "- sheet: for each level, the number of the page (or the picture) with its floor plan, counting from 1, or null when no floor plan shows the level.",
    "- notes: a short sentence on anything you could not read or are unsure of, or null.",
    "",
    "Reply with only JSON, like:",
    JSON.stringify(EXAMPLE)
  ];
  if (options.text) lines.push("", "The plans:", options.text);
  return lines.join("\n");
}
function picturesNote(pieces) {
  const sheets = pieces.map((n, i) => n > 1 ? `Sheet ${i + 1}: the whole sheet, then ${n} pieces of it at full size, left to right and top to bottom, overlapping a little.` : `Sheet ${i + 1}: the whole sheet.`);
  return `The plans are attached as pictures of ${pieces.length === 1 ? "one sheet" : `${pieces.length} sheets`}, in this order. ${sheets.join(" ")}`;
}

// packages/core/src/rules.ts
var TITLE_MAX = 80;

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
function listReadInput(v) {
  const { words: _words, here: _here, ...rest } = sayItInput({ ...record(v), words: "" });
  return rest;
}
function listReadPrompt(input, options = {}) {
  const lines = [
    "This is a punch list for a house being built: a list of work left to do, written by someone else, like a superintendent, the owner, the designer or an inspector. Turn each thing on it into an item on the job's running list of work.",
    options.text ? "The list is below, as the text on each page." : options.pages ? `The list is attached as ${options.pages === 1 ? "a picture of one page" : `pictures of ${options.pages} pages, in order`}.` : "The list is attached.",
    "",
    "Rules:",
    "- Each separate thing to do is its own item. Leave out headings, totals, page numbers, signatures and anything that is not work to do, and anything marked done or complete.",
    '- title: a verb and the thing, as short as possible, like "Install toilet" or "Touch up paint". When one of the standard titles below fits, use it word for word. No room, no company.',
    "- description: where exactly and what is involved, in one short sentence with proper capitalization, or an empty string. Keep sizes and spots the list gives.",
    "- location: one of the job's locations below, written exactly as it is there, when the list says where (a room heading counts for everything under it). Otherwise null. Never make one up.",
    "- assignedTo: a company or a person from the lists below, written exactly as it is there, when the list says who does it or the work plainly belongs to the trade one company does on this job. Otherwise null.",
    "- waitingOn: when the list says it has to wait for something (other work, the owner, a part), a few words naming it; otherwise null.",
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
  ];
  if (options.text) lines.push("", "The list:", options.text);
  return lines.join("\n");
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
  costCents,
  listReadInput,
  listReadPrompt,
  picturesNote,
  planPrompt
};
