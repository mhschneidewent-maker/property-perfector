import { Link } from "react-router-dom";
import logoMark from "@/assets/freeze-media-mark.png";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

const textSizeMap = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
};

export const Logo = ({ className = "", showWordmark = true, size = "sm" }: LogoProps) => (
  <Link to="/" className={`flex items-center gap-3 ${className}`} aria-label="Freeze Media — home">
    <img
      src={logoMark}
      alt="Freeze Media logo"
      className={`${sizeMap[size]} object-contain drop-shadow-[0_0_18px_hsl(var(--aqua)/0.55)]`}
    />
    {showWordmark && (
      <span className={`font-display ${textSizeMap[size]} font-semibold tracking-tight leading-none`}>
        <span className="text-foreground">FREEZE</span>{" "}
        <span className="text-gradient">MEDIA</span>
      </span>
    )}
  </Link>
);
