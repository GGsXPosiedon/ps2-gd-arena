import type { CriterionKey } from "@/lib/types";

/** The six GD criteria, in report order: label, short label, what panels look for, and a one-line practice focus. */
export const CRITERIA: { key: CriterionKey; label: string; short: string; looksFor: string; focus: string }[] = [
  {
    key: "initiation",
    label: "Starting the Discussion",
    short: "Starting",
    looksFor: "Opens the discussion early and frames it for the group",
    focus: "Open the discussion in the first minute",
  },
  {
    key: "ideas",
    label: "Quality of Ideas",
    short: "Ideas",
    looksFor: "Relevant points backed by an example, a number or a clear reason",
    focus: "Back every point with an example or a number",
  },
  {
    key: "building",
    label: "Building on Others",
    short: "Building",
    looksFor: "Names a peer and extends, counters or combines their point",
    focus: "Name someone and build on their point",
  },
  {
    key: "listening",
    label: "Listening",
    short: "Listening",
    looksFor: "Responds to what was said, asks questions, brings quieter people in",
    focus: "Ask a question and bring a quieter member in",
  },
  {
    key: "interruptions",
    label: "Handling Interruptions",
    short: "Interruptions",
    looksFor: "Holds the floor politely when cut off, then finishes the point",
    focus: "Hold the floor when someone cuts in",
  },
  {
    key: "ending",
    label: "Ending Strongly",
    short: "Ending",
    looksFor: "Summarises the discussion and closes with a clear position",
    focus: "Close with a clear summary and your position",
  },
];

export const CRITERION = Object.fromEntries(CRITERIA.map((c) => [c.key, c])) as Record<CriterionKey, (typeof CRITERIA)[number]>;
