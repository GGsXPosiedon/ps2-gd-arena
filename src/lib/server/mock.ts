// Offline mock: plausible persona lines without any LLM. Used when no API key is set and in e2e tests.
// Normal turns are composed from a lead-in (reacting to the last speaker) and an argument, so a session
// rarely repeats a line word for word.
import { PERSONAS } from "../personas";
import type { PersonaId, SpeakerId, TurnIntent, TurnRequest } from "../types";

interface Pool {
  leads: string[]; // reaction to {last}
  points: string[]; // arguments
  open: string[];
  closing: string[];
  interject?: string[];
  drift?: string[];
  redirect?: string[];
}

const EN: Record<PersonaId, Pool> = {
  arjun: {
    leads: ["{last}, with respect, that misses the bigger picture.", "No, {last}, that's too cautious.", "Look, {last}, let's be practical here.", "I'll be direct, {last}."],
    points: [
      "The trend is obvious and we can't keep debating the basics.",
      "Execution is everything, and that's exactly where my point stands.",
      "If we wait for perfect data, we will never move.",
      "The long-term upside clearly outweighs a little short-term pain.",
      "Every serious organisation is already moving in this direction.",
    ],
    open: ["Let me start. My position is clear: the benefits obviously outweigh the costs."],
    interject: ["Sorry to cut in, but that's exactly the wrong way to look at it.", "Sorry, let me stop you there, because that point doesn't hold."],
    closing: ["To conclude, I stand firmly by my view: the upside is far bigger than the risks, and we should act now."],
  },
  priya: {
    leads: ["{last}, do we have evidence for that?", "That's a sweeping claim, {last}.", "I'd push back a little, {last}.", "Adding a number to what {last} said:"],
    points: [
      "One survey I read found barely a third of firms saw lasting gains.",
      "Around 60 companies joined the pilots abroad and most kept the change, but almost all were office-based.",
      "The numbers for services and manufacturing tell very different stories.",
      "The data I've seen is mixed, roughly a 50-50 split depending on the region.",
      "We should look at who was actually measured before we generalise.",
    ],
    open: ["I'd like to begin with some numbers, because this topic is often argued on feelings rather than data."],
    redirect: ["Coming back to the topic, the real question is what the evidence says, not individual stories."],
    closing: ["My conclusion is that the evidence supports a phased approach, tested sector by sector, rather than one rule for all."],
  },
  meera: {
    leads: ["Can I add one thing?", "I think {last} is partly right.", "Building on {last}'s point,"],
    points: [
      "Nobody has talked about who actually bears the cost.",
      "The people most affected aren't in this conversation at all.",
      "Perhaps the real issue is trust, not policy.",
      "We keep debating the what, but not the how.",
    ],
    open: ["Maybe we should first define what success would look like here."],
    closing: ["For me, the key takeaway is that any answer must work for the people with the least say."],
  },
  rohan: {
    leads: ["That's interesting, {last}.", "I agree partly, {last}.", "Good point, {last}."],
    points: [
      "My cousin works at a startup in Bengaluru and honestly they try something new every month.",
      "A senior from my college said something similar during his internship.",
      "It's like the time our college fest changed its schedule and everybody adapted within a week.",
      "In my hometown people would see this very differently.",
    ],
    open: ["I'll start with a story, because this reminds me of something that happened to my cousin."],
    drift: [
      "This reminds me, my uncle runs a small shop in Pune and cricket season completely changes his business.",
      "Funny thing, I watched a podcast last night about people in Japan taking naps at work. Totally changed how I think about rest.",
      "Side note, but has anyone else noticed how every café near campus now has a co-working corner?",
    ],
    closing: ["To sum up, I think it depends on the people involved, and we should learn from real experiences."],
  },
  ananya: {
    leads: ["Let me play devil's advocate, {last}.", "Everyone seems to be agreeing too quickly.", "{last}, I'm not convinced."],
    points: [
      "What if the opposite is true and this makes things worse?",
      "Who actually loses if we go down this path?",
      "That works for big cities, but smaller towns live a completely different reality.",
      "The popular view here has a blind spot nobody is naming.",
    ],
    open: ["Let me take the side nobody wants to take: this sounds good on paper, but I'm not convinced."],
    closing: ["I'll close by saying the popular view has real blind spots, and we should test it before we celebrate it."],
  },
  kabir: {
    leads: ["I think both sides have a point.", "I agree with {last}, and also with the earlier point.", "{last} makes sense to me."],
    points: [
      "Maybe the middle path is best: try it in some places and keep what works.",
      "The risks are real, but so are the benefits.",
      "Can't we combine both ideas instead of choosing one?",
      "A pilot with a clear review date would satisfy both camps.",
    ],
    open: ["I think there are good points on both sides here, so let's hear them all."],
    closing: ["In conclusion, a balanced approach that combines everyone's points is the most sensible way forward."],
  },
};

