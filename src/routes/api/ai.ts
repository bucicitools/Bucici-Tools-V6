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

          // Bug fix #5: Use only process.env.GEMINI_API_KEY on the server.
          // import.meta.env.VITE_* is NOT available in server context (TanStack Start SSR).
          const serverDevKey = process.env.GEMINI_API_KEY;

          const isCandidateValid = (k: unknown): k is string =>
            typeof k === "string" &&
            k.trim().length >= 10 &&
            k.trim() !== "undefined" &&
            k.trim() !== "null";

          const candidateKeys: string[] = [
            ...keys.filter(isCandidateValid).map((k) => k.trim()),
          ];

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
          let isKeyRejected = false;

          for (let i = 0; i < candidateKeys.length; i++) {
            const apiKey = candidateKeys[i];
            try {
              // Bug fix #1: Removed httpOptions.headers["User-Agent"] = "aistudio-build".
              // That header spoofed Google's internal tooling identity and could cause
              // requests to be blocked or rejected by Google's abuse detection.
              const ai = new GoogleGenAI({ apiKey });

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

              // Bug fix #3: detect key rejection (400/403) for informative error message
              if (
                lower.includes("400") ||
                lower.includes("403") ||
                lower.includes("api_key") ||
                lower.includes("invalid") ||
                lower.includes("permission")
              ) {
                isKeyRejected = true;
              }

              // Always continue to try remaining candidate keys
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

          // Bug fix #3: informative error when key is rejected by Google
          if (isKeyRejected) {
            return Response.json(
              {
                error:
                  "API Key ditolak Google. Pastikan key Anda format baru (AQ...) dari Google AI Studio dan sudah di-restrict ke Generative Language API. Cek Pengaturan → Kunci AI Pribadi.",
              },
              { status: 403 },
            );
          }

          return Response.json(
            {
              error:
                lastErrorMsg ||
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
