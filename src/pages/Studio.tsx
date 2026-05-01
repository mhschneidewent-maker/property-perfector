import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SiteHeader } from "@/components/SiteHeader";
import { BeforeAfter } from "@/components/BeforeAfter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ENHANCEMENTS, EnhancementKey } from "@/lib/enhancements";
import { ArrowLeft, Download, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const PRICE_PER_VARIATION_USD = 0.20;

const STAGING_STYLES = [
  { key: "modern", label: "Modern" },
  { key: "scandinavian", label: "Scandinavian" },
  { key: "midcentury", label: "Mid-century Modern" },
  { key: "farmhouse", label: "Farmhouse" },
  { key: "luxury", label: "Luxury" },
  { key: "industrial", label: "Industrial" },
  { key: "coastal", label: "Coastal" },
  { key: "minimalist", label: "Minimalist" },
];
const STAGING_ROOMS = [
  { key: "living", label: "Living Room" },
  { key: "bedroom", label: "Bedroom" },
  { key: "kitchen", label: "Kitchen" },
  { key: "dining", label: "Dining Room" },
  { key: "office", label: "Home Office" },
  { key: "bathroom", label: "Bathroom" },
  { key: "kids", label: "Kids Room" },
  { key: "outdoor", label: "Outdoor / Patio" },
];

type Project = {
  id: string; user_id: string; title: string | null;
  enhancement_type: string; status: string;
  original_path: string; enhanced_path: string | null; error_message: string | null;
  style?: string | null; room_type?: string | null; prompt?: string | null;
  num_variations?: number | null; provider?: string | null;
};
type StagingResult = {
  id: string; project_id: string; image_path: string; variation_index: number; provider: string;
  url?: string;
};

const Studio = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const projectId = params.get("project");
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enhancement, setEnhancement] = useState<EnhancementKey>("twilight");
  const [project, setProject] = useState<Project | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Decor8 staging controls
  const [style, setStyle] = useState("modern");
  const [roomType, setRoomType] = useState("living");
  const [prompt, setPrompt] = useState("");
  const [numVariations, setNumVariations] = useState(3);
  const [stagingResults, setStagingResults] = useState<StagingResult[]>([]);

  const isStaging = enhancement === "virtual_stage";
  const isKitchenRemodel = enhancement === "kitchen_remodel";
  const isBathroomRemodel = enhancement === "bathroom_remodel";
  const isDecor8 = isStaging || isKitchenRemodel || isBathroomRemodel;
  const estimatedCostUsd = useMemo(
    () => (numVariations * PRICE_PER_VARIATION_USD).toFixed(2),
    [numVariations]
  );

  // Load existing project
  useEffect(() => {
    if (!projectId || !user) return;
    let ignore = false;
    (async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (error || !data || ignore) return;
      setProject(data as Project);
      setEnhancement(data.enhancement_type as EnhancementKey);
      if (data.style) setStyle(data.style);
      if (data.room_type) setRoomType(data.room_type);
      if (data.prompt) setPrompt(data.prompt);
      if (data.num_variations) setNumVariations(data.num_variations);
      const { data: o } = await supabase.storage.from("photos").createSignedUrl(data.original_path, 3600);
      setOriginalUrl(o?.signedUrl ?? null);
      if (data.enhanced_path) {
        const { data: e } = await supabase.storage.from("photos").createSignedUrl(data.enhanced_path, 3600);
        setEnhancedUrl(e?.signedUrl ?? null);
      }
      await loadStagingResults(data.id);
    })();
    return () => { ignore = true; };
  }, [projectId, user]);

  const loadStagingResults = async (pid: string) => {
    const { data } = await supabase
      .from("staging_results")
      .select("*")
      .eq("project_id", pid)
      .order("variation_index", { ascending: true });
    if (!data) return setStagingResults([]);
    const withUrls = await Promise.all(
      (data as StagingResult[]).map(async (r) => {
        const { data: s } = await supabase.storage.from("photos").createSignedUrl(r.image_path, 3600);
        return { ...r, url: s?.signedUrl ?? undefined };
      })
    );
    setStagingResults(withUrls);
  };

  // Realtime: project status + staging results
  useEffect(() => {
    if (!project || !user) return;
    const ch = supabase
      .channel(`project-${project.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${project.id}` }, async (payload) => {
        const next = payload.new as Project;
        setProject(next);
        if (next.status === "done") {
          if (next.enhanced_path) {
            const { data } = await supabase.storage.from("photos").createSignedUrl(next.enhanced_path, 3600);
            setEnhancedUrl(data?.signedUrl ?? null);
          }
          await loadStagingResults(next.id);
          setWorking(false);
          toast.success("Your enhancement is ready!");
        } else if (next.status === "failed") {
          setWorking(false);
          toast.error(next.error_message ?? "Enhancement failed");
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "staging_results", filter: `project_id=eq.${project.id}` }, () => {
        loadStagingResults(project.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [project?.id, user]);

  const onFile = (f: File | null) => {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { toast.error("Use JPG, PNG, or WEBP"); return; }
    if (f.size > MAX_BYTES) { toast.error("Max 15 MB"); return; }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setProject(null); setOriginalUrl(null); setEnhancedUrl(null); setStagingResults([]);
  };

  const startEnhance = async () => {
    if (!user) return;
    if (!file && !project) { toast.error("Upload a photo first"); return; }
    setWorking(true);
    try {
      let proj = project;
      const effectiveRoom = isKitchenRemodel ? "kitchen" : isBathroomRemodel ? "bathroom" : roomType;
      const stagingFields = isDecor8
        ? { style, room_type: effectiveRoom, prompt: prompt.trim() || null, num_variations: numVariations, provider: "decor8" }
        : { provider: "lovable" };

      if (!proj && file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const id = crypto.randomUUID();
        const path = `${user.id}/originals/${id}.${ext}`;
        const { error: upErr } = await supabase.storage.from("photos").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data, error } = await supabase
          .from("projects")
          .insert({ user_id: user.id, original_path: path, enhancement_type: enhancement, status: "processing", ...stagingFields })
          .select("*")
          .single();
        if (error) throw error;
        proj = data as Project;
        setProject(proj);
        const { data: signed } = await supabase.storage.from("photos").createSignedUrl(path, 3600);
        setOriginalUrl(signed?.signedUrl ?? null);
        navigate(`/studio?project=${proj.id}`, { replace: true });
      } else if (proj) {
        await supabase.from("projects").update({
          enhancement_type: enhancement,
          status: "processing",
          enhanced_path: null,
          error_message: null,
          ...stagingFields,
        }).eq("id", proj.id);
        setEnhancedUrl(null);
        setStagingResults([]);
      }

      const fnName = isDecor8 ? "decor8-stage" : "enhance-photo";
      const { error: fnErr } = await supabase.functions.invoke(fnName, { body: { projectId: proj!.id } });
      if (fnErr) throw fnErr;
    } catch (err: any) {
      setWorking(false);
      toast.error(err?.message ?? "Failed to start enhancement");
    }
  };

  const isProcessing = working || project?.status === "processing";
  const beforeSrc = originalUrl || previewUrl;
  const showStagingGallery = isDecor8 && stagingResults.length > 0;

  return (
    <div className="min-h-screen bg-hero">
      <SiteHeader />
      <main className="container py-10">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" />Back to dashboard</Link>
        </Button>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* Preview / Gallery */}
          <div className="rounded-2xl border border-border bg-gradient-card p-4 shadow-card">
            {showStagingGallery && beforeSrc ? (
              <div className="space-y-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                  <img src={beforeSrc} alt="Original" className="h-full w-full object-cover" />
                  <span className="absolute left-3 top-3 rounded-md bg-background/70 px-2 py-1 text-xs backdrop-blur">Before</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {stagingResults.map((r) => (
                    <div key={r.id} className="group relative overflow-hidden rounded-xl border border-border bg-muted">
                      {r.url ? (
                        <img src={r.url} alt={`Variation ${r.variation_index + 1}`} className="aspect-[4/3] w-full object-cover" />
                      ) : (
                        <div className="aspect-[4/3] grid place-items-center text-muted-foreground text-sm">Loading…</div>
                      )}
                      <div className="absolute left-2 top-2 rounded-md bg-background/70 px-2 py-0.5 text-xs backdrop-blur">
                        Variation {r.variation_index + 1}
                      </div>
                      {r.url && (
                        <a
                          href={r.url}
                          download={`curbapp-stage-${r.variation_index + 1}.jpg`}
                          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-background/70 backdrop-blur opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Download"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : beforeSrc && enhancedUrl ? (
              <BeforeAfter beforeSrc={beforeSrc} afterSrc={enhancedUrl} className="aspect-[4/3]" afterLabel={ENHANCEMENTS.find(e => e.key === enhancement)?.label ?? "After"} />
            ) : beforeSrc ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                <img src={beforeSrc} alt="Original" className="h-full w-full object-cover" />
                {isProcessing && (
                  <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative h-14 w-14">
                        <div className="absolute inset-0 animate-spin rounded-full border-2 border-aqua border-t-transparent" />
                        <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-aqua" />
                      </div>
                      <p className="font-display text-lg">{isStaging ? "Staging your room…" : "Enhancing your photo…"}</p>
                      <p className="text-sm text-muted-foreground">{isStaging ? "Generating variations — 30–60 seconds" : "Usually 10–30 seconds"}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <label
                className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 text-center transition-colors hover:border-aqua/60 hover:bg-muted/50"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] ?? null); }}
              >
                <Upload className="h-10 w-10 text-aqua" />
                <p className="mt-4 font-display text-xl font-semibold">Drop a photo to start</p>
                <p className="mt-1 text-sm text-muted-foreground">JPG, PNG, or WEBP — up to 15 MB</p>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                <span className="mt-6 inline-flex items-center gap-2 rounded-md bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow">
                  Choose file
                </span>
              </label>
            )}

            {!isDecor8 && enhancedUrl && (
              <div className="mt-4 flex justify-end">
                <Button variant="glass" asChild>
                  <a href={enhancedUrl} download={`curbapp-${project?.id ?? "enhanced"}.png`}>
                    <Download className="mr-2 h-4 w-4" /> Download enhanced
                  </a>
                </Button>
              </div>
            )}
          </div>

          {/* Controls */}
          <aside className="rounded-2xl border border-border bg-gradient-card p-6 shadow-card">
            <h2 className="font-display text-xl font-semibold">Enhancement</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pick a preset, then run.</p>

            <div className="mt-5 grid gap-2">
              {ENHANCEMENTS.map((e) => {
                const active = enhancement === e.key;
                return (
                  <button
                    key={e.key}
                    onClick={() => setEnhancement(e.key)}
                    disabled={isProcessing}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                      active
                        ? "border-aqua/60 bg-aqua/10 shadow-glow"
                        : "border-border bg-card/40 hover:border-aqua/30 hover:bg-card/70"
                    }`}
                  >
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-gradient-primary" : "bg-muted"}`}>
                      <e.icon className={`h-4 w-4 ${active ? "text-primary-foreground" : "text-aqua"}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{e.label}</p>
                      <p className="text-xs text-muted-foreground">{e.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {isDecor8 && (
              <div className="mt-6 space-y-4 rounded-xl border border-aqua/30 bg-aqua/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-aqua">
                  {isKitchenRemodel ? "Decor8 AI kitchen remodel" : isBathroomRemodel ? "Decor8 AI bathroom remodel" : "Decor8 AI staging"}
                </p>

                <div className={`grid gap-3 ${isStaging ? "grid-cols-2" : "grid-cols-1"}`}>
                  {isStaging && (
                    <div>
                      <Label className="text-xs">Room type</Label>
                      <Select value={roomType} onValueChange={setRoomType} disabled={isProcessing}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STAGING_ROOMS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Design style</Label>
                    <Select value={style} onValueChange={setStyle} disabled={isProcessing}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGING_STYLES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Custom direction (optional)</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isProcessing}
                    placeholder={
                      isKitchenRemodel
                        ? "e.g. white shaker cabinets, quartz counters, gold hardware, marble backsplash"
                        : isBathroomRemodel
                        ? "e.g. walk-in glass shower, marble tile, matte black fixtures, freestanding tub"
                        : "e.g. warm wood tones, leather sofa, plants by the window"
                    }
                    className="mt-1 min-h-[70px] text-sm"
                    maxLength={500}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Variations</Label>
                    <span className="text-xs font-medium">{numVariations}</span>
                  </div>
                  <Slider
                    value={[numVariations]}
                    onValueChange={(v) => setNumVariations(v[0])}
                    min={1} max={4} step={1}
                    disabled={isProcessing}
                    className="mt-2"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Estimated cost</span>
                  <span className="font-display text-base font-semibold text-aqua">~${estimatedCostUsd}</span>
                </div>
              </div>
            )}

            <Button variant="hero" size="lg" className="mt-6 w-full" onClick={startEnhance} disabled={isProcessing || (!file && !project)}>
              {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> {isDecor8 ? "Generating…" : "Enhancing…"}</> : <><Sparkles className="h-4 w-4" /> {isDecor8 ? `Generate ${numVariations} variation${numVariations > 1 ? "s" : ""}` : "Run enhancement"}</>}
            </Button>
            {project?.status === "failed" && project.error_message && (
              <p className="mt-3 text-sm text-destructive">{project.error_message}</p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Studio;
