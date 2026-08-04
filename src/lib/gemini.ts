// AI client — OpenAI backend with Hybrid BYOK + Developer Key Fallback
//
// Key priority order:
//   1. User's personal OpenAI keys from localStorage (bucici_ai_key_1/_2/_3)
//   2. VITE_OPENAI_API_KEY from client env (direct REST fallback)
//
// All calls are proxied through /api/ai server endpoint (uses OPENAI_API_KEY server-side).
// Direct REST fallback to OpenAI API if server proxy fails.

import { currentUser } from "@/lib/store";

// Keep slot names generic so localStorage data persists across migrations
export const GEMINI_KEY_SLOTS = [
  "bucici_gemini_key_1",
  "bucici_gemini_key_2",
  "bucici_gemini_key_3",
] as const;
const LS_KEY_LEGACY = "bucici_gemini_key";

// ─── Key management ───────────────────────────────────────────────────────────

/** Returns all personal keys saved by the user (localStorage). */
export function getPersonalKeys(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (const slot of GEMINI_KEY_SLOTS) {
    const k = localStorage.getItem(slot)?.trim();
    if (k) keys.push(k);
  }
  if (keys.length === 0) {
    const legacy = localStorage.getItem(LS_KEY_LEGACY)?.trim();
    if (legacy) keys.push(legacy);
    const me = currentUser();
    if (!legacy && me?.geminiApiKey?.trim()) keys.push(me.geminiApiKey.trim());
  }
  return keys;
}

/** Client-side dev key — only VITE_OPENAI_API_KEY is available in browser bundle. */
function getDevKey(): string | undefined {
  const envKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  return envKey?.trim() || undefined;
}

/**
 * Returns all available keys in priority order:
 * personal keys first, then dev key as final fallback.
 */
export function getAllGeminiKeys(): Array<{ key: string; isPersonal: boolean }> {
  const result: Array<{ key: string; isPersonal: boolean }> = [];
  for (const k of getPersonalKeys()) {
    result.push({ key: k, isPersonal: true });
  }
  const dev = getDevKey();
  if (dev) result.push({ key: dev, isPersonal: false });
  return result;
}

/** Returns the primary key (for UI checks). */
export function getGeminiKey(): string | undefined {
  return getAllGeminiKeys()[0]?.key;
}

export function hasPersonalKey(): boolean {
  return getPersonalKeys().length > 0;
}

export function saveGeminiKeySlot(slot: 1 | 2 | 3, key: string): void {
  if (typeof window === "undefined") return;
  const lsKey = `bucici_gemini_key_${slot}`;
  if (key.trim()) localStorage.setItem(lsKey, key.trim());
  else localStorage.removeItem(lsKey);
}

export function readGeminiKeySlot(slot: 1 | 2 | 3): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`bucici_gemini_key_${slot}`) ?? "";
}

export function saveGeminiKeyLocal(key: string): void {
  if (typeof window === "undefined") return;
  if (key.trim()) {
    localStorage.setItem(LS_KEY_LEGACY, key.trim());
    localStorage.setItem(GEMINI_KEY_SLOTS[0], key.trim());
  } else {
    localStorage.removeItem(LS_KEY_LEGACY);
    localStorage.removeItem(GEMINI_KEY_SLOTS[0]);
  }
}

export function readGeminiKeyLocal(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(GEMINI_KEY_SLOTS[0]) ?? localStorage.getItem(LS_KEY_LEGACY) ?? "";
}

// ─── Special error types ──────────────────────────────────────────────────────

export class GeminiQuotaExhaustedError extends Error {
  readonly isPersonalKey: boolean;
  constructor(isPersonalKey: boolean) {
    super(
      isPersonalKey
        ? "Semua API key AI telah mencapai limit. Silakan tunggu beberapa menit lalu coba lagi."
        : "Server AI sedang padat. Masukkan API key pribadi di Pengaturan → Kunci AI Pribadi untuk tetap bisa generate.",
    );
    this.name = "GeminiQuotaExhaustedError";
    this.isPersonalKey = isPersonalKey;
  }
}

// ─── Direct REST Fallback (OpenAI) ────────────────────────────────────────────

async function askOpenAIDirectRest(prompt: string, system?: string): Promise<string> {
  const keys = getAllGeminiKeys();
  if (keys.length === 0) {
    throw new Error("Tidak ada API key yang dikonfigurasi.");
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  let lastError: Error | null = null;

  for (let i = 0; i < keys.length; i++) {
    const { key, isPersonal } = keys[i];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages }),
    });

    if (res.status === 429) {
      if (i < keys.length - 1) continue;
      throw new GeminiQuotaExhaustedError(isPersonal);
    }

    if (!res.ok) {
      const t = await res.text();
      lastError = new Error(`OpenAI error ${res.status}: ${t.slice(0, 200)}`);
      continue;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data?.choices?.[0]?.message?.content ?? "";
    return text || "(kosong)";
  }

  throw lastError ?? new Error("Gagal menghubungi AI. Coba lagi.");
}

// ─── Main askGemini (kept same name for compatibility) ────────────────────────

export async function askGemini(prompt: string, system?: string): Promise<string> {
  const personalKeys = getPersonalKeys();

  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, system, keys: personalKeys }),
    });

    if (res.ok) {
      const data = (await res.json()) as { text?: string };
      return data.text || "(kosong)";
    }

    const errData = (await res.json().catch(() => ({}))) as {
      error?: string;
      isQuotaError?: boolean;
    };

    if (res.status === 429 || errData.isQuotaError) {
      throw new GeminiQuotaExhaustedError(hasPersonalKey());
    }

    if (errData.error) {
      throw new Error(errData.error);
    }
  } catch (err) {
    if (err instanceof GeminiQuotaExhaustedError) throw err;
    console.warn("[askGemini] Server proxy failed, attempting direct REST fallback:", err);
    try {
      return await askOpenAIDirectRest(prompt, system);
    } catch (fallbackErr) {
      if (fallbackErr instanceof GeminiQuotaExhaustedError) throw fallbackErr;
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error("Gagal menghubungi AI. Silakan coba lagi.");
}
