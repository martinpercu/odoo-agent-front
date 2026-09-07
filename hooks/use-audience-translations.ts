"use client";

import { useTranslations } from "next-intl";
import { useAudience } from "@/hooks/use-audience";

/**
 * Returns a translator scoped to either `Builder.<namespace>` or `Client.<namespace>`
 * depending on the current user's audience (role).
 *
 * Use for any string that should sound technical to admins/superadmins
 * and natural/non-technical to end users (CLIENT_USER + anonymous).
 *
 * Builder voice: ejecution-oriented, mono-friendly, exposes Odoo internals
 *   ("EJECUTANDO · fetch_records", "ValidationError")
 *
 * Client voice: concierge-style, no jargon, document numbers only
 *   ("Lista", "No pude conectarme con tu sistema")
 *
 * Keys must exist under BOTH `Builder.<ns>` and `Client.<ns>` in each
 * messages/*.json — keep them in lockstep.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAudienceT(namespace: string): any {
  // ⚠️ La audiencia NO se re-deriva del rol acá — sale de `useAudience()`, que es el
  // único lugar donde se decide. Cuando ese hook devuelve "client" por una vista
  // previa, el copy tiene que acompañar: media pantalla en voz de implementador y la
  // otra media en voz de concierge no es ninguna de las dos.
  const { audience } = useAudience();
  const root = audience === "builder" ? "Builder" : "Client";
  return useTranslations(`${root}.${namespace}`);
}
