// Post-traitement de l'export web (npx expo export -p web) pour en faire une PWA installable :
//  - génère dist/sw.js (service worker : pré-cache de tous les fichiers exportés, hors-ligne)
//  - copie index.html -> 404.html (routage SPA sur GitHub Pages)
//  - ajoute .nojekyll (GitHub Pages ignore sinon le dossier _expo)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html introuvable — lancez d’abord `npx expo export -p web`.');
  process.exit(1);
}
const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
const base = (app.experiments?.baseUrl ?? '').replace(/\/$/, '');

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p).split('\\').join('/'));
  }
})(dist);

const precache = files.filter((f) => !/(^|\/)(sw\.js|404\.html|metadata\.json|\.nojekyll)$/.test(f) && !f.endsWith('.map'));
const hash = createHash('sha256');
for (const f of precache) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);
const urls = [base + '/', ...precache.map((f) => `${base}/${f}`)];

const sw = `/* Service worker généré par scripts/pwa-postbuild.mjs — version ${version} */
const CACHE = '${app.slug}-${version}';
const BASE = '${base}';
const PRECACHE = ${JSON.stringify(urls)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Réseau d'abord pour les pages, repli hors-ligne sur l'app (SPA)
    e.respondWith(fetch(req).catch(() => caches.match(BASE + '/index.html').then((r) => r || caches.match(BASE + '/'))));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
`;
writeFileSync(join(dist, 'sw.js'), sw);
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));
writeFileSync(join(dist, '.nojekyll'), '');
console.log(`PWA prête : ${precache.length} fichiers pré-cachés (version ${version}), base « ${base || '/'} ».`);
