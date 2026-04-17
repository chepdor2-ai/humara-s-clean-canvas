"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getDetectorIconUrl, getDetectorInitials } from "@/lib/detector-branding";

type DetectorBrandIconProps = {
  name: string;
  size?: number;
  className?: string;
  imageClassName?: string;
};

export function DetectorBrandIcon({
  name,
  size = 36,
  className,
  imageClassName,
}: DetectorBrandIconProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const iconUrl = useMemo(() => getDetectorIconUrl(name, size), [name, size]);
  const initials = useMemo(() => getDetectorInitials(name), [name]);
  const sizeClass = useMemo(() => {
    const px = Math.round(size);
    const map: Record<number, string> = {
      12: "h-3 w-3",
      14: "h-3.5 w-3.5",
      16: "h-4 w-4",
      18: "h-[18px] w-[18px]",
      20: "h-5 w-5",
      24: "h-6 w-6",
      28: "h-7 w-7",
      32: "h-8 w-8",
      36: "h-9 w-9",
      40: "h-10 w-10",
    };
    return map[px] ?? "h-9 w-9";
  }, [size]);

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg bg-accent text-[10px] font-bold text-accent-foreground",
        sizeClass,
        className,
      )}
      aria-label={`${name} icon`}
      title={name}
    >
      {imageFailed ? (
        <span>{initials}</span>
      ) : (
        <img
          src={iconUrl}
          alt={`${name} logo`}
          width={size}
          height={size}
          loading="lazy"
          className={cn("h-full w-full object-cover", imageClassName)}
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  );
}
