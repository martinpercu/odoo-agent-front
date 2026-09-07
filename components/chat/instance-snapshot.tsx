"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { fetchInstanceUsage } from "@/lib/api";
import { instanceLabel } from "@/lib/instance-label";
import { useOdooConfig } from "@/hooks/use-odoo-config";

/**
 * "Esto ya sé de tu negocio" — el primer valor en 60 segundos (quick-wins §9).
 *
 * ⭐ **El hueco que cierra:** al conectar una instancia el usuario caía en un chat
 * VACÍO con sugerencias al azar. Debería caer en **un resultado**. Esta tarjeta
 * convierte la hoja en blanco en números reales de su propia base, leídos en el
 * primer segundo.
 *
 * Sale gratis: los conteos son los MISMOS que ya mide el gating del catálogo (B6)
 * y quedan cacheados 24 h, así que la segunda visita no paga nada.
 *
 * ⚠️ **Se muestra sólo si hay algo que mostrar.** Sin datos, con la instancia
 * caída o en demo no se renderiza nada — una tarjeta vacía o en cero es peor que
 * la hoja en blanco que venía a reemplazar.
 */

/**
 * Los modelos que se muestran, en el orden en que se leen.
 *
 * ⚠️ La clave de i18n **no puede ser el nombre del modelo**: `next-intl` usa el
 * punto para anidar y una clave con punto invalida el bundle ENTERO — la app
 * queda sin traducciones, no sólo esta tarjeta. `tsc` y `build` no lo detectan;
 * salta recién al abrir la página.
 */
const SNAPSHOT_MODELS: ReadonlyArray<{ model: string; key: string }> = [
  { model: "res.partner", key: "resPartner" },
  { model: "product.product", key: "productProduct" },
  { model: "sale.order", key: "saleOrder" },
  { model: "account.move", key: "accountMove" },
  { model: "crm.lead", key: "crmLead" },
  { model: "purchase.order", key: "purchaseOrder" },
];

const MAX_TILES = 4;

export function InstanceSnapshot() {
  const t = useTranslations("Snapshot");
  const locale = useLocale();
  const { activeConfigId, isDemoMode, activeConfig } = useOdooConfig();
  const demoName = instanceLabel(activeConfig);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    // ⚠️ El razonamiento viejo —"en demo los números son de NUESTRA instancia:
    // mostrarlos como 'tu negocio' sería mentir en la primera pantalla"— era correcto
    // cuando la demo se presentaba como "tu Odoo". Con un selector que dice "elegí una
    // empresa de ejemplo" el encuadre cambia y el snapshot pasa a ser lo más útil de
    // la pantalla: te dice de un vistazo que Kestrel tiene 2.000 oportunidades y 0
    // productos en depósito, o sea de qué va esta empresa. El rótulo de ejemplo lo
    // pone el encabezado (`t("titleDemo")`), no el silencio.
    if (!activeConfigId) return;
    let vivo = true;
    fetchInstanceUsage(activeConfigId).then((u) => {
      if (vivo) setUsage(u);
    });
    return () => {
      vivo = false;
    };
  }, [activeConfigId]);

  const tiles = SNAPSHOT_MODELS.filter((m) => (usage?.[m.model] ?? 0) > 0).slice(0, MAX_TILES);
  // Nada que mostrar ⇒ nada se renderiza. Una tarjeta en cero es peor que no tenerla.
  if (tiles.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="mb-6 rounded-card border border-border bg-surface p-4"
    >
      <p className="mb-3 flex items-center gap-1.5 text-small font-medium text-foreground">
        <Sparkles size={14} strokeWidth={1.5} className="text-accent" aria-hidden />
        {/* ⚠️ En demo el encabezado NO puede decir "tu negocio": los números son de
            Kestrel o de Casa Mendieta, no de quien está mirando. Nombrar la empresa
            es lo que convierte el mismo dato de una mentira en la respuesta a "¿de
            qué va esta empresa?" — que es para lo que el selector la puso ahí. */}
        {isDemoMode && demoName ? t("titleDemo", { instance: demoName }) : t("title")}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.model} className="rounded-btn border border-border bg-base px-3 py-2">
            <p className="text-subheading tabular-nums">
              {/* ⚠️ `toLocaleString()` SIN argumento usa el locale del BROWSER, no el de la
                  UI: con el navegador en inglés y la app en español, la misma tarjeta
                  mostraba «425» y «2,640» — coma de miles en una pantalla en español.
                  Es el mismo modo de falla que el bug 15 del ROADMAP, acá del lado del
                  front. El locale de la app es el único que corresponde. */}
              {(usage?.[tile.model] ?? 0).toLocaleString(locale)}
            </p>
            <p className="text-micro text-text-muted">{t(`model.${tile.key}`)}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-micro text-text-muted">
        {isDemoMode && demoName ? t("hintDemo") : t("hint")}
      </p>
    </motion.div>
  );
}
