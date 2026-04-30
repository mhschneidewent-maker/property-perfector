import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SiteHeader } from "@/components/SiteHeader";
import { BeforeAfter } from "@/components/BeforeAfter";
import { Button } from "@/components/ui/button";
import { ENHANCEMENTS, EnhancementKey } from "@/lib/enhancements";
import { ArrowLeft, Download, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type Project = {
  id: string; user_id: string; title: string | null;
  enhancement_type: string; status: string;
  original_path: string; enhanced_path: string | null; error_message: string | null;
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

  // Load existing project if id provided
  useEffect(() => {
    if (!projectId || !user) return;
    let ignore = false;
    (async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (error || !data || ignore) return;
      setProject(data as Project);
      setEnhancement(data.enhancement_type as EnhancementKey);
      const { data: o } = await supabase.storage.from("photos").createSignedUrl(data.original_path, 3600);
      setOriginalUrl(o?.signedUrl ?? null);
      if (data.enhanced_path) {
        const { data: e } = await supabase.storage.from("photos").createSignedUrl(data.enhanced_path, 3600);
        setEnhancedUrl(e?.signedUrl ?? null);
      }
    })();
    return () => { ignore = true; };
  }, [projectId, user]);

  // Realtime updates while processing
  useEffect(() => {
    if (!project || !user) return;
    const ch = supabase
      .channel(`project-${project.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${project.id}` }, async (payload) => {
        const next = payload.new as Project;
        setProject(next);
        if (next.status === "done" && next.enhanced_path) {
          const { data } = await supabase.storage.from("photos").createSignedUrl(next.enhanced_path, 3600);
          setEnhancedUrl(data?.signedUrl ?? null);
          setWorking(false);
          toast.success("Enhancement ready!");
        } else if (next.status === "failed") {
          setWorking(false);
          toast.error(next.error_message ?? "Enhancement failed");
        }
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
    setProject(null); setOriginalUrl(null); setEnhancedUrl(null);
  };

  const startEnhance = async () => {
    if (!user) return;
    if (!file && !project) { toast.error("Upload a photo first"); return; }
    setWorking(true);
    try {
      let proj = project;
      if (!proj && file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const id = crypto.randomUUID();
        const path = `${user.id}/originals/${id}.${ext}`;
        const { error: upErr } = await supabase.storage.from("photos").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data, error } = await supabase
          .from("projects")
          .insert({ user_id: user.id, original_path: path, enhancement_type: enhancement, status: "processing" })
          .select("*")
          .single();
        if (error) throw error;
        proj = data as Project;
        setProject(proj);
        const { data: signed } = await supabase.storage.from("photos").createSignedUrl(path, 3600);
        setOriginalUrl(signed?.signedUrl ?? null);
        navigate(`/studio?project=${proj.id}`, { replace: true });
      } else if (proj && proj.enhancement_type !== enhancement) {
        // Re-run with a different enhancement
        await supabase.from("projects").update({ enhancement_type: enhancement, status: "processing", enhanced_path: null, error_message: null }).eq("id", proj.id);
        setEnhancedUrl(null);
      } else if (proj) {
        await supabase.from("projects").update({ status: "processing", error_message: null }).eq("id", proj.id);
      }

      const { error: fnErr } = await supabase.functions.invoke("enhance-photo", { body: { projectId: proj!.id } });
      if (fnErr) throw fnErr;
    } catch (err: any) {
      setWorking(false);
      toast.error(err?.message ?? "Failed to start enhancement");
    }
  };

  const isProcessing = working || project?.status === "processing";
  const beforeSrc = originalUrl || previewUrl;

  return (
    <div className="min-h-screen bg-hero">
      <SiteHeader />
      <main className="container py-10">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" />Back to dashboard</Link>
        </Button>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Preview */}
          <div className="rounded-2xl border border-border bg-gradient-card p-4 shadow-card">
            {beforeSrc && enhancedUrl ? (
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
                      <p className="font-display text-lg">Enhancing your photo…</p>
                      <p className="text-sm text-muted-foreground">Usually 10–30 seconds</p>
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

            {enhancedUrl && (
              <div className="mt-4 flex justify-end">
                <Button variant="glass" asChild>
                  <a href={enhancedUrl} download={`skylineedit-${project?.id ?? "enhanced"}.png`}>
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

            <Button variant="hero" size="lg" className="mt-6 w-full" onClick={startEnhance} disabled={isProcessing || (!file && !project)}>
              {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Enhancing…</> : <><Sparkles className="h-4 w-4" /> Run enhancement</>}
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
