import { Sun, Cloud, Sparkles, Trees, Sofa, Flame, Car, Wand2, ChefHat, Bath } from "lucide-react";

export type EnhancementKey =
  | "twilight"
  | "sky_replace"
  | "green_grass"
  | "declutter"
  | "virtual_stage"
  | "kitchen_remodel"
  | "bathroom_remodel"
  | "brighten"
  | "remove_cars"
  | "fireplace_on";

export const ENHANCEMENTS: {
  key: EnhancementKey;
  label: string;
  description: string;
  icon: typeof Sun;
}[] = [
  { key: "twilight", label: "Twilight Conversion", description: "Daytime → cinematic dusk with glowing windows", icon: Sun },
  { key: "sky_replace", label: "Sky Replacement", description: "Swap dull skies for vibrant blue with clouds", icon: Cloud },
  { key: "green_grass", label: "Green Grass", description: "Lush, healthy lawn — no brown patches", icon: Trees },
  { key: "declutter", label: "Declutter Room", description: "Remove personal items and visual noise", icon: Wand2 },
  { key: "virtual_stage", label: "Virtual Staging", description: "Furnish empty rooms with modern decor", icon: Sofa },
  { key: "kitchen_remodel", label: "AI Kitchen Remodel", description: "Reimagine dated kitchens with modern finishes", icon: ChefHat },
  { key: "bathroom_remodel", label: "AI Bathroom Remodel", description: "Transform tired bathrooms into spa-like spaces", icon: Bath },
  { key: "brighten", label: "Brighten & HDR", description: "Pro color correction, lift shadows", icon: Sparkles },
  { key: "remove_cars", label: "Remove Cars & Clutter", description: "Clean exterior shots, remove vehicles", icon: Car },
  { key: "fireplace_on", label: "Light the Fireplace", description: "Add a warm, glowing fire", icon: Flame },
];
