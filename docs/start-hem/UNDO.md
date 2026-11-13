Ångra "start på hemskärmen" 2026-11-13 (hem1, t1584u)

- `TaxiData/index.html`: `showMenu()` använder `startView()` i stället för `LAZY.restoreView() || localStorage.getItem('taxi_view')`; `checkPassword()` sätter `sessionStorage.taxi_go_home` före `location.reload()`. Ångra: ta bort `isReload`/`startView` och flaggan, återställ raden `var savedView = LAZY.restoreView() || localStorage.getItem('taxi_view');`.
- Cache: `lazy-views.js` i `index.html` och `changelog.js` i `lazy-views.js` → `?v=20261113hem1`.
- Test: `tests/start-hem/unit.cjs`; `tests/lazy-views/dom.cjs` fick `opts.navType` (standard `reload`) och `opts.beforeScripts`.
- Backup: `backup/pre-start-hem-20261113`.
