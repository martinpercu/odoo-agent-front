"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useSession } from "@/hooks/use-session";

export type Audience = "builder" | "client";

interface AudienceContextType {
  /** La audiencia con la que hay que DIBUJAR. Incluye la vista previa. */
  audience: Audience;
  /** La que le corresponde al usuario de verdad, ignorando la vista previa. */
  baseAudience: Audience;
  /** `true` cuando estamos mirando el producto como lo vería un cliente final. */
  isPreviewingAsClient: boolean;
  /** Si esta sesión puede activar la vista previa (hoy: sólo en el demo). */
  canPreviewAsClient: boolean;
  setPreviewAsClient: (on: boolean) => void;
}

const AudienceContext = createContext<AudienceContextType | null>(null);

/**
 * **Quién mira, y por lo tanto cómo se dibuja.**
 *
 * ⚠️ Esto NO es un permiso. Son dos preguntas distintas que hasta ahora se escribían
 * con la misma expresión (`role === "ADMIN" || role === "SUPERADMIN"`), repetida en
 * cuatro lugares que no se conocían entre sí:
 *
 *   - `theme-initializer` — la clase `.builder`/`.client` del `<html>`, que gobierna
 *     alturas, radios, gaps y escala tipográfica (`globals.css`);
 *   - `use-audience-translations` — el copy (`Builder.<ns>` vs `Client.<ns>`);
 *   - `use-icon-size` — el tamaño de los íconos;
 *   - `user-menu` — qué entradas del menú existen.
 *
 * Separar **"qué podés"** de **"cómo se te dibuja"** es todo el diseño. Las guardas de
 * ruta y los endpoints siguen leyendo el ROL; esto decide únicamente lo que se ve.
 *
 * ## La dirección es única, y es la propiedad que lo hace seguro
 *
 * La vista previa sólo puede ir de `builder` → `client`, o sea **hacia ver MENOS**.
 * Nunca al revés. Un override que sólo baja únicamente puede QUITAR cosas de la
 * pantalla: no puede abrir ninguna puerta, así que no hay superficie de permisos que
 * auditar. Si algún día hace falta la dirección contraria, no es un cambio de este
 * archivo — es un problema de autorización y va del lado del server.
 *
 * El backend defiende la misma regla por su cuenta (`main._audience_for_request`): el
 * front puede PEDIR audiencia cliente, y pedir builder no se honra. No confiamos en
 * que el front mande lo correcto.
 *
 * Ver `PLAN_INSTANCIAS/07-demo-vivencial.md` Idea 3 y `DECISIONES.md` DI-12.
 */
export function AudienceProvider({ children }: { children: React.ReactNode }) {
  const { meData } = useSession();
  const [previewAsClient, setPreviewAsClientState] = useState(false);

  const role = meData?.user?.role;
  const baseAudience: Audience =
    role === "ADMIN" || role === "SUPERADMIN" ? "builder" : "client";

  // ⭐ **Se decide por el ROL, no por la audiencia** (`baseAudience` sale del rol y no se
  // mueve con la vista previa). Es la propiedad que hace que el interruptor no se borre a
  // sí mismo: vive en el sidebar, que ES una de las superficies que la vista previa
  // recorta, así que gatearlo por la audiencia lo haría desaparecer en el mismo click que
  // lo enciende — y sin otra salida, porque no hay un segundo control en ningún lado.
  //
  // Un `CLIENT_USER` nunca puede: ya ESTÁ en la vista cliente, y ofrecérsela sería
  // ofrecerle cambiar a lo que ya ve.
  const canPreviewAsClient = baseAudience === "builder";

  // ⚠️ La vista previa se NEUTRALIZA por derivación, no por un efecto que resetee el
  // estado. Si la sesión deja de poder previsualizar —`/me` llega tarde y el rol resuelve
  // a `CLIENT_USER`— este `&&` la apaga en el mismo render. Un efecto que llamara a
  // `setState` haría lo mismo un render TARDE, y ese render intermedio es exactamente el
  // peligroso: alguien que no puede previsualizar viendo la cáscara recortada.
  const isPreviewingAsClient = canPreviewAsClient && previewAsClient;
  const audience: Audience = isPreviewingAsClient ? "client" : baseAudience;

  // La clase que intercambia la densidad. Vive acá y no en `ThemeInitializer` porque
  // es la MISMA decisión que el copy y los íconos: tenerla en otro archivo es cómo se
  // llegó a cuatro reglas que podían discrepar. `ThemeInitializer` se queda con el
  // tema claro/oscuro, que es lo que su nombre dice.
  useEffect(() => {
    if (meData === null) return;
    const h = document.documentElement;
    h.classList.toggle("builder", audience === "builder");
    h.classList.toggle("client", audience === "client");
    // ⚠️ Se persiste la audiencia REAL, no la previsualizada: una vista previa es una
    // mirada momentánea y no puede dejar rastro en el arranque de la próxima sesión.
    try { localStorage.setItem("audience", baseAudience); } catch { /* ignore */ }
  }, [audience, baseAudience, meData]);

  const value = useMemo(
    () => ({
      audience,
      baseAudience,
      isPreviewingAsClient,
      canPreviewAsClient,
      setPreviewAsClient: setPreviewAsClientState,
    }),
    [audience, baseAudience, isPreviewingAsClient, canPreviewAsClient]
  );

  return <AudienceContext.Provider value={value}>{children}</AudienceContext.Provider>;
}

export function useAudience(): AudienceContextType {
  const ctx = useContext(AudienceContext);
  // Sin provider se cae a Client, que es la audiencia que ve MENOS. Un default que
  // mostrara de más sería un default que filtra.
  if (!ctx) {
    return {
      audience: "client",
      baseAudience: "client",
      isPreviewingAsClient: false,
      canPreviewAsClient: false,
      setPreviewAsClient: () => {},
    };
  }
  return ctx;
}
