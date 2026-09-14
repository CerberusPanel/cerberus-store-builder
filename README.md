# Cerberus Store Builder

A Vue 3 + Electron desktop editor for building and versioning Cerberus public app-store JSON files.

## Desktop development

```bash
npm install
npm run dev:desktop
```

This starts Vite and launches the editor inside Electron. During development, release files are written to the project `output/` directory.

## Build the desktop app

Build for the operating system you are currently using:

```bash
npm run build:desktop
```

Or use a platform target:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

Electron Builder writes installers/packages to `dist-electron/`.

> In practice, macOS installers should be built on macOS. Windows and Linux targets may also have host/toolchain requirements depending on the target format and signing setup.

## Installed-app data

A packaged application writes releases to a user-writable location instead of its installation directory:

- Windows/macOS/Linux: `Documents/Cerberus Store Builder/output/`

Use **Output folder** in the sidebar, or **File → Open Output Folder**, to open it in the operating system file manager.

In development, the original project-local `output/` folder is used.

## Desktop features

- Standalone Electron application; no Vite/backend server required after packaging.
- Native application menu and desktop keyboard shortcuts.
- Desktop title bar and status bar.
- Light / System / Dark theme persistence.
- Local draft autosave and undo/redo history.
- Load latest release from the output directory.
- Versioned, minified backend-only release saving.
- Alpha, Beta and Public release channels.
- Searchable app sidebar.
- Logo upload/URL import with embedded 32×32, 64×64 and 128×128 PNG Base64 variants.
- Validation for IDs, URLs, ports and other structured fields.

## Web-only development

The original browser workflow is still available with:

```bash
npm run dev
```

In this mode Vite supplies the `/api` development middleware and release files use the project `output/` directory.
