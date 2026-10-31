import { MessageCircle } from "lucide-react";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 rounded-2xl" : "h-9 w-9 rounded-xl";
  const icon = size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <div className="flex items-center gap-2.5">
      <div className={`bg-brand flex items-center justify-center text-primary-foreground shadow-soft ${box}`}>
        <MessageCircle className={icon} strokeWidth={2.4} />
      </div>
      <span className={`font-extrabold tracking-tight text-foreground ${size === "lg" ? "text-2xl" : "text-lg"}`}>
        ChatWave
      </span>
    </div>
  );
}

export function UserAvatar({
  name,
  online,
  size = "md",
}: {
  name: string;
  online?: boolean;
  size?: "sm" | "md";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const dim = size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  return (
    <div className="relative shrink-0">
      <div className={`flex items-center justify-center rounded-full bg-accent font-bold text-accent-foreground ${dim}`}>
        {initials || "?"}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${online ? "bg-online" : "bg-muted-foreground/40"}`}
        />
      )}
    </div>
  );
}
