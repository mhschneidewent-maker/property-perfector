// Enhance a real estate photo using Lovable AI image editing (Nano Banana).
// Reads the user's original from the `photos` storage bucket, runs the prompt,
// writes the enhanced result back to storage, and updates the project row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ENHANCEMENT_PROMPTS: Record<string, string> = {
  twilight:
    "Transform this real estate photo into a stunning twilight/dusk shot. Replace the sky with a dramatic deep blue and warm orange dusk sky with subtle clouds. Add warm golden glowing lights inside every visible window. Add soft accent landscape lighting illuminating the home's architecture and pathways. Keep the building geometry, materials, and composition exactly the same. Photoreal, MLS-ready, no artifacts.",
  sky_replace:
    "Replace the sky in this real estate photo with a vibrant, clean blue sky featuring soft, photoreal cumulus clouds. Match the scene's existing lighting and reflections. Keep everything else identical. Photoreal, professional real estate photography quality.",
  green_grass:
    "Make the lawn lush, vibrant, healthy green. Remove any brown patches, dead spots, leaves, or weeds. Keep grass texture realistic. Do not change anything else in the photo. Photoreal MLS quality.",
  declutter:
    "Remove personal clutter and distracting items from this room: papers, cords, small personal items, magnets, family photos, branded products, trash bins, pet items, and visual noise. Keep all furniture, decor, and architecture exactly as is. Make the space feel clean, neutral, and listing-ready. Photoreal.",
  virtual_stage:
    "Virtually stage this empty room with tasteful, modern, neutral furniture appropriate for a high-end real estate listing. Add a sofa, area rug, coffee table, accent chair, side table with lamp, and artwork on walls — only what fits naturally. Match perspective, scale, and existing lighting. Photoreal, MLS-ready.",
  brighten:
    "Professionally brighten and color-correct this real estate photo. Lift shadows, balance window exposure (HDR-style), warm up cool casts, increase clarity, and make the space feel airy and inviting. Keep it photoreal, no over-saturation.",
  remove_cars:
    "Remove all vehicles, trash bins, hoses, and street clutter from this exterior real estate photo. Cleanly fill in the driveway, street, and surroundings to look natural. Photoreal.",
  fireplace_on:
    "Light the fireplace with a warm, realistic fire and a soft glow on the hearth. Keep everything else exactly the same. Photoreal.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    // Auth-bound client to verify the user
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const { projectId } = body ?? {};
    if (!projectId || typeof projectId !== "string") {
      return json({ error: "projectId required" }, 400);
    }

    // Service-role client for storage + DB updates (RLS bypass; we still scope by user)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: project, error: pErr } = await admin
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr || !project) return json({ error: "Project not found" }, 404);

    const prompt = ENHANCEMENT_PROMPTS[project.enhancement_type];
    if (!prompt) return json({ error: "Unknown enhancement type" }, 400);

    await admin.from("projects").update({ status: "processing", error_message: null }).eq("id", projectId);

    // Download original
    const { data: blob, error: dlErr } = await admin.storage.from("photos").download(project.original_path);
    if (dlErr || !blob) {
      await admin.from("projects").update({ status: "failed", error_message: "Failed to read original" }).eq("id", projectId);
      return json({ error: "Failed to download original" }, 500);
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    const mime = blob.type || "image/jpeg";
    const b64 = base64Encode(buf);
    const dataUrl = `data:${mime};base64,${b64}`;

    // Call Lovable AI image editing (Nano Banana 2 / Gemini 3.1 flash image)
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      const status = aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 500;
      const msg =
        aiRes.status === 429
          ? "AI is rate-limited right now. Please try again in a moment."
          : aiRes.status === 402
          ? "AI usage credits exhausted. Please add credits in Settings → Workspace → Usage."
          : `AI error: ${txt.slice(0, 200)}`;
      await admin.from("projects").update({ status: "failed", error_message: msg }).eq("id", projectId);
      return json({ error: msg }, status);
    }

    const aiJson = await aiRes.json();
    const outUrl: string | undefined = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!outUrl || !outUrl.startsWith("data:")) {
      await admin.from("projects").update({ status: "failed", error_message: "No image returned" }).eq("id", projectId);
      return json({ error: "No image returned from AI" }, 500);
    }

    const [meta, payload] = outUrl.split(",");
    const outMime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
    const outBytes = base64Decode(payload);
    const ext = outMime.includes("png") ? "png" : "jpg";
    const enhancedPath = `${userId}/enhanced/${projectId}.${ext}`;

    const { error: upErr } = await admin.storage
      .from("photos")
      .upload(enhancedPath, outBytes, { contentType: outMime, upsert: true });
    if (upErr) {
      await admin.from("projects").update({ status: "failed", error_message: `Upload failed: ${upErr.message}` }).eq("id", projectId);
      return json({ error: upErr.message }, 500);
    }

    await admin
      .from("projects")
      .update({ status: "done", enhanced_path: enhancedPath, error_message: null })
      .eq("id", projectId);

    return json({ ok: true, enhanced_path: enhancedPath });
  } catch (e) {
    console.error("enhance-photo error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
