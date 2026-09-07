"use client";

import { useAudience } from "@/hooks/use-audience";

type IconSlot = "inline" | "button" | "heading";

const SIZES: Record<"builder" | "client", Record<IconSlot, number>> = {
  builder: { inline: 16, button: 20, heading: 24 },
  client:  { inline: 18, button: 22, heading: 28 },
};

export function useIconSize(slot: IconSlot = "inline"): number {
  const { audience } = useAudience();   // ver `hooks/use-audience.tsx`
  return SIZES[audience][slot];
}
