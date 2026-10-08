// Offline mock: plausible persona lines without any LLM. Used when no API key is set and in e2e tests.
import { PERSONAS } from "../personas";
import type { PersonaId, SpeakerId, TurnIntent, TurnRequest } from "../types";

type Pool = Partial<Record<TurnIntent, string[]>>;

const EN: Record<PersonaId, Pool> = {
  arjun: {
    open: [
      "Let me start. On {topic}, my position is clear: the benefits obviously outweigh the costs, and anyone who has looked at it seriously will agree.",
    ],
    respond: [
      "{last}, with respect, that misses the bigger picture. The trend is obvious and we can't keep debating the basics.",
      "Clearly the strongest argument here is long-term impact. Short-term pain is just the price of progress.",
      "I'll say it again because it matters: execution is everything, and that's exactly where my point stands.",
      "No, {last}, that's too cautious. If we wait for perfect data we will never move.",
    ],
    interject: ["Sorry to cut in, but that's exactly the wrong way to look at it."],
    closing: ["To conclude, I stand firmly by my view: the upside is far bigger than the risks, and we should act now."],
  },
  priya: {
    open: ["I'd like to begin with some numbers, because {topic} is often argued on feelings rather than data."],
    respond: [
      "{last}, do we have evidence for that? One survey I read found barely a third of firms saw lasting gains.",
      "Look at the pilots abroad: around 60 companies took part and most kept the change, but almost all were office-based.",
      "I'd want to separate the sectors here. The numbers for services and manufacturing tell very different stories.",
      "That's a sweeping claim, {last}. The data I've seen is mixed, roughly a 50-50 split depending on the region.",
    ],
    redirect: ["Coming back to the topic, the real question is what the data says about {topic}, not individual stories."],
    closing: ["My conclusion is that the evidence supports a phased approach, tested sector by sector, rather than one rule for all."],
  },
  meera: {
    open: ["Maybe we should first define what success would look like here."],
    respond: [
      "I think {last} and others are both right, but nobody has talked about who bears the cost.",
      "Can I add one thing? The people most affected aren't in this conversation at all.",
      "Perhaps the real issue is trust, not policy.",
    ],
    closing: ["For me, the key takeaway is that any answer must work for the people with the least say."],
  },
  rohan: {
    open: ["I'll start with a story, because this reminds me of something that happened to my cousin."],
    respond: [
      "That's interesting, {last}. My cousin works at a startup in Bengaluru and honestly they try something new every month.",
      "I agree partly. Actually, a senior from my college said something similar during his internship.",
      "Good point. It's like the time our college fest changed its schedule and everybody adapted within a week.",
    ],
    drift: [
      "This reminds me, my uncle runs a small shop in Pune and he was telling me how cricket season completely changes his business.",
      "Funny thing, I was watching a podcast last night about how people in Japan take naps at work. Totally changed how I think about rest.",
    ],
    closing: ["To sum up, I think it depends on the people involved, and we should learn from real experiences."],
  },
  ananya: {
    open: ["Let me take the side nobody wants to take: {topic} sounds good on paper, but I'm not convinced."],
    respond: [
      "Let me play devil's advocate, {last}. What if the opposite is true and this makes things worse?",
      "Everyone seems to be agreeing too quickly. Who actually loses if we go down this path?",
      "{last}, that works for big cities, but what about smaller towns where the reality is completely different?",
    ],
    closing: ["I'll close by saying the popular view has real blind spots, and we should test it before we celebrate it."],
  },
  kabir: {
    open: ["I think there are good points on both sides of {topic}, so let's hear them all."],
    respond: [
      "I think both sides have a point. {last} is right about the risks, but the benefits are real too.",
      "Maybe the middle path is best here: try it in some places and keep what works.",
      "I agree with {last}, and also with the earlier point. Can't we combine both ideas?",
    ],
    closing: ["In conclusion, a balanced approach that combines everyone's points is the most sensible way forward."],
  },
};

