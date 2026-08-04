# Duoscribe

A lightweight markdown viewer/editor with side-by-side raw and rendered panes, built with Electron.

![platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## Features

- Side-by-side raw / rendered markdown panes with a draggable, resizable split
- Tabs for multiple open files, folder sidebar with file tree
- Find & replace, synced scrolling, auto-reload on external file changes
- Export rendered output, recent files, `.md`/`.markdown` file association

## Install

Download the latest build for your platform from the [Releases page](https://github.com/ayushabhijeet/duoscribe/releases/latest).

### macOS

1. Download the right `.dmg` for your Mac:
   - Apple Silicon (M1/M2/M3/M4): `Duoscribe-<version>-arm64.dmg`
   - Intel: `Duoscribe-<version>.dmg`

   Not sure which chip you have? Apple menu → About This Mac → look for "Chip".

2. Open the `.dmg` and drag **Duoscribe** into the **Applications** folder.
3. The app is unsigned (no Apple Developer certificate), so on first launch macOS Gatekeeper will refuse to open it via double-click. Instead:
   - Right-click (or Control-click) **Duoscribe.app** in Applications → **Open** → confirm **Open** in the dialog.
   - You only need to do this once; after that it opens normally.

### Windows

1. Download `Duoscribe Setup <version>.exe` from the Releases page.
2. Run the installer. Since the app isn't code-signed, Windows SmartScreen may show "Windows protected your PC":
   - Click **More info** → **Run anyway**.
3. Follow the installer prompts. Duoscribe will be available from the Start menu and registered as a handler for `.md`/`.markdown` files.

## Building from source

Requires Node.js 18+ and npm.

```bash
npm install
npm start          # run in development
npm run dist:mac   # build macOS dmg (current arch only; pass --x64/--arm64 to target one)
npm run dist:win   # build Windows installer (nsis, x64 + arm64)
```

Build output is written to `dist/`.

## License

[MIT](LICENSE)
