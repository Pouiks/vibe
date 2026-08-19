# ATOUTE — PWA / Favicon pack

Couleur principale : `#FF684F`
Fond principal : `#FFFFFF`

## Contenu

- `favicon.ico` : favicon multi-résolution 16/32/48 px
- `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`
- `apple-touch-icon.png` : 180x180, version fond corail / symbole blanc
- `icons/icon-*.png` : icônes PWA standards de 72 à 512 px
- `icons/maskable-192x192.png` et `maskable-512x512.png` : Android / PWA maskable
- `icons/icon-monochrome-512.png` : version monochrome
- `source/ATOUTE-mark.svg` : source vectorielle transparente
- `source/ATOUTE-mark-white-bg.svg` : source vectorielle sur fond blanc
- `source/ATOUTE-mark-1024.png` : master raster
- `manifest.webmanifest` : manifest PWA
- `browserconfig.xml` : compatibilité tuiles Microsoft
- `head-tags.html` : balises à copier dans le `<head>`

## Installation rapide

Copier le contenu du pack dans le dossier public/statique du projet en conservant les chemins.
Puis ajouter le contenu de `head-tags.html` au `<head>` de l'application.

### Next.js App Router

Place les fichiers dans `/public`.
Le navigateur servira alors automatiquement `/favicon.ico`, `/manifest.webmanifest`, `/icons/...`, etc.

Tu peux aussi déclarer dans `app/layout.tsx` :

```ts
export const metadata = {
  title: 'ATOUTE',
  manifest: '/manifest.webmanifest',
  themeColor: '#FF684F',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};
```

## Remarque

Les icônes `maskable` utilisent un fond corail plein et un symbole blanc réduit pour rester dans la zone de sécurité Android, tandis que les icônes standards conservent le symbole corail sur fond blanc.
