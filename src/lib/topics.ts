export interface Topic {
  title: string;
  category: TopicCategory;
}

export type TopicCategory = "Business & Economy" | "Abstract" | "Social & Controversial" | "Case-based";

export const CATEGORIES: TopicCategory[] = ["Business & Economy", "Abstract", "Social & Controversial", "Case-based"];

export const TOPICS: Topic[] = [
  { category: "Business & Economy", title: "Should India move to a 4-day work week?" },
  { category: "Business & Economy", title: "AI will create more jobs than it destroys" },
  { category: "Business & Economy", title: "Startup or MNC: where should a fresher begin?" },
  { category: "Business & Economy", title: "Is UPI making India cashless too fast?" },
  { category: "Business & Economy", title: "Gig workers deserve full employee benefits" },
  { category: "Business & Economy", title: "Work from home is here to stay" },
  { category: "Abstract", title: "Zero" },
  { category: "Abstract", title: "Red vs Blue" },
  { category: "Abstract", title: "Bridges" },
  { category: "Abstract", title: "The glass is half empty" },
  { category: "Abstract", title: "Silence speaks louder than words" },
  { category: "Social & Controversial", title: "Social media should be banned for under-16s" },
  { category: "Social & Controversial", title: "Reservation should be extended to the private sector" },
  { category: "Social & Controversial", title: "Coaching centres do more harm than good" },
  { category: "Social & Controversial", title: "Online gaming should be regulated like gambling" },
  { category: "Social & Controversial", title: "Is India ready for a uniform civil code?" },
  {
    category: "Case-based",
    title: "A D2C snack brand's sales fell 30% after quick-commerce apps launched their own label. What should it do?",
  },
  {
    category: "Case-based",
    title: "A mid-size IT firm must cut costs by 15% without layoffs. Propose a plan.",
  },
  {
    category: "Case-based",
    title: "A tier-2 city wants to cut traffic deaths by half in 3 years. Where should it start?",
  },
  {
    category: "Case-based",
    title: "Your college fest lost its main sponsor two weeks before the event. What now?",
  },
];

export const CUSTOM_TOPIC_MIN = 4;
export const CUSTOM_TOPIC_MAX = 200;

export function validateCustomTopic(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length < CUSTOM_TOPIC_MIN) return `Topic must be at least ${CUSTOM_TOPIC_MIN} characters.`;
  if (t.length > CUSTOM_TOPIC_MAX) return `Topic must be under ${CUSTOM_TOPIC_MAX} characters.`;
  return null;
}
