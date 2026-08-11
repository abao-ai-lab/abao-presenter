# Architecture

ABAO Presenter is an Electron application with two isolated renderer windows and one main process.

## Components

### Controller renderer

`src/controller.jsx` owns source selection, device settings, teleprompter state, capture, `MediaRecorder`, and recording feedback. It cannot access Node.js directly and only uses methods exposed by `electron/preload-controller.cjs`.

### Stage renderer

`src/stage.jsx` renders the 3:4 video stage: whiteboard, local HTML iframe, images, camera overlay, and pointer effects. Its restricted bridge is defined in `electron/preload-stage.cjs`.

### Main process

`electron/main.cjs` creates both windows, validates local content paths, serves selected HTML on an ephemeral loopback port, coordinates state through IPC, and appends recording chunks to local files.

## Security boundaries

- `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` are enabled for both windows.
- Renderer access is limited to explicit preload bridge methods.
- The local content server binds only to `127.0.0.1` and stops when the app exits.
- Camera, microphone, and display-capture permissions are restricted to trusted top-level app pages.
- Imported HTML runs in a sandboxed iframe, cannot open new application windows, and cannot escape its selected directory through symlinks.
- Application pages define a restrictive Content Security Policy.
- User-selected HTML remains active content and should be treated as trusted input.

## Recording pipeline

1. The controller requests capture of the stage window through Electron's display media handler.
2. An optional microphone track is added to the stage video track.
3. `MediaRecorder` selects native MP4 when Chromium reports support, otherwise WebM.
4. One-second chunks cross the preload bridge and are appended by the main process.
5. Stopping finalizes the session and reports the saved local path.

## Packaging

`npm run dist:mac` uses the Electron runtime already installed in `node_modules`, ad-hoc signs the app, and creates DMG/ZIP artifacts with native macOS tools. Tagged GitHub releases build both Apple Silicon and Intel packages in Actions.
