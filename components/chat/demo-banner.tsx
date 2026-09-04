"use client";

import { Eye, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSession } from "@/hooks/use-session";
import { useOdooConfig } from "@/hooks/use-odoo-config";
import { instanceLabel } from "@/lib/instance-label";
import { useAudience } from "@/hooks/use-audience";

export function DemoBanner() {
  const t = useTranslations("Auth");
  const { user } = useAuth();
  const { meData } = useSession();
  const { activeConfig } = useOdooConfig();
  const { canPreviewAsClient, isPreviewingAsClient } = useAudience();

  // A logged-in user seeing the demo banner has no active connection → point them to setup.
  // No instance yet → onboarding gate (creates the first one); has an instance → load creds.
  const loggedIn = !!user;
  const hasInstance = (meData?.odoo_configs?.length ?? 0) > 0;

  const ctaHref = !loggedIn ? "/register" : hasInstance ? "/settings/odoo" : "/onboarding";
  const ctaText = loggedIn ? t("demoConnectOdoo") : t("demoSignUp");
  /**
   * ⚠️ El texto viejo decía "datos ficticios de una empresa distribuidora" — una
   * frase que describía LA instancia cuando había una sola. Con el parque hay una
   * agencia comercial en Austin, una consultora madrileña, un corralón rosarino y
   * la distribuidora: nombrar cuál estás mirando deja de ser un detalle y pasa a
   * ser el dato, porque cambiar de empresa es justo lo que el visitante va a hacer.
   */
  const demoName = instanceLabel(activeConfig);
  const bannerText = loggedIn
    ? t("demoBannerConnectOdoo")
    : demoName
      ? t("demoBannerNamed", { instance: demoName })
      : t("demoBanner");

  /**
   * ⭐ **"Verse a sí mismo desde el cliente"** (PLAN_INSTANCIAS/07, Idea 3).
   *
   * ⚠️ **El control NO vive acá** — vive en el sidebar (`AudiencePreviewToggle`), que es
   * el único lugar donde está, para implementadores logueados y visitantes del demo por
   * igual. Este cartel sólo lo SEÑALA: dos entradas al mismo estado son dos superficies
   * que mantener, y el descubrimiento se resuelve igual con una frase que con un segundo
   * botón. Cuando la vista previa está encendida, el cartel lo dice.
   */
  // Sin nombre resoluble se cae al texto normal del demo: inventar un "esta empresa"
  // acá sería un string hardcodeado en un idioma, en un producto de 11 locales.
  const previewBannerText = demoName
    ? t("previewAsClientBanner", { instance: demoName })
    : bannerText;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-warning-subtle px-4 py-2 text-small text-warning-solid shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Zap size={16} strokeWidth={1.5} className="shrink-0" />
        <span className="sm:hidden">{t("demoBannerShort")}</span>
        <span className="hidden sm:inline truncate">
          {isPreviewingAsClient ? previewBannerText : bannerText}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {canPreviewAsClient && !isPreviewingAsClient && (
          <span className="hidden items-center gap-1.5 opacity-90 lg:flex">
            <Eye size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>{t("previewAsClientHint")}</span>
          </span>
        )}
        <Link href={ctaHref} className="font-medium underline underline-offset-2 hover:no-underline">
          {ctaText}
        </Link>
      </div>
    </div>
  );
}
