import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI } from "@google/genai";

export const Route = createFileRoute("/api/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            prompt: string;
            system?: string;
            keys?: string[];
          };

          const { prompt, system, keys = [] } = body;

          if (!prompt || typeof prompt !== "string") {
            return Response.json({ error: "Prompt wajib diisi." }, { status: 400 });
          }

          // Server-side only: process.env.GEMINI_API_KEY
          // import.meta.env.VITE_* is NOT available in server context (TanStack Start SSR)
          const serverDevKey = process.env.GEMINI_API_KEY;

          const candidateKeys: string[] = [
            ...keys.filter((k) => typeof k === "string" && k.trim().length > 0).map((k) => k.trim()),
          ];

          if (serverDevKey && typeof serverDevKey === "string" && serverDevKey.trim()) {
            candidateKeys.push(serverDevKey.trim());
          }

          if (candidateKeys.length === 0) {
            return Response.json(
              {
                error:
                  "Fitur AI belum dikonfigurasi. Masukkan Kunci AI Pribadi di Pengaturan → Kunci AI Pribadi.",
              },
              { status: 400 },
            );
          }

          let lastErrorMsg = "";
          let isRateLimited = false;

          for (let i = 0; i < candidateKeys.length; i++) {
            const apiKey = candidateKeys[i];
            try {
              // User-Agent "aistudio-build" is required for AQ. format keys issued by Google AI Studio.
              // Without this header, Google rejects AQ keys with ACCESS_TOKEN_TYPE_UNSUPPORTED.
              const ai = new GoogleGenAI({
                apiKey,
                httpOptions: {
                  headers: {
                    "User-Agent": "aistudio-build",
                  },
                },
              });

              const response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                ...(system ? { config: { systemInstruction: system } } : {}),
              });

              const text = response.text || "(kosong)";
              return Response.json({ text, usedKeyIndex: i });
            } catch (err) {
              const errorMsg =
                err instanceof Error
                  ? err.message || err.name || String(err)
                  : String(err);
              console.error(`[API /api/ai] key #${i} failed:`, errorMsg);
              lastErrorMsg = errorMsg;

              const lower = errorMsg.toLowerCase();
              if (
                lower.includes("429") ||
                lower.includes("quota") ||
                lower.includes("rate limit") ||
                lower.includes("resource_exhausted")
              ) {
                isRateLimited = true;
              }

              // Always try next key regardless of error type
              continue;
            }
          }

          if (isRateLimited) {
            return Response.json(
              {
                error:
                  candidateKeys.length > 1
                    ? "Semua API key AI sedang mencapai limit. Silakan tunggu beberapa menit lalu coba lagi."
                    : "Server AI sedang padat. Masukkan Kunci AI Pribadi di Pengaturan → Kunci AI Pribadi untuk tetap bisa generate.",
                isQuotaError: true,
              },
              { status: 429 },
            );
          }

          return Response.json(
            { error: lastErrorMsg || "Gagal menghubungi AI. Coba lagi." },
            { status: 500 },
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message || String(err) : String(err);
          console.error("[API /api/ai handler error]", msg);
          return Response.json(
            { error: `Kesalahan server AI: ${msg}` },
            { status: 500 },
          );
        }
      },
    },
  },
});
