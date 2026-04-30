import { useEffect, useRef, useState } from "react";

export const BeforeAfter = ({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
  className = "",
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}) => {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const move = (clientX: number) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const p = ((clientX - rect.left) / rect.width) * 100;
      setPos(Math.max(0, Math.min(100, p)));
    };
    const onMove = (e: MouseEvent) => dragging.current && move(e.clientX);
    const onTouch = (e: TouchEvent) => dragging.current && e.touches[0] && move(e.touches[0].clientX);
    const stop = () => (dragging.current = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouch);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", stop);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`relative select-none overflow-hidden rounded-2xl border border-border bg-muted shadow-elevated ${className}`}
      onMouseDown={(e) => {
        dragging.current = true;
        const rect = e.currentTarget.getBoundingClientRect();
        setPos(((e.clientX - rect.left) / rect.width) * 100);
      }}
      onTouchStart={(e) => {
        dragging.current = true;
        const t = e.touches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        setPos(((t.clientX - rect.left) / rect.width) * 100);
      }}
    >
      <img src={beforeSrc} alt={beforeLabel} className="block h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <img
          src={afterSrc}
          alt={afterLabel}
          className="block h-full w-full object-cover"
          style={{ width: `${ref.current?.offsetWidth ?? 0}px`, maxWidth: "none" }}
          draggable={false}
        />
      </div>

      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${pos}%`, transform: "translateX(-50%)" }}>
        <div className="h-full w-0.5 bg-aqua/90 shadow-glow" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-aqua text-primary-foreground shadow-glow ring-4 ring-background/40">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l-7 7 7 7V5zm8 14l7-7-7-7v14z"/></svg>
        </div>
      </div>

      <span className="absolute left-3 top-3 z-10 rounded-md bg-background/70 px-2 py-1 text-xs font-medium uppercase tracking-wider text-foreground backdrop-blur">
        {beforeLabel}
      </span>
      <span className="absolute right-3 top-3 z-10 rounded-md bg-aqua/90 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground backdrop-blur">
        {afterLabel}
      </span>
    </div>
  );
};
