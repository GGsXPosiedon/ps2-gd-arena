# ps2-gd-arena

Voice-first AI group discussion practice arena for Technical Hackathon Problem Statement 2.

Practise a campus-placement group discussion (GD) out loud with 3–5 AI participants and an AI moderator, then get a report where every feedback point links to a quoted moment from your discussion.

## Run it

```bash
bun install          # or npm install
cp .env.example .env.local   # add a GEMINI_API_KEY (free) or leave empty for offline mock mode
bun run dev          # http://localhost:3000
```

Use **Chrome or Edge** (live transcription uses the browser's Web Speech API) and **headphones** (otherwise the AIs can hear themselves and stop mid-sentence).

No API key? The app still runs end to end in **mock mode**: the AI participants use scripted lines, the report uses rule-based feedback, and everything else (turn-taking, voices, timer, interruptions, report) works the same.

## What it does

| Area | What it does |
|---|---|
| Setup | Topic list (4 categories) or custom topic; 3–5 AI personas with distinct personalities and voices; English or Hinglish; 3/6/10/15 min; AI patience slider; captions toggle |
| Mic check | Level meter, live transcription test, headphones tip, voice preview; mic denied → continue by typing |
| Live room | Discord-style voice room. Moderator brief → open floor → timed discussion → closing round. AIs wait for pauses, never talk over each other, reply to each other by name, stop when you talk over them; the dominator sometimes cuts you off (hold the floor to make him yield). Raise hand, live captions, transcript, typing |
| Resilience | Offline → session pauses and resumes; failed AI call → retry, another participant, then the moderator fills in; no voices / TTS failure → captions only |
| Report | Readiness score, biggest opportunity, six criteria (starting the discussion, quality of ideas, building on others, listening, handling interruptions, ending strongly) with quoted, timestamped evidence you can jump to and replay; who spoke when; numbers against healthy ranges; missed openings with "what you could have said" |

## How it works

All audio handling runs in the browser; the server only holds API keys.

- `src/lib/engine.ts`: the floor manager (phases, timer, who speaks next, barge-in, interjections, prefetching the next AI line while the current one plays, failure fallbacks)
- `src/lib/audio/`: microphone + voice activity detection (`mic.ts`), Web Speech transcription (`stt.ts`), one voice per seat (`tts.ts`), session recording (`recorder.ts`)
- `src/app/api/turn`: generates one participant's line (persona prompt in `src/lib/server/prompts.ts`)
- `src/app/api/report`: LLM feedback that must cite utterance ids; quotes are verified against the transcript (`src/lib/server/report.ts`); rule-based fallback if the LLM is unavailable
- `src/lib/metrics.ts`: deterministic numbers (talk share, interruptions, entry time, fillers, pace)

Sessions are stored in your browser (localStorage; mic recording in IndexedDB).

## Tests

```bash
bun run test:e2e     # Playwright, mock AI, typing mode; runs a full GD to the report
```

Demo without a mic: open `/?e2e=1`. This runs a fast 40-second session with silent captions and typed input.
