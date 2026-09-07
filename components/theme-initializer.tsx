"use client";

import { useEffect } from "react";

/**
 * Aplica el tema claro/oscuro desde `localStorage` en cada cambio de ruta.
 *
 * ⚠️ **Ya no decide la audiencia.** Antes también ponía la clase `.builder`/`.client`
 * del `<html>`, que es la que gobierna densidad y escala tipográfica — pero esa es la
 * misma decisión que el copy y el tamaño de los íconos, y tenerla acá era la razón por
 * la que existían cuatro reglas de audiencia que podían discrepar entre sí. Vive en
 * `hooks/use-audience.tsx`, junto con las otras tres.
 */
export function ThemeInitializer() {
  useEffect(() => {
    const h = document.documentElement;
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      h.classList.add("dark");
    } else {
      h.classList.remove("dark");
    }
  }, []);

  return null;
}
