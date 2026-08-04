import { createFileRoute } from "@tanstack/react-router";

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

          // Server-side: OPENAI_API_KEY (developer key, fallback)
          // Personal keys passed from client take priority
          const serverDevKey = process.env.OPENAI_API_KEY;

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
              const messages: Array<{ role: string; content: string }> = [];
              if (system) messages.push({ role: "system", content: system });
              messages.push({ role: "user", content: prompt });

              const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages,
                }),
              });

              if (res.ok) {
                const data = (await res.json()) as {
                  choices?: Array<{ message?: { content?: string } }>;
                };
                const text = data?.choices?.[0]?.message?.content || "(kosong)";
                return Response.json({ text, usedKeyIndex: i });
              }

              const errText = await res.text();
              const errMsg = `OpenAI error ${res.status}: ${errText.slice(0, 200)}`;
              console.error(`[API /api/ai] key #${i} failed:`, errMsg);
              lastErrorMsg = errMsg;

              if (res.status === 429) {
                isRateLimited = true;
              }

              continue;
            } catch (err) {
              const errorMsg =
                err instanceof Error ? err.message || err.name || String(err) : String(err);
              console.error(`[API /api/ai] key #${i} network error:`, errorMsg);
              lastErrorMsg = errorMsg;
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