const HI: Record<PersonaId, Pool> = {
  arjun: {
    open: ["Main start karta hoon. {topic} pe mera stand clear hai: benefits obviously costs se zyada hain."],
    respond: [
      "{last}, sorry but yeh bigger picture miss kar raha hai. Trend obvious hai, basics pe debate kab tak karenge?",
      "Dekho, clearly sabse strong argument long-term impact ka hai. Short-term pain toh hoga hi.",
      "Main phir se bolunga kyunki yeh important hai: execution hi sab kuch hai.",
    ],
    interject: ["Sorry to cut in, but yeh bilkul galat angle hai."],
    closing: ["To conclude, main apne view pe firm hoon: upside risks se kaafi bada hai, hume abhi act karna chahiye."],
  },
  priya: {
    open: ["Main kuch numbers se start karna chahungi, kyunki {topic} pe log data kam aur feelings zyada use karte hain."],
    respond: [
      "{last}, iska evidence kya hai? Ek survey mein sirf ek-tihai firms ko lasting gains mile the.",
      "Abroad ke pilots dekho: around 60 companies thi aur zyada tar ne continue kiya, par sab office-based thi.",
      "Mujhe lagta hai sectors ko alag karke dekhna padega. Services aur manufacturing ka data bilkul different hai.",
    ],
    redirect: ["Topic pe wapas aate hain. Asli sawaal yeh hai ki {topic} pe data kya kehta hai."],
    closing: ["Mera conclusion yeh hai ki evidence ek phased approach support karta hai, sector by sector."],
  },
  meera: {
    open: ["Shayad pehle define karna chahiye ki success ka matlab kya hoga."],
    respond: [
      "Mujhe lagta hai {last} sahi hai, par kisi ne yeh nahi poocha ki cost kaun bear karega.",
      "Ek cheez add karun? Jo log sabse zyada affected hain, woh is conversation mein hain hi nahi.",
    ],
    closing: ["Mere liye key takeaway yeh hai ki solution un logon ke liye kaam kare jinki koi sunta nahi."],
  },
  rohan: {
    open: ["Main ek story se start karta hoon, yeh mujhe mere cousin ki yaad dilata hai."],
    respond: [
      "Interesting point, {last}. Mera cousin Bengaluru mein ek startup mein hai, wahan har mahine kuch naya try karte hain.",
      "Partly agree karta hoon. Actually mere college ke ek senior ne internship mein yahi bola tha.",
    ],
    drift: [
      "Yeh sunke yaad aaya, mere chacha ki Pune mein ek dukaan hai aur cricket season mein unka business hi badal jaata hai.",
      "Funny baat hai, kal raat maine ek podcast dekha ki Japan mein log office mein naps lete hain. Bada interesting tha.",
    ],
    closing: ["Sum up karun toh, yeh logon pe depend karta hai, aur hume real experiences se seekhna chahiye."],
  },
  ananya: {
    open: ["Main woh side lungi jo koi nahi lena chahta: {topic} paper pe accha lagta hai, par main convinced nahi hoon."],
    respond: [
      "Devil's advocate bolun toh, {last}, kya ho agar ulta sach ho aur cheezein aur kharab ho jaayein?",
      "Sab log bahut jaldi agree kar rahe hain. Is raaste pe actually nuksaan kiska hoga?",
    ],
    closing: ["Main close karungi yeh bolke ki popular view mein blind spots hain, pehle test karo phir celebrate karo."],
  },
  kabir: {
    open: ["Mujhe lagta hai {topic} pe dono sides ke achhe points hain, toh sabko sunte hain."],
    respond: [
      "Dono sides ka point hai yaar. {last} risks ke baare mein sahi hai, par benefits bhi real hain.",
      "Shayad middle path best hai: kuch jagah try karo aur jo kaam kare woh rakho.",
    ],
    closing: ["In conclusion, ek balanced approach jo sabke points combine kare, wahi sabse sensible hai."],
  },
};

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

export function mockTurn(req: TurnRequest): string {
  const pools = req.config.language === "hinglish" ? HI : EN;
  const pool = pools[req.speaker];
  const lines = pool[req.intent] ?? pool.respond ?? [];
  // prefer a line this speaker hasn't used yet
  const said = new Set(req.transcript.filter((u) => u.speaker === req.speaker).map((u) => u.text));
  const seed = req.transcript.length + req.speaker.length;
  const fresh = lines.filter((l) => !said.has(fill(l, req)));
  const line = pick(fresh.length ? fresh : lines, seed);
  return fill(line, req);
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
