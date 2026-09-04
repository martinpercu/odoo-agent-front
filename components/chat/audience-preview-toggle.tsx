"use client";

import { Eye, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAudience } from "@/hooks/use-audience";
import { useIconSize } from "@/hooks/use-icon-size";

/**
 * **Verse a sí mismo desde el cliente**, en el panel izquierdo, debajo del cambiador de
 * instancias (`PLAN_INSTANCIAS/07-demo-vivencial.md` Idea 3).
 *
 * ⭐ Contesta sola la objeción que frena a un implementador —*"¿y esto no le muestra de
 * más a mi cliente?"*— que hasta ahora era imposible de mostrar porque hacía falta tener
 * dos cuentas abiertas al mismo tiempo. Un click y la misma pantalla se dibuja con la
 * densidad, el copy, los íconos y el menú recortado de un `CLIENT_USER`, y el agente
 * contesta con voz de concierge.
 *
 * ⚠️ **El gate es el ROL, no la audiencia** (`canPreviewAsClient` sale de `baseAudience`,
 * que no se mueve con la vista previa). Este control vive en el sidebar, que es una de las
 * superficies que la vista previa RECORTA: gatearlo por audiencia lo haría desaparecer en
 * el mismo click que lo enciende, y no hay un segundo control en ningún lado para volver.
 * Es la única pieza de todo esto que tiene que ser inmune a su propio efecto.
 *
 * ⚠️ Un `CLIENT_USER` no lo ve nunca — ya ESTÁ en esa vista.
 *
 * Sobre la posición: con **una sola instancia** el cambiador de instancias no se dibuja
 * (no hay nada que ciclar) y este control ocupa su lugar; con **dos o más** queda debajo.
 * Y al pasar a vista cliente el cartel de instancia se esconde —un cliente no lo ve— así
 * que este control sube: es deliberado, la pantalla tiene que quedar como la vería el
 * cliente.
 */
export function AudiencePreviewToggle({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations("Sidebar");
  const iconBtn = useIconSize("button");
  const { canPreviewAsClient, isPreviewingAsClient, setPreviewAsClient } = useAudience();

  if (!canPreviewAsClient) return null;

  // ⚠️ `stopPropagation` en el click: el sidebar COLAPSADO expande al clickearlo (hay un
  // `onClick` en su contenedor), así que sin esto encender la vista previa desde colapsado
  // abriría además el panel — dos efectos por un click. Misma convención que "Nueva
  // Consulta" y el botón de colapsar.

  const label = isPreviewingAsClient ? t("backToMyView") : t("viewAsClient");
  const Icon = isPreviewingAsClient ? Undo2 : Eye;

  // Colapsado queda sólo el ícono, igual que el cartel de instancia; el texto viaja en el
  // `title` para que siga siendo recuperable sin expandir.
  if (collapsed) {
    return (
      <div className="border-b border-sidebar-border px-3 pb-3 pt-2">
        <button
          type="button"
          role="switch"
          aria-checked={isPreviewingAsClient}
          aria-label={label}
          title={label}
          onClick={(e) => { e.stopPropagation(); setPreviewAsClient(!isPreviewingAsClient); }}
          className={`flex h-btn-md w-full items-center justify-center rounded-btn transition-colors ${
            isPreviewingAsClient
              ? "bg-accent-subtle text-accent"
              : "bg-sidebar-hover text-foreground hover:bg-raised"
          }`}
        >
          <Icon size={iconBtn} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-sidebar-border px-3 pb-3 pt-2">
      <button
        type="button"
        role="switch"
        aria-checked={isPreviewingAsClient}
        onClick={(e) => { e.stopPropagation(); setPreviewAsClient(!isPreviewingAsClient); }}
        className={`flex w-full items-center gap-3 rounded-btn px-3 py-2 text-left transition-colors ${
          isPreviewingAsClient
            ? "bg-accent-subtle text-accent"
            : "bg-sidebar-hover text-foreground hover:bg-raised"
        }`}
      >
        <Icon size={iconBtn} strokeWidth={1.5} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-body font-medium">{label}</span>
        {/* El riel del switch. Es decorativo (`aria-hidden`): el estado lo comunica
            `role="switch"` + `aria-checked` en el botón, y el texto ya cambia solo. */}
        <span
          aria-hidden
          className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${
            isPreviewingAsClient ? "bg-accent" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-surface transition-all ${
              isPreviewingAsClient ? "left-[18px]" : "left-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
