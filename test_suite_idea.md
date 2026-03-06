## Proposed Test Harness For AI-Driven Static-PWA Validation

### Goals

- deterministic local execution
- no external services
- full browser coverage of launcher, PWA lifecycle, and per-app storage
- machine-readable outputs so AI agents can diagnose failures without manual repro

### Recommended Stack

- Playwright for browser automation
- a local static server for the built app
- a small Node-based contract test layer for manifests/registry/build artifacts
- Axe or Playwright accessibility snapshots for key screens

### Test Layers

1. Contract tests

- validate every app manifest schema
- verify manifest id/folder/entry/icon consistency
- verify the launcher can discover and render apps from registry/manifests without any launcher-side app allowlist
- verify each app HTML imports `theme-bootstrap.js` and `app-common.css`
- verify `registry/apps.json`, root `manifest.json`, and `service-worker.js` stay in sync
- verify no broken `aria-controls`/`aria-labelledby` links

2. Launcher smoke tests

- load launcher and assert all registered apps render
- verify search, category filter, sort, deep-link `?app=...`, open, close, and reload behavior
- verify keep-alive apps preserve runtime while returning home

3. Storage tests

- per app: create sample data, reload, confirm persistence
- launcher delete/reset/export/import flows
- explicit `IndexedDB` coverage for Notes
- deterministic storage cleanup between tests

4. PWA/offline tests

- service worker install and update flow
- offline navigation to launcher
- offline open of cached apps
- failed non-navigation asset fetches should fail cleanly, not return HTML

5. App-specific behavioral tests

- Pomodoro/Timer: fake time progression, backgrounding, wake-lock, and notification permission states
- Soundscape: stub `AudioContext` and assert resume/pause/restore behavior
- Mirror: stub `getUserMedia`, simulate permission denial, and verify cleanup of tracks
- Notes: paste sanitization, autosave, notebook moves, reorder, export, and backup/restore
- Kanban: mouse drag and touch drag reorder flows

### AI-Agent Friendly Harness Design

- Add a machine-readable app contract file, for example `registry/apps.contract.json`, with:
  - app id
  - storage backend types
  - backup/import/reset capability entrypoints
  - keep-alive behavior
  - required permissions
  - key user flows
- Add stable `data-testid` hooks to launcher controls and critical app interactions
- Emit structured artifacts on failure:
  - screenshot
  - console errors
  - network log
  - `localStorage` snapshot
  - `IndexedDB` summary
  - active service-worker version
- Keep a single command entrypoint, for example `npm run test:e2e`, so an AI agent does not need custom orchestration

### First Implementation Slice

Implement this in order:

1. contract/schema checks
2. launcher smoke tests
3. storage-contract export/import/reset coverage, starting with Notes
4. timer/pomodoro time-mocked tests
5. service-worker offline/update tests

That sequence will catch the most expensive regressions quickly while keeping the harness small enough for routine AI execution.
