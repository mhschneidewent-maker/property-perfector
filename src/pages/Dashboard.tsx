import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { ArrowRight, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { ENHANCEMENTS } from "@/lib/enhancements";

type Project = {
  id: string;
  title: string | null;
  enhancement_type: string;
  status: string;
  original_path: string;
  enhanced_path: string | null;
  created_at: string;
};

const Dashboard = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);
      if (ignore) return;
      const list = (data ?? []) as Project[];
      setProjects(list);
      // Generate thumb URLs in parallel
      const entries = await Promise.all(
        list.map(async (p) => {
          const path = p.enhanced_path ?? p.original_path;
          const { data: signed } = await supabase.storage.from("photos").createSignedUrl(path, 3600);
          return [p.id, signed?.signedUrl ?? ""] as const;
        }),
      );
      if (!ignore) setThumbs(Object.fromEntries(entries));
      setLoading(false);
    })();

    const channel = supabase
      .channel("projects-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${user.id}` }, () => {
        // re-fetch on any change
        supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(60)
          .then(({ data }) => data && setProjects(data as Project[]));
      })
      .subscribe();

    return () => { ignore = true; supabase.removeChannel(channel); };
  }, [user]);

  const labelFor = (k: string) => ENHANCEMENTS.find((e) => e.key === k)?.label ?? k;

  return (
    <div className="min-h-screen bg-hero">
      <SiteHeader />
      <main className="container py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">Your studio</h1>
            <p className="mt-1 text-muted-foreground">Upload a photo and apply real estate enhancements.</p>
          </div>
          <Button variant="hero" size="lg" asChild>
            <Link to="/studio">New enhancement <ArrowRight className="ml-1" /></Link>
          </Button>
        </div>

        <div className="mt-10">
          <h2 className="font-display text-xl font-semibold">Recent projects</h2>
          {loading ? (
            <div className="mt-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-aqua" /></div>
          ) : projects.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-gradient-card p-12 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-aqua" />
              <p className="mt-4 font-display text-lg font-semibold">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Upload your first listing photo to begin.</p>
              <Button variant="hero" className="mt-6" asChild>
                <Link to="/studio">Start a project</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  to={`/studio?project=${p.id}`}
                  className="group overflow-hidden rounded-2xl border border-border bg-gradient-card shadow-card transition-all hover:-translate-y-1 hover:border-aqua/40 hover:shadow-glow"
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    {thumbs[p.id] ? (
                      <img src={thumbs[p.id]} alt={labelFor(p.enhancement_type)} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="grid h-full place-items-center text-muted-foreground"><ImageIcon /></div>
                    )}
                    {p.status !== "done" && (
                      <span className={`absolute right-2 top-2 rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wider backdrop-blur ${
                        p.status === "processing" ? "bg-aqua/90 text-primary-foreground" :
                        p.status === "failed" ? "bg-destructive/90 text-destructive-foreground" :
                        "bg-background/70 text-foreground"
                      }`}>
                        {p.status === "processing" ? "Processing…" : p.status}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-display font-semibold">{labelFor(p.enhancement_type)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
