"use client";

import { useState } from "react";
import { ArrowBigRight, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";

import { useChatContext } from "@/components/app-shell";
import { useIconSize } from "@/hooks/use-icon-size";
import { useOdooConfig } from "@/hooks/use-odoo-config";
import { useAudience } from "@/hooks/use-audience";
import { instanceLabel } from "@/lib/instance-label";

/**
 * **Contra qué instancia estás trabajando**, arriba de todo en el panel izquierdo.
 *
 * ⭐ Existe para el implementador con varios clientes conectados: el dato vivía sólo
 * adentro del menú de usuario, a dos clicks, así que la respuesta a *"¿esto que estoy por
 * preguntar sale de la base de quién?"* costaba abrir un popover. Es la pregunta más cara
 * de contestar mal en todo el producto — un número correcto sobre la empresa equivocada
 * no se ve distinto de uno correcto.
 *
 * La flecha cicla (round-robin) a la siguiente instancia con un click — pensado para el
 * caso común de 2 instancias, donde "la otra" siempre es una sola. Si el click ocurre
 * DENTRO de un chat, sale al chat vacío igual que el selector del menú de usuario: quedarse
 * mirando la conversación de la instancia anterior con el cartel ya mostrando la nueva es
 * la misma confusión que este cartel existe para evitar, y de paso hace visible el cambio
 * — `instance-snapshot` ("esto ya sé de tu negocio") en el chat vacío trae otros números.
 *
 * No se muestra:
 *  - a un `CLIENT_USER`, que tiene una sola instancia y para quien nombrarla no distingue
 *    nada (le diría el nombre de su propia empresa, que ya sabe);
 *  - en demo, donde los datos son NUESTROS y el nombre no es el de su negocio;
 *  - cuando no hay ningún nombre utilizable — un cartel que dice "—" ocupa lugar y no
 *    informa nada.
 */
export function ActiveInstanceBadge({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations("Sidebar");
  const router = useRouter();
  const pathname = usePathname();
  const { configs, activeConfigId, setActiveConfigId } = useOdooConfig();
  const { setCurrentChatId, stopStreaming } = useChatContext();
  const iconBtn = useIconSize("button");

  // Audiencia, no rol: un cliente final tiene UNA instancia, así que nombrarla no
  // distingue nada — y en la vista previa del demo el cartel tiene que irse, porque su
  // ausencia es parte de lo que se está mostrando.
  const { audience } = useAudience();
  const isBuilder = audience === "builder";
  const name = instanceLabel(configs.find((c) => c.id === activeConfigId));

  const [textHover, setTextHover] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  // ⚠️ **En demo AHORA se muestra** (PLAN_INSTANCIAS/05 §4). Se escondía cuando la
  // demo era una sola instancia y el cartel no distinguía nada. Con el parque es al
  // revés: es la pregunta más útil de la pantalla, y la flecha que cicla instancias
  // es literalmente lo que D7 viene a mostrar —un implementador con varios clientes
  // conectados, cambiando de cliente como lo va a hacer de verdad.
  //
  // ⚠️ **Con UNA sola instancia no se dibuja** (2026-09-02): este cartel es un CAMBIADOR,
  // y con una sola no hay nada que ciclar — la flecha quedaba permanentemente
  // deshabilitada y la fila decía un nombre que no distingue nada de nada. Esa posición
  // pasa a ocuparla `AudiencePreviewToggle`, que sí tiene algo que hacer ahí.
  if (!isBuilder || !name || configs.length < 2) return null;

  const isActive = textHover || btnHover;

  function handleCycleNext() {
    if (configs.length < 2) return;
    const idx = configs.findIndex((c) => c.id === activeConfigId);
    const next = configs[(idx + 1) % configs.length];
    if (!next) return;
    setActiveConfigId(next.id);
    if (pathname.startsWith("/chat/")) {
      stopStreaming();
      setCurrentChatId(undefined);
      router.push("/chat");
    }
  }

  // Colapsado queda sólo el ícono; el nombre viaja en el `title` para que siga siendo
  // recuperable sin expandir.
  // ⚠️ Colapsado el cartel CICLA, no expande (2026-09-04): es la única acción que ese
  // ícono puede ofrecer sin desplegar nada, y repetir "expandir el sidebar" —que ya hacen
  // el logo, el resto del panel y el cursor— no agrega nada. Por eso hace `stopPropagation`
  // sobre el click-para-expandir del contenedor. Y por eso mismo NEUTRALIZA el cursor
  // (`cursor-default`): el de flecha-expandir que hereda del sidebar colapsado promete
  // desplegar el panel, que es justo lo que este click ya no hace. Lo único que responde
  // al hover es el ícono, que se pone un azul más oscuro.
  if (collapsed) {
    return (
      <div className="px-3 pt-3">
        <div
          role="button"
          tabIndex={0}
          className="flex h-btn-md cursor-default items-center justify-center rounded-btn bg-sidebar-hover"
          title={`${t("instanceBadge")}: ${name}`}
          aria-label={`${t("instanceBadge")}: ${name}`}
          onClick={(e) => { e.stopPropagation(); handleCycleNext(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              handleCycleNext();
            }
          }}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
        >
          <Server
            size={iconBtn}
            strokeWidth={1.5}
            className={btnHover ? "text-accent-hover" : "text-accent"}
            aria-hidden
          />
          <span className="sr-only">{`${t("instanceBadge")}: ${name}`}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3">
      <div className="flex items-center gap-3 rounded-btn bg-sidebar-hover px-3 py-2">
        <Server
          size={iconBtn}
          strokeWidth={1.5}
          className="shrink-0 text-accent"
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 cursor-default truncate text-center text-body font-medium text-foreground"
          title={name}
          onMouseEnter={() => { if (configs.length >= 2) setTextHover(true); }}
          onMouseLeave={() => setTextHover(false)}
        >
          {name}
        </span>
        <button
          type="button"
          onClick={handleCycleNext}
          onMouseEnter={() => { if (configs.length >= 2) setBtnHover(true); }}
          onMouseLeave={() => setBtnHover(false)}
          disabled={configs.length < 2}
          aria-label="Cambiar instancia"
          className={`shrink-0 rounded-btn p-1 transition-colors disabled:opacity-40 ${isActive ? "bg-raised text-accent" : "text-foreground"}`}
        >
          <ArrowBigRight size={iconBtn} strokeWidth={btnHover ? 2.5 : 1.5} />
        </button>
      </div>
    </div>
  );
}
