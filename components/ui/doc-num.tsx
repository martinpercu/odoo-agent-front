"use client";

import { useAudience } from "@/hooks/use-audience";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/**
 * Renders a document number.
 *
 * - Client (CLIENT_USER): wrapped in `.docnum` — Roboto Mono, soft warm-raised pill, the ONLY mono surface the Client sees.
 * - Builder (ADMIN/SUPERADMIN): plain `.font-technical` — mono everywhere is already the norm, no pill.
 */
export function DocNum({ children, className = "" }: Props) {
  // ⚠️ Acá vivía una CUARTA regla de audiencia, y encima distinta de las otras tres:
  // `role === "CLIENT_USER" || !meData?.user`. O sea que durante el instante previo a
  // que `/me` conteste, este componente dibujaba Client mientras la densidad, el copy
  // y los íconos ya dibujaban Builder. Ahora las cuatro leen el mismo hook.
  const { audience } = useAudience();
  const cls = audience === "client" ? "docnum" : "font-technical";
  return <span className={`${cls} ${className}`.trim()}>{children}</span>;
}
