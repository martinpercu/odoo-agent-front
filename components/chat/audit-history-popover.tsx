"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Clock, CheckCircle2, Loader2 } from "lucide-react";
import { fetchAuditHistory, isClientAuditEntry } from "@/lib/api";
import type { AuditEntry } from "@/lib/api";
import { useAudience } from "@/hooks/use-audience";
import { DocNum } from "@/components/ui/doc-num";

interface AuditHistoryPopoverProps {
  chatId: string;
}

/**
 * **Historial de acciones ejecutadas** en esta conversación.
 *
 * Renderiza DOS formas distintas, no una con campos vacíos: la técnica (modelo, método,
 * cambios campo a campo) y la del cliente (`{ts, summary, recordName}` — sin una sola
 * palabra de Odoo). Cuál llega la decide el backend según la audiencia.
 *
 * ⭐ Y por eso este popover importa para la vista previa "ver como cliente": es la
 * pantalla del producto que MÁS jerga técnica muestra, o sea justo lo que un implementador
 * quiere comprobar que su cliente no ve.
 */
export function AuditHistoryPopover({ chatId }: AuditHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("ChatMessages");
  const { isPreviewingAsClient } = useAudience();

  // ⚠️ La caché se llavea por chat Y por audiencia. Antes era un `loaded` booleano, que
  // no se invalidaba **nunca**: cambiar de vista no volvía a pedir (se seguía viendo el
  // detalle técnico), y abrir el popover en otro chat mostraba las acciones del anterior.
  const loadKey = `${chatId}:${isPreviewingAsClient ? "client" : "builder"}`;

  useEffect(() => {
    if (!open || loadedKey === loadKey) return;
    setLoading(true);
    fetchAuditHistory(chatId, isPreviewingAsClient ? "client" : undefined)
      .then((result) => {
        if (result.success && Array.isArray(result.entries)) {
          setEntries(result.entries);
        }
        setLoadedKey(loadKey);
      })
      .finally(() => setLoading(false));
  }, [open, loadedKey, loadKey, chatId, isPreviewingAsClient]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={popoverRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-small font-medium text-text-secondary transition-colors hover:bg-raised hover:text-foreground"
        title={t("audit.title")}
      >
        <Clock size={16} strokeWidth={1.5} />
        <span>{t("audit.title")}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute bottom-full right-0 z-50 mb-2 w-80 rounded-lg border border-border bg-surface shadow-lg"
          >
            {/* Header */}
            <div className="border-b border-border px-4 py-3">
              <h4 className="text-body font-semibold">{t("audit.title")}</h4>
              <p className="text-small text-text-secondary">{t("audit.subtitle")}</p>
            </div>

            {/* Content */}
            <div className="max-h-64 overflow-y-auto p-2">
              {loading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-text-secondary" />
                </div>
              )}

              {!loading && entries.length === 0 && (
                <p className="py-6 text-center text-small text-text-secondary">
                  {t("audit.empty")}
                </p>
              )}

              {!loading &&
                entries.map((entry, i) =>
                  isClientAuditEntry(entry) ? (
                    /* Cliente: qué pasó y sobre qué registro. Ni modelo, ni método, ni
                       nombres de campo — y sin `font-technical`, que es la única
                       superficie mono que el cliente no debería ver acá. */
                    <div
                      key={`${entry.ts}-${i}`}
                      className="mb-1 rounded-md px-3 py-2 text-small transition-colors hover:bg-raised"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} strokeWidth={1.5} className="shrink-0 text-success-solid" />
                        <span className="font-medium">{entry.summary}</span>
                      </div>
                      {entry.recordName && (
                        <div className="ml-6 text-text-secondary">{entry.recordName}</div>
                      )}
                      {entry.recordId !== null && (
                        <div className="ml-6">
                          <DocNum>#{entry.recordId}</DocNum>
                        </div>
                      )}
                      <div className="ml-6 mt-0.5 text-text-muted">
                        {new Date(entry.ts).toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={entry.id}
                      className="mb-1 rounded-md px-3 py-2 text-small transition-colors hover:bg-raised"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} strokeWidth={1.5} className="shrink-0 text-success-solid" />
                        <span className="font-technical font-medium">
                          {entry.action_type} &middot; {entry.model}
                        </span>
                      </div>
                      {/* `changes` ya viene con la etiqueta localizada de cada campo y su
                          antes/después: es lo que el usuario editó sobre la propuesta. */}
                      {entry.has_edits && entry.changes?.length > 0 && (
                        <div className="ml-6 mt-1 font-technical text-text-secondary">
                          {t("audit.userEdited")}:{" "}
                          {entry.changes.map((c) => c.label || c.field).join(", ")}
                        </div>
                      )}
                      <div className="ml-6 mt-0.5 text-text-muted">
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                    </div>
                  )
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
