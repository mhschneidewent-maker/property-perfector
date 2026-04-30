import { Camera } from "lucide-react";
import { Link } from "react-router-dom";

export const Logo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`flex items-center gap-2 ${className}`}>
    <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary shadow-glow">
      <Camera className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
    </div>
    <span className="font-display text-lg font-semibold tracking-tight">
      Skyline<span className="text-gradient">Edit</span>
    </span>
  </Link>
);
