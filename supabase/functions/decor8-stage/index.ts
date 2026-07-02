// Virtual staging via Decor8 AI with automatic fallback to Lovable AI image editing.
// Reads the user's original from the `photos` storage bucket, requests N variations
// from Decor8 (style + room_type + custom prompt), uploads each result to storage,
// inserts rows into `staging_results`, and updates the project status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map UI keys to Decor8 design_style values
const STYLE_MAP: Record<string, string> = {
  modern: "modern",
  scandinavian: "scandinavian",
  midcentury: "midcenturymodern",
  farmhouse: "farmhouse",
  luxury: "luxury",
  industrial: "industrial",
  coastal: "coastal",
  minimalist: "minimalist",
};

const ROOM_MAP: Record<string, string> = {
  living: "livingroom",
  bedroom: "bedroom",
  kitchen: "kitchen",
  dining: "diningroom",
  office: "homeoffice",
  bathroom: "bathroom",
  kids: "kidsroom",
  outdoor: "outdoor",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const DECOR8_API_KEY = Deno.env.get("DECOR8_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { projectId } = body ?? {};
    if (!projectId || typeof projectId !== "string") {
      return json({ error: "projectId required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: project, error: pErr } = await admin
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr || !project) return json({ error: "Project not found" }, 404);

    const numVariations = Math.max(1, Math.min(4, project.num_variations ?? 1));
    const styleKey = (project.style ?? "modern").toLowerCase();
    const roomKey = (project.room_type ?? "living").toLowerCase();
    const userPrompt: string = project.prompt ?? "";

    // Clear previous results for re-runs
    await admin.from("staging_results").delete().eq("project_id", projectId);
    await admin
      .from("projects")
      .update({ status: "processing", error_message: null, enhanced_path: null })
      .eq("id", projectId);

    // Get a public-ish signed URL for the original (Decor8 needs to fetch it)
    const { data: signed, error: signErr } = await admin.storage
      .from("photos")
      .createSignedUrl(project.original_path, 60 * 30);
    if (signErr || !signed?.signedUrl) {
      await admin.from("projects").update({ status: "failed", error_message: "Could not read original image" }).eq("id", projectId);
      return json({ error: "Could not sign original" }, 500);
    }
    const inputUrl = signed.signedUrl;

    let savedCount = 0;
    let lastError = "";

    // ---- Try Decor8 first ----
    // Decor8's /generate_designs_for_room returns 1 image per call regardless of
    // `num_images`, so we call it N times in parallel to get all variations.
    if (DECOR8_API_KEY) {
      try {
        const decor8Style = STYLE_MAP[styleKey] ?? "modern";
        const decor8Room = ROOM_MAP[roomKey] ?? "livingroom";

        const isRemodel =
          project.enhancement_type === "kitchen_remodel" ||
          project.enhancement_type === "bathroom_remodel";

        const remodelHint = isRemodel
          ? `Full ${project.enhancement_type === "kitchen_remodel" ? "kitchen" : "bathroom"} remodel: replace dated finishes, cabinetry/vanity, countertops, tile, fixtures, and lighting in a ${decor8Style} style. Preserve room layout and perspective.`
          : "";
        const combinedPrompt = [remodelHint, userPrompt.trim()].filter(Boolean).join(" ");

        const callDecor8 = async (attempt: number): Promise<string | null> => {
          const payload: Record<string, unknown> = {
            input_image_url: inputUrl,
            room_type: decor8Room,
            design_style: decor8Style,
            num_images: 1,
            num_captions: 0,
            keep_original_dimensions: false,
          };
          if (combinedPrompt) payload.prompt = combinedPrompt;
          console.log(`[decor8] call #${attempt} payload:`, JSON.stringify(payload));
          const res = await fetch("https://api.decor8.ai/generate_designs_for_room", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${DECOR8_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          const text = await res.text();
          if (!res.ok) {
            lastError = `Decor8 ${res.status}: ${text.slice(0, 300)}`;
            console.error(`[decor8] call #${attempt} failed:`, lastError);
            return null;
          }
          let j: any = {};
          try { j = JSON.parse(text); } catch { console.error(`[decor8] non-JSON response #${attempt}:`, text.slice(0, 300)); }
          const images: any[] = j?.info?.images ?? j?.images ?? j?.output?.images ?? [];
          console.log(`[decor8] call #${attempt} returned ${images.length} image(s)`);
          const first = images[0];
          const url: string | undefined = first?.url ?? first?.image_url ?? first;
          return typeof url === "string" ? url : null;
        };

        // Run sequentially to avoid Decor8 rate-limit / concurrency issues.
        const urls: (string | null)[] = [];
        for (let i = 0; i < numVariations; i++) {
          try {
            urls.push(await callDecor8(i + 1));
          } catch (e) {
            lastError = e instanceof Error ? e.message : "Decor8 call failed";
            console.error(`[decor8] call #${i + 1} threw:`, lastError);
            urls.push(null);
          }
        }
        console.log(`[decor8] collected ${urls.filter(Boolean).length}/${numVariations} URLs`);


        let idx = 0;
        for (const url of urls) {
          if (!url) continue;
          try {
            const imgRes = await fetch(url);
            if (!imgRes.ok) continue;
            const bytes = new Uint8Array(await imgRes.arrayBuffer());
            const ct = imgRes.headers.get("content-type") || "image/jpeg";
            const ext = ct.includes("png") ? "png" : "jpg";
            const path = `${userId}/staging/${projectId}/decor8_${idx}.${ext}`;
            const upErr = await uploadToPhotosWithRetry(admin, path, bytes, ct, `decor8 variation #${idx + 1}`);
            if (upErr) { lastError = upErr.message; continue; }
            await admin.from("staging_results").insert({
              project_id: projectId,
              user_id: userId,
              image_path: path,
              variation_index: idx,
              provider: "decor8",
            });
            if (idx === 0) {
              await admin.from("projects").update({ enhanced_path: path }).eq("id", projectId);
            }
            savedCount++;
            idx++;
          } catch (e) {
            lastError = e instanceof Error ? e.message : "image fetch failed";
          }
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Decor8 call failed";
      }
    } else {
      lastError = "DECOR8_API_KEY not configured";
    }

    // ---- Fallback: Lovable AI fills any missing variations ----
    if (savedCount < numVariations) {
      if (!LOVABLE_API_KEY) {
        await admin
          .from("projects")
          .update({ status: "failed", error_message: lastError || "Staging failed" })
          .eq("id", projectId);
        return json({ error: lastError || "Staging failed" }, 500);
      }

      const blob = await admin.storage.from("photos").download(project.original_path);
      if (blob.error || !blob.data) {
        await admin.from("projects").update({ status: "failed", error_message: "Could not read original" }).eq("id", projectId);
        return json({ error: "fallback download failed" }, 500);
      }
      const buf = new Uint8Array(await blob.data.arrayBuffer());
      const dataUrl = `data:${blob.data.type || "image/jpeg"};base64,${b64encode(buf)}`;

      const usedIndexes = await getUsedVariationIndexes(admin, projectId);
      const missingIndexes: number[] = [];
      for (let i = 0; i < numVariations; i++) {
        if (!usedIndexes.has(i)) missingIndexes.push(i);
      }

      const fallbackResults = await Promise.all(
        missingIndexes.map((variationIndex) =>
          generateFallbackVariation({
            admin,
            lovableApiKey: LOVABLE_API_KEY,
            dataUrl,
            styleKey,
            roomKey,
            userPrompt,
            enhancementType: project.enhancement_type,
            userId,
            projectId,
            variationIndex,
          })
        )
      );

      for (const result of fallbackResults) {
        if (result.ok) {
          savedCount++;
          if (result.variationIndex === 0) {
            await admin.from("projects").update({ enhanced_path: result.path }).eq("id", projectId);
          }
        } else {
          lastError = result.error;
          console.error(`[lovable-fallback] variation #${result.variationIndex + 1} failed:`, result.error);
        }
      }

      if (savedCount === 0) {
        await admin.from("projects").update({ status: "failed", error_message: lastError || "No image returned" }).eq("id", projectId);
        return json({ error: lastError || "no image" }, 500);
      }
    }

    const finalCount = await countStagingResults(admin, projectId);
    if (finalCount === 0) {
      await admin.from("projects").update({ status: "failed", error_message: lastError || "No image returned" }).eq("id", projectId);
      return json({ error: lastError || "no image" }, 500);
    }

    await ensureEnhancedPath(admin, projectId);

    await admin
      .from("projects")
      .update({
        status: "done",
        error_message: finalCount < numVariations ? `Generated ${finalCount} of ${numVariations} variations` : null,
      })
      .eq("id", projectId);

    return json({ ok: true, count: finalCount, requested: numVariations });
  } catch (e) {
    console.error("decor8-stage error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function generateFallbackVariation(params: {
  admin: any;
  lovableApiKey: string;
  dataUrl: string;
  styleKey: string;
  roomKey: string;
  userPrompt: string;
  enhancementType?: string;
  userId: string;
  projectId: string;
  variationIndex: number;
}): Promise<{ ok: true; variationIndex: number; path: string } | { ok: false; variationIndex: number; error: string }> {
  const {
    admin,
    lovableApiKey,
    dataUrl,
    styleKey,
    roomKey,
    userPrompt,
    enhancementType,
    userId,
    projectId,
    variationIndex,
  } = params;

  try {
    const fbPrompt = buildFallbackPrompt(styleKey, roomKey, userPrompt, enhancementType, variationIndex + 1);
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [{
          role: "user",
          content: [
            { type: "text", text: fbPrompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
      }),
    });
    if (!aiRes.ok) {
      const errorText = await aiRes.text().catch(() => "");
      return {
        ok: false,
        variationIndex,
        error: `Fallback failed (${aiRes.status}) ${errorText.slice(0, 160)}`.trim(),
      };
    }

    const j = await aiRes.json();
    const outUrl: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!outUrl?.startsWith("data:")) {
      return { ok: false, variationIndex, error: "No image returned" };
    }

    const [meta, payload] = outUrl.split(",");
    const outMime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
    const ext = outMime.includes("png") ? "png" : "jpg";
    const outBytes = b64decode(payload);
    const path = `${userId}/staging/${projectId}/fallback_${variationIndex}.${ext}`;
    const uploadErr = await uploadToPhotosWithRetry(
      admin,
      path,
      outBytes,
      outMime,
      `fallback variation #${variationIndex + 1}`,
    );
    if (uploadErr) {
      return { ok: false, variationIndex, error: uploadErr.message };
    }

    const { error: insertErr } = await admin.from("staging_results").insert({
      project_id: projectId,
      user_id: userId,
      image_path: path,
      variation_index: variationIndex,
      provider: "lovable",
    });
    if (insertErr) {
      return { ok: false, variationIndex, error: insertErr.message ?? "Could not save variation" };
    }

    return { ok: true, variationIndex, path };
  } catch (e) {
    return { ok: false, variationIndex, error: e instanceof Error ? e.message : "Fallback variation failed" };
  }
}

async function getUsedVariationIndexes(admin: any, projectId: string): Promise<Set<number>> {
  const { data } = await admin
    .from("staging_results")
    .select("variation_index")
    .eq("project_id", projectId);
  return new Set((data ?? []).map((row: { variation_index: number }) => row.variation_index));
}

async function countStagingResults(admin: any, projectId: string): Promise<number> {
  const { count } = await admin
    .from("staging_results")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  return count ?? 0;
}

async function ensureEnhancedPath(admin: any, projectId: string) {
  const { data: project } = await admin
    .from("projects")
    .select("enhanced_path")
    .eq("id", projectId)
    .maybeSingle();
  if (project?.enhanced_path) return;

  const { data: first } = await admin
    .from("staging_results")
    .select("image_path")
    .eq("project_id", projectId)
    .order("variation_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (first?.image_path) {
    await admin.from("projects").update({ enhanced_path: first.image_path }).eq("id", projectId);
  }
}

function buildFallbackPrompt(style: string, room: string, extra: string, enhancementType?: string, variationNumber = 1) {
  const isKitchen = enhancementType === "kitchen_remodel";
  const isBathroom = enhancementType === "bathroom_remodel";
  let base: string;
  if (isKitchen) {
    base = `Remodel this kitchen in a ${style} style for a high-end real estate listing. Update cabinetry, countertops, backsplash, hardware, lighting, and flooring while preserving the room's layout, window/door positions, and overall perspective. Photoreal, MLS-ready.`;
  } else if (isBathroom) {
    base = `Remodel this bathroom in a ${style} style for a high-end real estate listing. Update tile, vanity, shower/tub, fixtures, lighting, and flooring while preserving the room's layout, window/door positions, and overall perspective. Photoreal, MLS-ready.`;
  } else {
    base = `Virtually stage this empty ${room.replace(/_/g, " ")} in a tasteful ${style} style appropriate for a high-end real estate listing. Add furniture, rug, lighting, and tasteful decor — only what naturally fits. Match perspective, scale, and existing lighting. Photoreal, MLS-ready.`;
  }
  const variation = `Create variation ${variationNumber} with a distinct furniture layout, decor selection, color accents, and styling details from the other variations while keeping the same room, perspective, and photoreal real-estate quality.`;
  return [base, variation, extra.trim() ? `Additional direction: ${extra.trim()}` : ""].filter(Boolean).join(" ");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function uploadToPhotosWithRetry(
  admin: any,
  path: string,
  bytes: Uint8Array,
  contentType: string,
  label: string,
): Promise<{ message: string } | null> {
  let lastMessage = "Upload failed";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { error } = await admin.storage
        .from("photos")
        .upload(path, bytes, { contentType, upsert: true });
      if (!error) return null;
      lastMessage = error.message;
    } catch (e) {
      lastMessage = e instanceof Error ? e.message : "Upload connection failed";
    }

    console.error(`[storage-upload] ${label} attempt ${attempt} failed:`, lastMessage);
    if (attempt < 4) await delay(800 * attempt);
  }
  return { message: `Storage upload failed after retries: ${lastMessage}` };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function b64encode(bytes: Uint8Array): string {
  let s = ""; const C = 0x8000;
  for (let i = 0; i < bytes.length; i += C) s += String.fromCharCode(...bytes.subarray(i, i + C));
  return btoa(s);
}
function b64decode(b: string): Uint8Array {
  const bin = atob(b); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
