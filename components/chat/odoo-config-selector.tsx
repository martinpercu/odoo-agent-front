"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Database,
} from "lucide-react";
import { instanceLabel } from "@/lib/instance-label";
import { useOdooConfig } from "@/hooks/use-odoo-config";
import { fetchMyCredential } from "@/lib/api";

/** Cache credential status per config_id to avoid re-fetching on each render */
const credentialStatusCache = new Map<string, "configured" | "missing">();

function useCredentialStatus(configId: string | null, isDemo = false) {
  const [status, setStatus] = useState<"loading" | "configured" | "missing">("loading");

  useEffect(() => {
    // ⚠️ Una instancia del parque no tiene Connection por usuario: su credencial vive
    // en la FILA, del lado del backend. Preguntar por ella devolvería "missing" y
    // pintaría un triángulo de advertencia sobre una instancia que anda perfecto.
    if (!configId || configId === "demo" || isDemo) {
      setStatus("configured");
      return;
    }
    const cached = credentialStatusCache.get(configId);
    if (cached) {
      setStatus(cached);
      return;
    }
    setStatus("loading");
    fetchMyCredential(configId).then((r) => {
      const resolved = r.notFound || !r.success ? "missing" : "configured";
      credentialStatusCache.set(configId, resolved);
      setStatus(resolved);
    });
  }, [configId, isDemo]);

  return status;
}

export function OdooConfigSelector() {
  const t = useTranslations("ChatInput");
  const { configs, activeConfigId, setActiveConfigId, isDemoMode } = useOdooConfig();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;
  const credStatus = useCredentialStatus(activeConfigId, activeConfig?.is_demo === true);
  // Las del parque van agrupadas aparte: "Kestrel Sales Group" y la instancia de un
  // cliente real no son la misma clase de cosa, y en una lista plana se ven igual.
  const demoOptions = configs.filter((c) => c.is_demo);
  const ownOptions = configs.filter((c) => !c.is_demo);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Don't render if no multi-config
  if (configs.length === 0 && !isDemoMode) return null;
  if (configs.length <= 1 && !isDemoMode) {
    // Single config — just show status badge, no dropdown
    const label = instanceLabel(activeConfig) || activeConfig?.url || "Odoo";
    return (
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-micro text-text-muted">
        {credStatus === "loading" ? (
          <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
        ) : credStatus === "configured" ? (
          <CheckCircle2 size={12} strokeWidth={1.5} className="text-success-solid" />
        ) : (
          <AlertTriangle size={12} strokeWidth={1.5} className="text-warning-solid" />
        )}
        <span className="font-technical truncate max-w-[120px]">{label}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-micro text-text-secondary hover:bg-raised transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("selectConfig")}
      >
        {credStatus === "loading" ? (
          <Loader2 size={12} strokeWidth={1.5} className="animate-spin shrink-0" />
        ) : credStatus === "configured" ? (
          <CheckCircle2 size={12} strokeWidth={1.5} className="text-success-solid shrink-0" />
        ) : (
          <AlertTriangle size={12} strokeWidth={1.5} className="text-warning-solid shrink-0" />
        )}
        <Database size={12} strokeWidth={1.5} className="shrink-0" />
        <span className="font-technical truncate max-w-[100px]">
          {/* ⚠️ Ya no dice "Demo": con cuatro instancias de demo ese rótulo las
              llamaba a todas igual. `instanceLabel` es la precedencia compartida
              con el backend (display_name → company_name → label). */}
          {instanceLabel(activeConfig) || activeConfig?.url || t("selectConfig")}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={1.5}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-1 z-50 min-w-[220px] rounded-lg border border-border bg-surface shadow-lg overflow-hidden"
            role="listbox"
          >
            <div className="px-3 py-2 border-b border-border">
              <p className="text-micro uppercase tracking-wide text-text-muted">{t("selectConfig")}</p>
            </div>
            <div className="py-1 max-h-48 overflow-y-auto">
              {[
                { key: "own", heading: t("ownGroup"), items: ownOptions },
                { key: "demo", heading: t("demoGroup"), items: demoOptions },
              ].map(({ key, heading, items }) =>
                items.length === 0 ? null : (
                  <div key={key}>
                    {/* El encabezado sólo aparece cuando hay las DOS clases: con una
                        sola, rotular es ruido. */}
                    {ownOptions.length > 0 && demoOptions.length > 0 && (
                      <p className="px-3 pt-2 pb-1 text-micro uppercase tracking-wide text-text-muted">
                        {heading}
                      </p>
                    )}
                    {items.map((cfg) => (
                      <ConfigOption
                        key={cfg.id}
                        configId={cfg.id}
                        isDemo={cfg.is_demo === true}
                        label={instanceLabel(cfg) || cfg.url}
                        url={cfg.url}
                        dbName={cfg.db_name}
                        isActive={cfg.id === activeConfigId}
                        onSelect={() => {
                          setActiveConfigId(cfg.id);
                          setOpen(false);
                        }}
                      />
                    ))}
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

interface ConfigOptionProps {
  configId: string;
  isDemo?: boolean;
  label: string;
  url: string;
  dbName: string;
  isActive: boolean;
  onSelect: () => void;
}

function ConfigOption({ configId, isDemo, label, url, dbName, isActive, onSelect }: ConfigOptionProps) {
  const credStatus = useCredentialStatus(configId, isDemo);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-raised ${
        isActive ? "bg-accent-subtle" : ""
      }`}
    >
      {/* Credential status indicator */}
      <div className="shrink-0">
        {credStatus === "loading" ? (
          <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-text-muted" />
        ) : credStatus === "configured" ? (
          <CheckCircle2 size={14} strokeWidth={1.5} className="text-success-solid" />
        ) : (
          <AlertTriangle size={14} strokeWidth={1.5} className="text-warning-solid" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={`text-small font-medium truncate ${isActive ? "text-accent" : "text-foreground"}`}>
          {label}
        </p>
        <p className="text-micro font-technical text-text-muted truncate">
          {url} · {dbName}
        </p>
      </div>
    </button>
  );
}
