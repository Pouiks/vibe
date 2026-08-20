import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const APP_DESCRIPTION =
  "L'app sociale de proximité : scanne le QR code d'un spot (terrain, bar, parc…), discute avec les gens sur place et organise des events.";

export const metadata: Metadata = {
  metadataBase: new URL('https://atoute.app'),
  title: {
    default: 'ATOUTE — Le chat des gens sur place',
    template: '%s | ATOUTE',
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ATOUTE",
  },
  openGraph: {
    type: 'website',
    url: 'https://atoute.app',
    siteName: 'ATOUTE',
    title: 'ATOUTE — Le chat des gens sur place',
    description: APP_DESCRIPTION,
    locale: 'fr_FR',
    images: [{ url: '/icons/icon-512x512.png', width: 512, height: 512, alt: 'ATOUTE' }],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// Données structurées pour le référencement (Google : type d'app, gratuité)
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'ATOUTE',
  url: 'https://atoute.app',
  description: APP_DESCRIPTION,
  applicationCategory: 'SocialNetworkingApplication',
  operatingSystem: 'Any',
  inLanguage: 'fr',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen antialiased`}>
        {/* Applique le thème choisi avant le premier rendu (dark par défaut) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('atoute_theme')==='light')document.documentElement.classList.add('light')}catch(e){}`,
          }}
        />
        {/* Échappement anti-XSS recommandé par la doc Next : aucun '<' brut */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
        />
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
