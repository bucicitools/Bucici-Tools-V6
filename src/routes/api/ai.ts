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

          // Gather candidate keys:
          // 1. Personal keys passed from client
          // 2. Server process.env.GEMINI_API_KEY
          const serverDevKey =
            process.env.GEMINI_API_KEY ||
            process.env.VITE_GEMINI_API_KEY ||
            (typeof import.meta !== "undefined" && import.meta.env
              ? import.meta.env.VITE_GEMINI_API_KEY
              : undefined);

          const isCandidateValid = (k: unknown): k is string =>
            typeof k === "string" &&
            k.trim().length >= 10 &&
            k.trim() !== "undefined" &&
            k.trim() !== "null";

          const candidateKeys: string[] = [...keys.filter(isCandidateValid).map((k) => k.trim())];

          if (serverDevKey && isCandidateValid(serverDevKey)) {
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
              const errorMsg = err instanceof Error ? err.message : String(err);
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

              // Always continue to try remaining candidate keys regardless of individual key failure
              continue;
            }
          }

          if (isRateLimited) {
            return Response.json(
              {
                error:
                  candidateKeys.length > 1
                    ? "Semua API key AI sedang mencapai limit. Silakan tunggu beberapa menit lalu coba lagi."
                    : "Server AI sedang padat. Masukkan Kunci AI Pribadi di Pengaturan → Kunci AI Pribadi.",
                isQuotaError: true,
              },
              { status: 429 },
            );
          }

          return Response.json(
            {
              error:
                "API Key Gemini tidak valid atau tidak memiliki akses. Silakan masukkan Kunci AI Pribadi di Pengaturan → Kunci AI Pribadi.",
            },
            { status: 400 },
          );
        } catch (err) {
          console.error("[API /api/ai handler error]", err);
          return Response.json(
            { error: `Kesalahan server AI: ${(err as Error).message}` },
            { status: 500 },
          );
        }
      },
    },
  },
});
