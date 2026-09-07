import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { AuthProvider } from "@/hooks/use-auth";
import { SessionProvider } from "@/hooks/use-session";
import { OdooConfigProvider } from "@/hooks/use-odoo-config";
import { AudienceProvider } from "@/hooks/use-audience";
import { PinnedInsightsProvider } from "@/hooks/use-pinned-insights";
import { NotificationProvider } from "@/hooks/use-notifications";
import { ToastProvider } from "@/components/ui/error-toast";
import { LimitReachedModalProvider } from "@/hooks/use-limit-reached-modal";
import { LimitReachedModal } from "@/components/ui/limit-reached-modal";
import { ThemeInitializer } from "@/components/theme-initializer";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  display: "swap",
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var h=document.documentElement;var t=localStorage.getItem('theme');if(t==='dark'){h.classList.add('dark')}else{h.classList.remove('dark')};var a=localStorage.getItem('audience');if(a==='builder'){h.classList.remove('client');h.classList.add('builder')}else{h.classList.remove('builder');h.classList.add('client')}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${robotoMono.variable} antialiased`}
      >
        <NextIntlClientProvider>
          <AuthProvider>
            <SessionProvider>
              <ThemeInitializer />
              <OdooConfigProvider>
                {/* Sólo necesita el rol (de SessionProvider). Queda acá adentro para no
                    mover la pila; ya no depende de `isDemoMode`. */}
                <AudienceProvider>
                <ToastProvider>
                  <LimitReachedModalProvider>
                    <NotificationProvider>
                      <PinnedInsightsProvider>
                        {children}
                        <LimitReachedModal />
                      </PinnedInsightsProvider>
                    </NotificationProvider>
                  </LimitReachedModalProvider>
                </ToastProvider>
                </AudienceProvider>
              </OdooConfigProvider>
            </SessionProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
