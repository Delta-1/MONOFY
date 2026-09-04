import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const image = String(body?.image ?? "");
    const mime = String(body?.mime ?? "image/png");
    const instruction = String(body?.instruction ?? "");
    const apiKey = String(body?.apiKey ?? "").trim();
    if (!image || !instruction.trim()) return json({ error: "Parâmetros inválidos" }, 400);
    if (image.length > 14000000) return json({ error: "Imagem muito grande" }, 413);
    if (!/^image\/(png|jpeg|webp)$/.test(mime)) return json({ error: "Formato de imagem inválido" }, 400);
    if (!apiKey) return json({ error: "Chave do Gemini não informada" }, 400);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { inline_data: { mime_type: mime, data: image } },
            { text: instruction },
          ] }],
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Erro da IA (HTTP ${res.status})`);
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const result = parts.find((part: { inlineData?: { data?: string } }) => part?.inlineData?.data);
    if (!result) throw new Error("A IA não retornou imagem.");
    return json({ image: result.inlineData.data, mime: result.inlineData.mimeType || "image/png" });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro ao processar a imagem." }, 500);
  }
});
