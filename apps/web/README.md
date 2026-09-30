# Sidelore web and desktop UI

`npm run web` serves the React public browser. `npm run desktop` uses the same
components with a restricted local IPC bridge. Public web mode can browse,
search and share approved topics; only local desktop mode provides research,
publication preview, grants, vault backup and network controls.

New identities and signing are never created in browser storage. The legacy
IndexedDB identity reader exists only for verified migration. The original
browser exports an encrypted migration file and retains its old key until the
desktop's signed receipt has been verified.

The standalone root `index.html`/`app.js` remain an empty offline prototype;
they do not implement the network client or ship research data. Production
assets are in `dist/web` after `npm run build:web`. Only the reviewed manifest
and service worker are copied from `public/`; arbitrary local files are excluded.
`npm run web:static` serves only the built application, never the project root.
