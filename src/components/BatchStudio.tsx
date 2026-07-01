import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Upload, Download, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { runWithLimit } from "@/lib/concurrency";
import { BatchPhotoCard, BatchItem, isDecor8Key } from "@/components/BatchPhotoCard";
import { EnhancementKey } from "@/lib/enhancements";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const DECOR8_PRICE = 0.2;
const OTHER_PRICE = 0.05;
const CONCURRENCY = 3;

export const BatchStudio = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    const good: BatchItem[] = [];
    for (const f of arr) {
      if (!ALLOWED.includes(f.type)) { toast.error(`${f.name}: unsupported type`); continue; }
      if (f.size > MAX_BYTES) { toast.error(`${f.name}: over 15 MB`); continue; }
      good.push({
        id: crypto.randomUUID(),
        file: f,
        enhancement: "twilight",
        style: "modern",
        roomType: "living",
        prompt: "",
        numVariations: 3,
        status: "idle",
      });
    }
    if (good.length) setItems((prev) => [...prev, ...good]);
  }, []);

  const patchItem = (id: string, patch: Partial<BatchItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  const totals = useMemo(() => {
    let cost = 0;
    let variations = 0;
    for (const it of items) {
      if (isDecor8Key(it.enhancement)) {
        cost += it.numVariations * DECOR8_PRICE;
        variations += it.numVariations;
      } else {
        cost += OTHER_PRICE;
        variations += 1;
      }
    }
    return { cost: cost.toFixed(2), variations };
  }, [items]);

  // Realtime updates for user's projects + staging results
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`batch-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "projects", filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const p = payload.new as any;
          const item = itemsRef.current.find((it) => it.projectId === p.id);
          if (!item) return;
          if (p.status === "done") {
            let enhancedUrl: string | undefined;
            if (p.enhanced_path) {
              const { data } = await supabase.storage.from("photos").createSignedUrl(p.enhanced_path, 3600);
              enhancedUrl = data?.signedUrl ?? undefined;
            }
            // Fetch variations if decor8
            let variationUrls: string[] | undefined;
            if (isDecor8Key(item.enhancement)) {
              const { data: rows } = await supabase
                .from("staging_results")
                .select("image_path,variation_index")
                .eq("project_id", p.id)
                .order("variation_index", { ascending: true });
              if (rows) {
                variationUrls = await Promise.all(
                  rows.map(async (r: any) => {
                    const { data } = await supabase.storage.from("photos").createSignedUrl(r.image_path, 3600);
                    return data?.signedUrl ?? "";
                  })
                );
                variationUrls = variationUrls.filter(Boolean);
              }
            }
            patchItem(item.id, { status: "done", enhancedUrl, variationUrls });
          } else if (p.status === "failed") {
            patchItem(item.id, { status: "failed", error: p.error_message ?? "Failed" });
          } else if (p.status === "processing") {
            patchItem(item.id, { status: "processing" });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const processOne = async (item: BatchItem) => {
    if (!user) return;
    try {
      patchItem(item.id, { status: "uploading" });
      const ext = item.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const projectId = crypto.randomUUID();
      const path = `${user.id}/originals/${projectId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("photos")
        .upload(path, item.file, { contentType: item.file.type });
      if (upErr) throw upErr;

      const decor8 = isDecor8Key(item.enhancement);
      const effectiveRoom =
        item.enhancement === "kitchen_remodel" ? "kitchen" :
        item.enhancement === "bathroom_remodel" ? "bathroom" :
        item.roomType;
      const extra = decor8
        ? { style: item.style, room_type: effectiveRoom, prompt: item.prompt.trim() || null, num_variations: item.numVariations, provider: "decor8" }
        : { provider: "lovable" };

      const { data: proj, error: insErr } = await supabase
        .from("projects")
        .insert({
          id: projectId,
          user_id: user.id,
          original_path: path,
          enhancement_type: item.enhancement,
          status: "processing",
          ...extra,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      patchItem(item.id, { projectId: proj.id, status: "processing" });

      const fnName = decor8 ? "decor8-stage" : "enhance-photo";
      const { error: fnErr } = await supabase.functions.invoke(fnName, { body: { projectId: proj.id } });
      if (fnErr) throw fnErr;
    } catch (err: any) {
      patchItem(item.id, { status: "failed", error: err?.message ?? "Failed" });
    }
  };

  const runBatch = async () => {
    const pending = items.filter((it) => it.status === "idle" || it.status === "failed");
    if (pending.length === 0) { toast.error("No photos to process"); return; }
    setRunning(true);
    try {
      await runWithLimit(pending.map((it) => () => processOne(it)), CONCURRENCY);
    } finally {
      setRunning(false);
    }
  };

  const downloadAll = async () => {
    const done = items.filter((it) => it.status === "done");
    if (!done.length) { toast.error("Nothing finished yet"); return; }
    toast.info("Zipping results…");
    const zip = new JSZip();
    for (const it of done) {
      const base = it.file.name.replace(/\.[^.]+$/, "");
      const urls: { url: string; name: string }[] = [];
      if (isDecor8Key(it.enhancement) && it.variationUrls?.length) {
        it.variationUrls.forEach((u, i) => urls.push({ url: u, name: `${base}-v${i + 1}.jpg` }));
      } else if (it.enhancedUrl) {
        urls.push({ url: it.enhancedUrl, name: `${base}-enhanced.jpg` });
      }
      for (const u of urls) {
        try {
          const res = await fetch(u.url);
          const blob = await res.blob();
          zip.file(u.name, blob);
        } catch { /* skip */ }
      }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "curbapp-batch.zip";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const canRun = items.some((it) => it.status === "idle" || it.status === "failed");
  const anyDone = items.some((it) => it.status === "done");

  return (
    <div className="space-y-6">
      <label
        className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 text-center transition-colors hover:border-aqua/60 hover:bg-muted/50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <Upload className="h-8 w-8 text-aqua" />
        <p className="mt-3 font-display text-lg font-semibold">Drop multiple photos to batch process</p>
        <p className="mt-1 text-sm text-muted-foreground">JPG, PNG, or WEBP — up to 15 MB each</p>
        <input
          type="file" multiple accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
        <span className="mt-4 inline-flex items-center gap-2 rounded-md bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow">
          Add photos
        </span>
      </label>

      {items.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((it) => (
              <BatchPhotoCard
                key={it.id}
                item={it}
                disabled={running || it.status !== "idle"}
                onChange={(patch) => patchItem(it.id, patch)}
                onRemove={() => removeItem(it.id)}
              />
            ))}
          </div>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/80 p-4 shadow-elevated backdrop-blur">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Photos</p>
                <p className="font-display text-lg font-semibold">{items.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total variations</p>
                <p className="font-display text-lg font-semibold">{totals.variations}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Est. cost</p>
                <p className="font-display text-lg font-semibold text-aqua">~${totals.cost}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {anyDone && (
                <Button variant="glass" onClick={downloadAll}>
                  <Download className="mr-1 h-4 w-4" /> Download all (ZIP)
                </Button>
              )}
              <Button variant="hero" size="lg" onClick={runBatch} disabled={running || !canRun}>
                {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <><Sparkles className="h-4 w-4" /> Run batch</>}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
