import { useEffect, useState } from "react";
import { ENHANCEMENTS, EnhancementKey } from "@/lib/enhancements";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X, Download, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";

export const STAGING_STYLES = [
  { key: "modern", label: "Modern" },
  { key: "scandinavian", label: "Scandinavian" },
  { key: "midcentury", label: "Mid-century" },
  { key: "farmhouse", label: "Farmhouse" },
  { key: "luxury", label: "Luxury" },
  { key: "industrial", label: "Industrial" },
  { key: "coastal", label: "Coastal" },
  { key: "minimalist", label: "Minimalist" },
];
export const STAGING_ROOMS = [
  { key: "living", label: "Living Room" },
  { key: "bedroom", label: "Bedroom" },
  { key: "kitchen", label: "Kitchen" },
  { key: "dining", label: "Dining Room" },
  { key: "office", label: "Home Office" },
  { key: "bathroom", label: "Bathroom" },
  { key: "kids", label: "Kids Room" },
  { key: "outdoor", label: "Outdoor / Patio" },
];

export type BatchItem = {
  id: string;
  file: File;
  enhancement: EnhancementKey;
  style: string;
  roomType: string;
  prompt: string;
  numVariations: number;
  projectId?: string;
  status: "idle" | "uploading" | "processing" | "done" | "failed";
  error?: string;
  enhancedUrl?: string;
  variationUrls?: string[];
};

export const isDecor8Key = (k: EnhancementKey) =>
  k === "virtual_stage" || k === "kitchen_remodel" || k === "bathroom_remodel";

interface Props {
  item: BatchItem;
  disabled: boolean;
  onChange: (patch: Partial<BatchItem>) => void;
  onRemove: () => void;
}

export const BatchPhotoCard = ({ item, disabled, onChange, onRemove }: Props) => {
  const [preview, setPreview] = useState<string>("");
  useEffect(() => {
    const url = URL.createObjectURL(item.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [item.file]);

  const decor8 = isDecor8Key(item.enhancement);
  const isStaging = item.enhancement === "virtual_stage";

  const StatusBadge = () => {
    const map = {
      idle: { icon: Clock, text: "Ready", cls: "text-muted-foreground" },
      uploading: { icon: Loader2, text: "Uploading…", cls: "text-aqua animate-spin" },
      processing: { icon: Loader2, text: "Processing…", cls: "text-aqua animate-spin" },
      done: { icon: CheckCircle2, text: "Done", cls: "text-emerald-400" },
      failed: { icon: AlertCircle, text: "Failed", cls: "text-destructive" },
    } as const;
    const s = map[item.status];
    const Icon = s.icon;
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <Icon className={`h-3 w-3 ${s.cls}`} />
        <span className={item.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{s.text}</span>
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3 space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
        {preview && <img src={preview} alt={item.file.name} className="h-full w-full object-cover" />}
        {!disabled && item.status === "idle" && (
          <button
            onClick={onRemove}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-background/80 backdrop-blur hover:bg-background"
            aria-label="Remove"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="absolute left-2 bottom-2 rounded bg-background/80 px-2 py-0.5 backdrop-blur">
          <StatusBadge />
        </div>
      </div>

      <p className="truncate text-xs text-muted-foreground" title={item.file.name}>{item.file.name}</p>

      <div>
        <Label className="text-xs">Enhancement</Label>
        <Select
          value={item.enhancement}
          onValueChange={(v) => onChange({ enhancement: v as EnhancementKey })}
          disabled={disabled}
        >
          <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENHANCEMENTS.map((e) => (
              <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {decor8 && (
        <div className="space-y-2 rounded-lg border border-aqua/30 bg-aqua/5 p-2">
          {isStaging && (
            <div>
              <Label className="text-xs">Room</Label>
              <Select value={item.roomType} onValueChange={(v) => onChange({ roomType: v })} disabled={disabled}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGING_ROOMS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Style</Label>
            <Select value={item.style} onValueChange={(v) => onChange({ style: v })} disabled={disabled}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGING_STYLES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Variations</Label>
              <span className="text-xs font-medium">{item.numVariations}</span>
            </div>
            <Slider
              value={[item.numVariations]}
              onValueChange={(v) => onChange({ numVariations: v[0] })}
              min={1} max={4} step={1}
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <Textarea
            value={item.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            disabled={disabled}
            placeholder="Optional direction…"
            className="min-h-[50px] text-xs"
            maxLength={500}
          />
        </div>
      )}

      {item.status === "failed" && item.error && (
        <p className="text-xs text-destructive">{item.error}</p>
      )}

      {item.status === "done" && (
        <div className="space-y-2">
          {item.enhancedUrl && (
            <Button variant="glass" size="sm" className="w-full" asChild>
              <a href={item.enhancedUrl} download={`curbapp-${item.id}.jpg`}>
                <Download className="mr-1 h-3 w-3" /> Download
              </a>
            </Button>
          )}
          {item.variationUrls && item.variationUrls.length > 0 && (
            <div className="grid grid-cols-2 gap-1">
              {item.variationUrls.map((u, i) => (
                <a key={i} href={u} download={`curbapp-${item.id}-v${i + 1}.jpg`} className="group relative block overflow-hidden rounded">
                  <img src={u} alt={`v${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                  <div className="absolute inset-0 grid place-items-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <Download className="h-4 w-4" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
