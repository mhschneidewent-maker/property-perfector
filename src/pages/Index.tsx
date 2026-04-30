import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Zap, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ENHANCEMENTS } from "@/lib/enhancements";
import beforeImg from "@/assets/hero-before.jpg";
import afterImg from "@/assets/hero-twilight.jpg";

const Index = () => {
  return (
    <div className="min-h-screen bg-hero">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" aria-hidden />
        <div className="container relative grid gap-12 py-20 lg:grid-cols-2 lg:gap-16 lg:py-28">
          <div className="flex flex-col justify-center animate-float-up">
            <span className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-aqua/30 bg-aqua/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-aqua">
              <span className="h-1.5 w-1.5 rounded-full bg-aqua animate-pulse" />
              AI photo enhancement for realtors
            </span>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              Listing photos that <span className="text-gradient">sell faster.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Upload a photo. Pick an enhancement. Get a magazine-quality result in seconds —
              twilight conversions, sky replacements, virtual staging, decluttering, and more.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="hero" size="lg" asChild>
                <Link to="/auth?mode=signup">Start enhancing free <ArrowRight className="ml-1" /></Link>
              </Button>
              <Button variant="glass" size="lg" asChild>
                <a href="#enhancements">See what's possible</a>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2"><Zap className="h-4 w-4 text-aqua" /> Results in seconds</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-aqua" /> Private & secure</span>
              <span className="inline-flex items-center gap-2"><ImageIcon className="h-4 w-4 text-aqua" /> MLS-ready quality</span>
            </div>
          </div>

          <div className="animate-float-up [animation-delay:120ms]">
            <BeforeAfter beforeSrc={beforeImg} afterSrc={afterImg} className="aspect-[4/3]" afterLabel="Twilight" />
            <p className="mt-3 text-center text-sm text-muted-foreground">Drag the slider — Twilight Conversion</p>
          </div>
        </div>
      </section>

      {/* Enhancements grid */}
      <section id="enhancements" className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Every enhancement, one workflow.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Trained on real estate photography. No Photoshop skills required.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ENHANCEMENTS.map((e, i) => (
            <div
              key={e.key}
              className="group rounded-2xl border border-border bg-gradient-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-aqua/40 hover:shadow-glow animate-float-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-primary shadow-glow">
                <e.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">{e.label}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{e.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-aqua/30 bg-gradient-card p-10 text-center shadow-elevated md:p-16">
          <div className="absolute inset-0 bg-gradient-primary opacity-10" aria-hidden />
          <h2 className="relative font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Make every listing look like a million bucks.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-muted-foreground">
            Join photographers and realtors using SkylineEdit to deliver stunning shots, faster.
          </p>
          <div className="relative mt-8 flex justify-center">
            <Button variant="hero" size="lg" asChild>
              <Link to="/auth?mode=signup">Create your free account <ArrowRight className="ml-1" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} SkylineEdit. Built for real estate photography.
      </footer>
    </div>
  );
};

export default Index;
