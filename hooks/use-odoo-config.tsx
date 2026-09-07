"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { OdooConfigSummary, OdooConfigSummaryWithCreds, OdooCredentialSummary } from "@/lib/types";
import { useSession } from "@/hooks/use-session";
import { fetchAllMyCredentials } from "@/lib/api";

interface OdooConfigContextType {
  configs: OdooConfigSummaryWithCreds[];
  activeConfig: OdooConfigSummaryWithCreds | null;
  activeConfigId: string | null;
  setActiveConfigId: (id: string) => void;
  isConfigured: boolean;
  isDemoMode: boolean;
  // Legacy compat: expose a minimal OdooConfig-like object for components
  // still reading url/db for display purposes (e.g. Settings form, Inspector)
  config: { url: string; db: string; login: string; apiKey: string } | null;
}

const OdooConfigContext = createContext<OdooConfigContextType | null>(null);

export function useOdooConfig() {
  const ctx = useContext(OdooConfigContext);
  if (!ctx) throw new Error("useOdooConfig must be used within OdooConfigProvider");
  return ctx;
}

function enrichConfigs(
  configs: OdooConfigSummary[],
  credentials: OdooCredentialSummary[]
): OdooConfigSummaryWithCreds[] {
  return configs.map((c) => {
    const cred = credentials.find((cr) => cr.config_id === c.id);
    return { ...c, hasCredentials: !!cred, odoo_username: cred?.odoo_username };
  });
}

export function OdooConfigProvider({ children }: { children: React.ReactNode }) {
  const { meData } = useSession();
  const ownConfigs = meData?.odoo_configs ?? [];
  /**
   * Las instancias del parque (PLAN_INSTANCIAS/05). Entran a la lista **sólo cuando
   * no hay propias usables**: para un implementador con clientes de verdad
   * conectados, mezclarle "Casa Mendieta" entre sus cuentas es ruido, y encima
   * ruido peligroso — la pregunta más cara de contestar mal del producto es sobre
   * qué base estoy trabajando.
   *
   * Cuando no hay propias, en cambio, son TODA la lista, y es justamente lo que D7
   * quiere mostrar: el visitante no elige "una empresa de un desplegable", entra a
   * una cuenta que ya tiene varios clientes conectados y los cambia como los va a
   * cambiar de verdad.
   */
  const demoConfigs = meData?.demo_instances ?? [];
  const isClientUser = meData?.user?.role === "CLIENT_USER";
  const hasOwnUsable = ownConfigs.some((c) => c.connection_status === "active");
  const rawConfigs = hasOwnUsable ? ownConfigs : [...ownConfigs, ...demoConfigs];

  const [credentials, setCredentials] = useState<OdooCredentialSummary[]>([]);
  const [activeConfigId, setActiveConfigIdState] = useState<string | null>(null);

  // A config is "chat-ready" only when the caller's own Connection is active
  // (a complete instance: url + db + username + apikey). Authoritative + synchronous from /me.
  const usableConfigs = rawConfigs.filter((c) => c.connection_status === "active");
  // Signature so selection re-runs when configs OR their connection status change.
  const configsSig = rawConfigs.map((c) => `${c.id}:${c.connection_status ?? ""}`).join(",");

  // Load credentials once for username display / enrichment (not for selection).
  useEffect(() => {
    if (!meData?.user) return;
    fetchAllMyCredentials().then((result) => {
      if (result.success && result.credentials) setCredentials(result.credentials);
    });
  }, [meData?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choose the active config. No complete instance → stay in demo (admins/anonymous);
  // a CLIENT_USER with a non-active config keeps it so they see the load-creds / invalid state.
  useEffect(() => {
    if (usableConfigs.length === 0) {
      if (!isClientUser || rawConfigs.length === 0) {
        // ⚠️ El literal `"demo"` queda SÓLO como último recurso: es el alias de
        // compatibilidad que el backend resuelve a la instancia pública de menor
        // `demo_order`. Mientras haya catálogo preferimos su UUID, porque es lo que
        // hace que el chat quede estampado contra una instancia concreta y que el
        // historial lateral se pueda filtrar por cliente.
        setActiveConfigIdState(demoConfigs[0]?.id ?? "demo");
      } else {
        setActiveConfigIdState(rawConfigs[0].id);
      }
      return;
    }

    const stored = typeof window !== "undefined"
      ? localStorage.getItem("odoo_active_config_id")
      : null;

    // Honor a stored choice only if it still points to a usable config; otherwise
    // fall to the first usable one (ignores a stale "demo" once a real instance exists).
    if (stored && usableConfigs.some((c) => c.id === stored)) {
      setActiveConfigIdState(stored);
    } else {
      setActiveConfigIdState(usableConfigs[0].id);
    }
  }, [configsSig, isClientUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveConfigId = useCallback((id: string) => {
    setActiveConfigIdState(id);
    try { localStorage.setItem("odoo_active_config_id", id); } catch { /* ignore */ }
  }, []);

  const configs = enrichConfigs(rawConfigs, credentials);
  const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;
  /**
   * ⚠️ **Por dato, no por literal.** Con el parque hay cuatro instancias de demo y
   * `activeConfigId === "demo"` sólo reconocería una de ellas — las otras tres se
   * comportarían como la instancia de un cliente real (sin cartel de demo, con el
   * botón de guardar Rutina, ofreciendo refrescar un pin contra una base que se
   * restaura sola). El literal se sigue aceptando porque es el alias que el backend
   * resuelve cuando todavía no hay catálogo cargado.
   */
  const isDemoMode = activeConfig?.is_demo === true || activeConfigId === "demo";
  const isConfigured = isDemoMode || activeConfig !== null;

  const config = activeConfig
    ? { url: activeConfig.url, db: activeConfig.db_name, login: activeConfig.odoo_username ?? "", apiKey: "" }
    : null;

  return (
    <OdooConfigContext.Provider value={{ configs, activeConfig, activeConfigId, setActiveConfigId, isConfigured, isDemoMode, config }}>
      {children}
    </OdooConfigContext.Provider>
  );
}
