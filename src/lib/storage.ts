// Client-side persistence. Sessions live in localStorage; the student's mic recording lives in IndexedDB.
import type { RoomConfig, SessionRecord } from "./types";
import { DEFAULT_PANEL } from "./personas";
import { TOPICS } from "./topics";

const CONFIG_KEY = "floor:config";
const SESSIONS_KEY = "floor:sessions"; // string[] of ids, newest first
const sessionKey = (id: string) => `floor:session:${id}`;

export const DEFAULT_CONFIG: RoomConfig = {
  topic: TOPICS[0].title,
  topicCategory: TOPICS[0].category,
  personas: DEFAULT_PANEL[4],
  language: "english",
  durationMin: 10,
  patienceMs: 1200,
  captions: true,
  studentName: "",
};

export function loadConfig(): RoomConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** True once the student has entered a room at least once (a config was saved). */
export function hasSavedConfig(): boolean {
  try {
    return !!localStorage.getItem(CONFIG_KEY);
  } catch {
    return false;
  }
}

export function saveConfig(config: RoomConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function saveSession(s: SessionRecord) {
  localStorage.setItem(sessionKey(s.id), JSON.stringify(s));
  const ids = listSessionIds().filter((x) => x !== s.id);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([s.id, ...ids].slice(0, 50)));
}

export function loadSession(id: string): SessionRecord | null {
  try {
    const raw = localStorage.getItem(sessionKey(id));
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  } catch {
    return null;
  }
}

export function listSessionIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function listSessions(): SessionRecord[] {
  return listSessionIds()
    .map(loadSession)
    .filter((s): s is SessionRecord => !!s);
}

export function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---- audio (IndexedDB) ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("floor", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("audio");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudio(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("audio", "readwrite");
    tx.objectStore("audio").put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAudio(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const req = db.transaction("audio").objectStore("audio").get(id);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
