// Scripted moderator lines (no LLM needed, so the structure never breaks) + canned fallbacks.
import type { Language } from "./types";

type Lines = {
  brief: (topic: string, minutes: number, names: string) => string;
  open: string;
  ackHand: (name: string) => string;
  half: (minutesLeft: number) => string;
  oneMinute: string;
  closingIntro: string;
  callClosing: (name: string) => string;
  callStudentClosing: (name: string) => string;
  studentSkipped: string;
  thanks: string;
  resume: string;
  fallback: string[]; // used when every AI call fails
};

const EN: Lines = {
  brief: (topic, minutes, names) =>
    `Good morning, everyone, and welcome. Today's topic is: ${topic}. You have ${minutes} minute${minutes === 1 ? "" : "s"}. Joining us are ${names}. Please keep it respectful, build on each other's points, and let everyone speak. At the end I'll ask each of you for a short conclusion.`,
  open: "The floor is open. Who would like to begin?",
  ackHand: (name) => `Go ahead, ${name}.`,
  half: (m) => `Just a reminder, we're at the halfway mark. About ${m} minutes left.`,
  oneMinute: "One minute left. Please start wrapping up your points.",
  closingIntro: "Time's up. Let's go around the table for closing statements, about thirty seconds each.",
  callClosing: (name) => `${name}, your conclusion please.`,
  callStudentClosing: (name) => `And finally, ${name}. Your conclusion, please.`,
  studentSkipped: "Alright, we'll leave it there.",
  thanks: "Thank you, everyone. That concludes the discussion. Your feedback report is being prepared.",
  resume: "We're back. Let's continue where we left off.",
  fallback: [
    "Let's hear a different perspective. What about the impact on ordinary people?",
    "Can someone bring in an example to support their view?",
    "Let's look at the other side. What are the risks here?",
    "What would a practical first step look like?",
  ],
};

const HI: Lines = {
  brief: (topic, minutes, names) =>
    `Good morning everyone, welcome. Aaj ka topic hai: ${topic}. Aapke paas ${minutes} minutes hain. Aaj hamare saath hain ${names}. Please respectful rahiye, ek dusre ke points pe build kariye, aur sabko bolne dijiye. End mein main sabse ek short conclusion maangungi.`,
  open: "Floor open hai. Kaun start karna chahega?",
  ackHand: (name) => `Haan ${name}, boliye.`,
  half: (m) => `Reminder: hum halfway pe hain. Lagbhag ${m} minutes bache hain.`,
  oneMinute: "Ek minute bacha hai. Please apne points wrap up kariye.",
  closingIntro: "Time's up. Ab closing statements, har koi lagbhag thirty seconds.",
  callClosing: (name) => `${name}, aapka conclusion.`,
  callStudentClosing: (name) => `Aur finally, ${name}. Aapka conclusion please.`,
  studentSkipped: "Theek hai, yahin rokte hain.",
  thanks: "Thank you everyone. Discussion yahin khatam hota hai. Aapki feedback report ban rahi hai.",
  resume: "Hum wapas aa gaye. Jahan ruke the wahin se continue karte hain.",
  fallback: [
    "Chaliye ek alag perspective sunte hain. Aam logon pe iska kya impact hoga?",
    "Koi apne point ke liye ek example de sakta hai?",
    "Doosri side bhi dekhte hain. Isme risks kya hain?",
    "Ek practical first step kya ho sakta hai?",
  ],
};

export function moderatorLines(language: Language): Lines {
  const L = language === "hinglish" ? HI : EN;
  // Topics often end with "?" or "."; the brief adds its own full stop.
  return { ...L, brief: (topic, minutes, names) => L.brief(topic.trim().replace(/[?.!]+$/, ""), minutes, names) };
}
