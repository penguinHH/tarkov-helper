# Tarkov Helper

[简体中文](README.md) | **English** | [日本語](README.ja.md)

A desktop helper for Escape from Tarkov: interactive maps, item prices, task lookup and BTR route prediction. Built with Electron + Vue 3 + Leaflet; game data comes from the open data provided by [tarkov.dev](https://tarkov.dev).

## Download

Get the latest version from [Releases](https://github.com/penguinHH/tarkov-helper/releases/latest):

- `TarkovHelper-Setup-*.exe` — installer (choose the install folder, desktop shortcut, uninstaller included)
- `TarkovHelper-Portable-*.exe` — portable, just double-click to run

> The app is not code-signed. If Windows SmartScreen shows "Windows protected your PC" on first launch, click "More info → Run anyway". An internet connection is required for game data.

## Features

- **Dashboard** — Tarkov time (left/right), trader restock timers, latest Goons sightings
- **Interactive map** (same content as tarkov.dev)
  - Extracts (PMC / shared / Scav, extract zone on hover, switch and item requirements) and transits
  - Spawns: bosses (with spawn chance and portrait), PMC, Scav, sniper Scav
  - Tasks: possible quest item locations and objective zones; active tasks get their own highlighted layer
  - Landmarks: place names, BTR stops
  - Usable: locked doors/containers (with the required key and power requirement), switches (with what they trigger), stationary guns
  - Hazards: minefields, sniper zones, mortar zones (with outlines)
  - All lootable containers (by type) and loose loot (by item category, with item icons)
  - Floor switching (off-floor markers are dimmed; clicking one jumps to its floor), vector/satellite base map, search, cursor coordinates
- **Item prices** — lowest flea price / 24h average / 48h change, price per slot, trader buy and sell prices (with loyalty level and limits), selling advice, price history chart (7/30/90 days/all, with table view), favorites
- **Tasks** — search by name or objective, filter by trader, map, status and Kappa; detail pages show objectives, required keys, rewards, previous/next tasks, plus dialogue, objectives, rewards and guide from the EFT Wiki
- **Task progress** — accepted/completed/failed tasks are detected from the game logs (all past logs are scanned, tracked per server); you can also set them manually and jump from a task straight to its location on the map
- **BTR route prediction** (Woods, Streets) — raid clock (start time read automatically, or enter the time remaining), one-click calibration when you see the BTR arrive or leave a stop, predicted position and arrival times; calibrating two consecutive stops teaches the travel time of that segment and detects the direction. Results are estimates
- **Screenshot positioning** — take a screenshot in game and your position and heading appear on the map
- **Raid detection** — the current map, server and raid start time are read from the game logs and applied automatically
- **Three servers** — PVP / PVE / Season, switched automatically from the game logs
- **Languages** — 简体中文 / English / 日本語, chosen from your system language on first launch; game data uses tarkov.dev's translation for that language
- Falls back to cached data when the data source is unavailable

## Safety

- The app only reads screenshot file names and log text. **It does not read game memory or modify game files.**
- Base maps, map metadata and game data are fetched from tarkov.dev at runtime; none of it is bundled with this project.
- Wiki content is rebuilt from an allow-list of tags before display; the original page is never embedded.

## Development

Requires [Node.js](https://nodejs.org) 20 or later. If PowerShell blocks scripts, use `npm.cmd` instead of `npm`.

```bash
npm install
npm run dev      # development mode
npm run dist     # build installer and portable exe into dist/
```

### Project structure

```
src/main/         Electron main process: window, settings, screenshot/log watchers, task progress
src/preload/      Secure bridge (window.desktop)
src/renderer/     Vue UI
  src/api/          tarkov.dev data, map metadata, Wiki (cached)
  src/map/          coordinate conversion, floor detection, layers, BTR model, icons
  src/components/   layer panel, BTR panel, price chart
  src/i18n/         UI translations (zh / en / ja)
  src/views/        dashboard / map / prices / tasks / task detail / settings
```

### Packaging notes

On the first build, electron-builder extracts the winCodeSign toolkit. Two macOS symlinks inside it fail to extract on Windows unless Developer Mode is on. You can extract it manually into the cache (Windows builds don't need those two files):

```
7za x -y %LOCALAPPDATA%\electron-builder\Cache\winCodeSign\<number>.7z -o%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0
```

## License

The code of this project is released under the [MIT License](LICENSE). Third-party code, libraries and data are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the vector maps loaded at runtime are CC BY-NC-SA 4.0 and **may not be used commercially**.

This is an unofficial community tool and is not affiliated with Battlestate Games. Escape from Tarkov names, images and content are © Battlestate Games.
