import { Link } from "react-router-dom";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const textSizeMap = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-4xl",
};

export const Logo = ({ className = "", showWordmark = true, size = "sm" }: LogoProps) => (
  <Link to="/" className={`flex items-center ${className}`} aria-label="CurbApp.Ai — home">
    <span className={`font-display ${textSizeMap[size]} font-semibold tracking-tight leading-none`}>
      <span className="text-foreground">CurbApp</span><span className="text-gradient">.Ai</span>
    </span>
  </Link>
);
