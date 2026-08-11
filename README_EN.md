# ABAO Presenter

ABAO Presenter is a local-first vertical presentation recorder for whiteboards, interactive HTML, images, camera overlays, and teleprompter workflows.

It uses two windows: a clean 3:4 stage that appears in the final video, and a private controller for sources, devices, prompts, and recording status. Media stays on your computer and no account is required.

## Highlights

- 1080 × 1440, 30 FPS vertical recording workflow
- Lightweight whiteboard with pen, eraser, text, undo, and draft recovery
- Local interactive HTML with adjacent assets
- PNG, JPG, WebP, and GIF sources
- Draggable camera overlay with shape and size controls
- Pointer emphasis and click ripples
- Private teleprompter with smooth auto-scroll
- Chunked local recording with native MP4 when available and WebM fallback

## Install

Download the appropriate macOS package from [GitHub Releases](https://github.com/abao-ai-lab/abao-presenter/releases). The current public beta is not Apple-notarized; if Gatekeeper blocks the first launch, right-click the app in Finder and choose **Open**.

## Development

Node.js 20+ and macOS are recommended.

```bash
git clone https://github.com/abao-ai-lab/abao-presenter.git
cd abao-presenter
npm ci
npm start
```

Run validation with `npm run check`, or create an Apple Silicon package with `npm run dist:mac`.

See [README.md](README.md) for the full documentation, [PRIVACY.md](PRIVACY.md) for the privacy model, and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE)
