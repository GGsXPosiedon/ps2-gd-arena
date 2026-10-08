import type { CriterionKey } from "@/lib/types";

/** The six GD criteria, in report order, with a short label and a one-line practice focus. */
export const CRITERIA: { key: CriterionKey; label: string; short: string; focus: string }[] = [
  { key: "initiation", label: "Starting the Discussion", short: "Starting", focus: "Open the discussion in the first minute" },
  { key: "ideas", label: "Quality of Ideas", short: "Ideas", focus: "Back every point with an example or a number" },
  { key: "building", label: "Building on Others", short: "Building", focus: "Name someone and build on their point" },
  { key: "listening", label: "Listening", short: "Listening", focus: "Ask a question and bring a quieter member in" },
  { key: "interruptions", label: "Handling Interruptions", short: "Interruptions", focus: "Hold the floor when someone cuts in" },
  { key: "ending", label: "Ending Strongly", short: "Ending", focus: "Close with a clear summary and your position" },
];

export const CRITERION = Object.fromEntries(CRITERIA.map((c) => [c.key, c])) as Record<CriterionKey, (typeof CRITERIA)[number]>;
