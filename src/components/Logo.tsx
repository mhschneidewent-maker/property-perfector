import { Link } from "react-router-dom";
import logoMark from "@/assets/freeze-media-mark.png";

export const Logo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`flex items-center gap-2.5 ${className}`} aria-label="Freeze Media — home">
    <img
      src={logoMark}
      alt="Freeze Media logo"
      className="h-9 w-9 object-contain drop-shadow-[0_0_12px_hsl(var(--aqua)/0.4)]"
    />
    <span className="font-display text-lg font-semibold tracking-tight leading-none">
      <span className="text-foreground">FREEZE</span>{" "}
      <span className="text-gradient">MEDIA</span>
    </span>
  </Link>
);