const HI: Record<PersonaId, Pool> = {
  arjun: {
    leads: ["{last}, sorry but yeh bigger picture miss kar raha hai.", "Nahi {last}, yeh bahut cautious approach hai.", "Dekho {last}, practical baat karte hain."],
    points: [
      "Trend obvious hai, basics pe debate kab tak karenge?",
      "Execution hi sab kuch hai, mera point wahi hai.",
      "Perfect data ka wait karenge toh kabhi move nahi karenge.",
      "Long-term upside clearly short-term pain se bada hai.",
    ],
    open: ["Main start karta hoon. Mera stand clear hai: benefits obviously costs se zyada hain."],
    interject: ["Sorry to cut in, but yeh bilkul galat angle hai."],
    closing: ["To conclude, main apne view pe firm hoon: upside risks se kaafi bada hai, hume abhi act karna chahiye."],
  },
  priya: {
    leads: ["{last}, iska evidence kya hai?", "Yeh bahut broad claim hai, {last}.", "{last} ke point mein ek number add karti hoon:"],
    points: [
      "Ek survey mein sirf ek-tihai firms ko lasting gains mile the.",
      "Abroad ke pilots mein around 60 companies thi, par sab office-based thi.",
      "Services aur manufacturing ka data bilkul different hai.",
      "Data mixed hai, region ke hisaab se lagbhag 50-50.",
    ],
    open: ["Main kuch numbers se start karna chahungi, kyunki is topic pe log data kam aur feelings zyada use karte hain."],
    redirect: ["Topic pe wapas aate hain. Asli sawaal yeh hai ki evidence kya kehta hai."],
    closing: ["Mera conclusion yeh hai ki evidence ek phased approach support karta hai, sector by sector."],
  },
  meera: {
    leads: ["Ek cheez add karun?", "Mujhe lagta hai {last} partly sahi hai."],
    points: [
      "Kisi ne yeh nahi poocha ki cost kaun bear karega.",
      "Jo log sabse zyada affected hain, woh is conversation mein hain hi nahi.",
      "Shayad asli issue trust ka hai, policy ka nahi.",
    ],
    open: ["Shayad pehle define karna chahiye ki success ka matlab kya hoga."],
    closing: ["Mere liye key takeaway yeh hai ki solution un logon ke liye kaam kare jinki koi sunta nahi."],
  },
  rohan: {
    leads: ["Interesting point, {last}.", "Partly agree karta hoon, {last}."],
    points: [
      "Mera cousin Bengaluru mein ek startup mein hai, wahan har mahine kuch naya try karte hain.",
      "Mere college ke ek senior ne internship mein yahi bola tha.",
      "Mere hometown mein log isse bilkul alag tarah se dekhenge.",
    ],
    open: ["Main ek story se start karta hoon, yeh mujhe mere cousin ki yaad dilata hai."],
    drift: [
      "Yeh sunke yaad aaya, mere chacha ki Pune mein ek dukaan hai aur cricket season mein unka business hi badal jaata hai.",
      "Funny baat hai, kal raat maine ek podcast dekha ki Japan mein log office mein naps lete hain.",
    ],
    closing: ["Sum up karun toh, yeh logon pe depend karta hai, aur hume real experiences se seekhna chahiye."],
  },
  ananya: {
    leads: ["Devil's advocate bolun toh, {last},", "Sab log bahut jaldi agree kar rahe hain."],
    points: [
      "kya ho agar ulta sach ho aur cheezein aur kharab ho jaayein?",
      "Is raaste pe actually nuksaan kiska hoga?",
      "Bade shehron mein chalega, par chhote towns ki reality alag hai.",
    ],
    open: ["Main woh side lungi jo koi nahi lena chahta: yeh paper pe accha lagta hai, par main convinced nahi hoon."],
    closing: ["Main close karungi yeh bolke ki popular view mein blind spots hain, pehle test karo phir celebrate karo."],
  },
  kabir: {
    leads: ["Dono sides ka point hai yaar.", "{last} se agree karta hoon, aur pehle wale point se bhi."],
    points: [
      "Shayad middle path best hai: kuch jagah try karo aur jo kaam kare woh rakho.",
      "Risks real hain, par benefits bhi.",
      "Dono ideas combine kyun nahi kar sakte?",
    ],
    open: ["Mujhe lagta hai dono sides ke achhe points hain, toh sabko sunte hain."],
    closing: ["In conclusion, ek balanced approach jo sabke points combine kare, wahi sabse sensible hai."],
  },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function mockTurn(req: TurnRequest): string {
  const pool = (req.config.language === "hinglish" ? HI : EN)[req.speaker];
  const said = new Set(req.transcript.map((u) => u.text));
  const seed = hash(req.transcript.map((u) => u.text).join("|") + req.speaker + req.intent);

  const single: Partial<Record<TurnIntent, string[] | undefined>> = {
    open: pool.open,
    closing: pool.closing,
    interject: pool.interject,
    drift: pool.drift,
    redirect: pool.redirect,
  };
  const fixed = single[req.intent];
  let candidates: string[];
  if (fixed?.length) candidates = fixed.map((l) => fill(l, req));
  else {
    // all lead + point combinations (plus bare points), in a seed-dependent order
    candidates = [];
    for (const p of pool.points) {
      candidates.push(fill(p, req));
      for (const l of pool.leads) candidates.push(fill(`${l} ${p}`, req));
    }
  }
  const fresh = candidates.filter((c) => !said.has(c) && !pointUsed(c, pool, req, said));
  const list = fresh.length ? fresh : candidates;
  const line = list[seed % list.length];
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** True if this line's argument was already used by the same speaker (avoid repeating the core point). */
function pointUsed(line: string, pool: Pool, req: TurnRequest, said: Set<string>): boolean {
  const mine = req.transcript.filter((u) => u.speaker === req.speaker).map((u) => u.text);
  if (!mine.length) return false;
  void said;
  return pool.points.some((p) => {
    const core = fill(p, req);
    return line.endsWith(core) && mine.some((m) => m.endsWith(core));
  });
}

function fill(template: string, req: TurnRequest): string {
  const last = lastOtherSpeaker(req.transcript, req.speaker);
  const student = req.config.studentName.trim() || "you";
  const topic = req.config.topic.replace(/[?.!]+$/, "");
  const lastName = last === "you" ? student : last ? PERSONAS[last as PersonaId].name : "everyone";
  return template
    .replaceAll("{topic}", topic.length > 70 ? "this case" : topic)
    .replaceAll("{last}", lastName)
    .replaceAll("{student}", student);
}

function lastOtherSpeaker(transcript: TurnRequest["transcript"], self: PersonaId): SpeakerId | null {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const s = transcript[i].speaker;
    if (s !== self && s !== "mod") return s;
  }
  return null;
}
