import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Which chunk a dependency lands in. Before this every dependency went into
// one 3.3 MB entry file, so the sign-in screen waited on the whole app and
// every release invalidated all of it. Each vendor below is its own file:
// one that is not needed on the signed-out screen is never fetched there,
// and one that did not change between releases keeps its hash and stays in
// the browser's cache (server/index.ts serves /assets/* as immutable).
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  const match = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)(?:\/([^/]+))?/);
  if (!match) return undefined;
  const pkg = match[1];
  const sub = match[2] ?? '';
  if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'react';
  // The `firebase/<product>` wrappers go with the product they re-export, so
  // no chunk has to wait on another in a circle.
  if (pkg === 'firebase') {
    if (sub === 'firestore') return 'firebase-firestore';
    if (sub === 'auth') return 'firebase-auth';
    if (sub === 'app-check') return 'firebase-app-check';
    if (sub === 'messaging') return 'firebase-messaging';
    return 'firebase-app';
  }
  if (pkg === '@firebase/firestore' || pkg === '@firebase/webchannel-wrapper')
    return 'firebase-firestore';
  if (pkg === '@firebase/auth') return 'firebase-auth';
  if (pkg === '@firebase/app-check') return 'firebase-app-check';
  if (pkg === '@firebase/messaging' || pkg === '@firebase/installations')
    return 'firebase-messaging';
  if (pkg.startsWith('@firebase/') || pkg === 'idb' || pkg === 'tslib') return 'firebase-app';
  if (pkg.startsWith('i18next') || pkg === 'react-i18next') return 'i18n';
  if (pkg === 'lucide-react') return 'lucide';
  if (pkg === 'recharts' || pkg.startsWith('d3-') || pkg === 'victory-vendor' || pkg === 'd3')
    return 'charts';
  if (pkg === 'motion' || pkg === 'framer-motion' || pkg.startsWith('motion-')) return 'motion';
  if (pkg === '@revenuecat/purchases-js') return 'revenuecat';
  if (pkg === 'exceljs') return 'exceljs';
  if (pkg === '@heycatch/sdk') return 'heycatch';
  return undefined;
}

// A modulepreload for the entry chunk itself. Vite preloads the chunks the
// entry imports, and the entry is found by the preload scanner from its script
// tag, but a module script is fetched at low priority until the parser reaches
// it; the explicit preload lets the browser fetch it at once.
function preloadEntry(): Plugin {
  return {
    name: 'preload-entry',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const entry = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
        if (!entry) return html;
        return html.replace(
          entry[0],
          `<link rel="modulepreload" crossorigin href="${entry[1]}" />\n    ${entry[0]}`
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadEntry()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // The three languages are separate files too: English ships with
          // the entry, the other two are fetched on demand (src/i18n.ts).
          const locale = id.match(/\/src\/locales\/([a-z]{2})\//);
          if (locale) return `locale-${locale[1]}`;
          return vendorChunk(id);
        },
      },
    },
  },
});
