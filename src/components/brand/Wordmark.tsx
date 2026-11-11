import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("brand-wordmark inline-block text-foreground", className)}>تنالیته</span>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/icons/icon-192.png"
      alt=""
      width={40}
      height={40}
      className={cn("size-10 rounded-full border border-border object-cover", className)}
    />
  );
}
