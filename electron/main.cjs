const { app, BrowserWindow, dialog, ipcMain, screen, session, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

app.setName("ABAO Presenter");

let controllerWindow;
let stageWindow;
let contentServer;
const recordingSessions = new Map();
let currentScene = { type: "whiteboard", title: "白板" };
let currentSettings = {
  cameraId: "",
  cameraEnabled: false,
  pointerEffects: true,
  bubbleSize: 176,
  bubbleShape: "rounded",
  background: "studio-mist"
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (controllerWindow && !controllerWindow.isDestroyed()) {
      controllerWindow.show();
      controllerWindow.focus();
    }
    if (stageWindow && !stageWindow.isDestroyed()) stageWindow.show();
  });
}

const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, "dist");

function sendToController(channel, payload) {
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.webContents.send(channel, payload);
  }
}

function sendToStage(channel, payload) {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.webContents.send(channel, payload);
  }
}

function createWindows() {
  const { height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  const stageHeight = Math.min(960, Math.max(720, workAreaHeight - 80));
  const stageWidth = Math.round(stageHeight * 3 / 4);

  stageWindow = new BrowserWindow({
    title: "ABAO Presenter · 演示画面",
    width: stageWidth,
    height: stageHeight,
    useContentSize: true,
    minWidth: 540,
    minHeight: 720,
    backgroundColor: "#e9e8f4",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-stage.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  stageWindow.setAspectRatio(3 / 4);

  controllerWindow = new BrowserWindow({
    title: "ABAO Presenter",
    width: 520,
    height: 920,
    minWidth: 440,
    minHeight: 760,
    backgroundColor: "#090d18",
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-controller.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  stageWindow.loadFile(path.join(distRoot, "stage.html"));
  controllerWindow.loadFile(path.join(distRoot, "controller.html"));

  for (const window of [stageWindow, controllerWindow]) {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  }

  stageWindow.once("ready-to-show", () => stageWindow?.show());
  controllerWindow.once("ready-to-show", () => controllerWindow?.show());

  stageWindow.on("show", () => sendToController("controller:stage-visibility", true));
  stageWindow.on("hide", () => sendToController("controller:stage-visibility", false));

  stageWindow.on("closed", () => {
    stageWindow = null;
    if (controllerWindow && !controllerWindow.isDestroyed()) controllerWindow.close();
  });
  controllerWindow.on("closed", () => {
    controllerWindow = null;
    if (stageWindow && !stageWindow.isDestroyed()) stageWindow.close();
  });
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf"
  })[ext] || "application/octet-stream";
}

const cursorScript = String.raw`
(() => {
  if (window.__abaoCursorInstalled) return;
  window.__abaoCursorInstalled = true;
  const style = document.createElement('style');
  style.textContent = [
    '.abao-pointer-dot{position:fixed;left:0;top:0;width:18px;height:18px;border:3px solid #3977ff;background:rgba(57,119,255,.18);border-radius:50%;pointer-events:none;z-index:2147483646;transform:translate(-50%,-50%);transition:width .12s,height .12s,background .12s;box-shadow:0 0 0 2px rgba(255,255,255,.9)}',
    '.abao-pointer-dot.down{width:30px;height:30px;background:rgba(57,119,255,.42)}',
    '.abao-click-ripple{position:fixed;width:22px;height:22px;border:4px solid #3977ff;border-radius:50%;pointer-events:none;z-index:2147483645;transform:translate(-50%,-50%);animation:abao-ripple .55s ease-out forwards}',
    '@keyframes abao-ripple{to{width:72px;height:72px;opacity:0}}'
  ].join('');
  document.head.appendChild(style);
  const dot = document.createElement('div');
  dot.className = 'abao-pointer-dot';
  document.body.appendChild(dot);
  document.addEventListener('pointermove', e => {
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
  }, true);
  document.addEventListener('pointerdown', e => {
    dot.classList.add('down');
    const ripple = document.createElement('div');
    ripple.className = 'abao-click-ripple';
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  }, true);
  document.addEventListener('pointerup', () => dot.classList.remove('down'), true);
})();
`;

const layoutAssistScript = String.raw`
(() => {
  if (window.__abaoLayoutAssistInstalled) return;
  window.__abaoLayoutAssistInstalled = true;

  const selector = 'h1,h2,h3,[class*="title" i],[class*="headline" i]';
  const isCjk = (value) => /[\u3400-\u9fff\uf900-\ufaff]/.test(value);

  function lineGroups(textNode) {
    const groups = [];
    const text = textNode.nodeValue || '';
    for (let index = 0; index < text.length; index += 1) {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      let group = groups.find((item) => Math.abs(item.top - rect.top) < 2);
      if (!group) {
        group = { top: rect.top, text: '' };
        groups.push(group);
      }
      group.text += text[index];
    }
    return groups.sort((a, b) => a.top - b.top);
  }

  function fitOrphanedTitle(element) {
    const textNodes = [...element.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()
    );
    if (textNodes.length !== 1 || [...element.children].some((child) => getComputedStyle(child).display !== 'inline')) return;

    const text = (element.textContent || '').trim();
    if (!text || text.length > 42 || text.includes('\n')) return;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.fontSize) < 18) return;

    const groups = lineGroups(textNodes[0]);
    if (groups.length < 2) return;
    const lastLine = groups.at(-1).text.replace(/\s/g, '');
    if (lastLine.length > 2 || !isCjk(lastLine)) return;

    const originalFontSize = parseFloat(style.fontSize);
    const originalWhiteSpace = element.style.whiteSpace;
    element.style.whiteSpace = 'nowrap';
    const availableWidth = element.clientWidth;
    const neededWidth = element.scrollWidth;
    if (!availableWidth || !neededWidth) {
      element.style.whiteSpace = originalWhiteSpace;
      return;
    }

    const fittedFontSize = Math.max(
      originalFontSize * 0.82,
      originalFontSize * availableWidth / neededWidth * 0.985
    );
    element.style.fontSize = fittedFontSize + 'px';
    if (element.scrollWidth > element.clientWidth + 1) {
      element.style.fontSize = originalFontSize + 'px';
      element.style.whiteSpace = originalWhiteSpace;
      element.style.wordBreak = 'keep-all';
    }
  }

  function repairLayout() {
    document.querySelectorAll(selector).forEach(fitOrphanedTitle);
  }

  const start = () => {
    repairLayout();
    setTimeout(repairLayout, 120);
    setTimeout(repairLayout, 500);
    new MutationObserver(() => requestAnimationFrame(repairLayout)).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
`;

function safeTarget(root, requestPath, entryName) {
  let decoded = decodeURIComponent(requestPath || "/");
  if (decoded === "/") decoded = `/${entryName}`;
  const relative = decoded.replace(/^\/+/, "");
  const target = path.resolve(root, relative);
  const rootPrefix = `${path.resolve(root)}${path.sep}`.toLowerCase();
  if (target.toLowerCase() !== path.resolve(root).toLowerCase() && !target.toLowerCase().startsWith(rootPrefix)) {
    return null;
  }
  return target;
}

function resolveExistingTarget(root, target) {
  try {
    const realRoot = fs.realpathSync(root);
    const realTarget = fs.realpathSync(target);
    const rootPrefix = `${realRoot}${path.sep}`.toLowerCase();
    const normalizedTarget = realTarget.toLowerCase();
    if (normalizedTarget !== realRoot.toLowerCase() && !normalizedTarget.startsWith(rootPrefix)) return null;
    return realTarget;
  } catch {
    return null;
  }
}

async function startContentServer(entryFile) {
  if (contentServer) {
    await new Promise((resolve) => contentServer.close(resolve));
    contentServer = null;
  }

  const root = path.dirname(entryFile);
  const entryName = path.basename(entryFile);
  contentServer = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/__abao_cursor.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(cursorScript);
      return;
    }
    if (url.pathname === "/__abao_layout_assist.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(layoutAssistScript);
      return;
    }

    let target = safeTarget(root, url.pathname, entryName);
    if (!target) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
    target = resolveExistingTarget(root, target);
    if (!target || !fs.statSync(target).isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const mime = mimeFor(target);
    if (mime.startsWith("text/html")) {
      let html = fs.readFileSync(target, "utf8");
      const injection = '<script src="/__abao_cursor.js"></script><script src="/__abao_layout_assist.js"></script>';
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
      res.end(html);
      return;
    }

    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
    fs.createReadStream(target).pipe(res);
  });

  await new Promise((resolve, reject) => {
    contentServer.once("error", reject);
    contentServer.listen(0, "127.0.0.1", resolve);
  });
  const address = contentServer.address();
  return `http://127.0.0.1:${address.port}/${encodeURIComponent(entryName)}`;
}

function recordingsDir() {
  const dir = app.isPackaged
    ? path.join(app.getPath("videos"), "ABAO Presenter")
    : path.join(projectRoot, "recordings");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

function normalizeRecordingProfile(profile) {
  const extension = profile?.extension === "mp4" ? "mp4" : "webm";
  const mimeType = typeof profile?.mimeType === "string" ? profile.mimeType.slice(0, 120) : "";
  return { extension, mimeType };
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const isAppWindow = [controllerWindow, stageWindow].some(
      (window) => window && !window.isDestroyed() && window.webContents.id === webContents.id
    );
    const requestingUrl = details?.requestingUrl || details?.requestingOrigin || webContents.getURL();
    let isTrustedMainFrame = details?.isMainFrame !== false;
    try {
      isTrustedMainFrame = isTrustedMainFrame && new URL(requestingUrl).protocol === "file:";
    } catch {
      isTrustedMainFrame = false;
    }
    const allowed = isAppWindow
      && isTrustedMainFrame
      && ["media", "display-capture", "fullscreen"].includes(permission);
    callback(allowed);
  });

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    if (stageWindow && !stageWindow.isDestroyed()) {
      callback({ video: stageWindow.webContents.mainFrame });
    } else {
      callback({});
    }
  });

  createWindows();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (contentServer) contentServer.close();
});

ipcMain.handle("content:open-html", async () => {
  const result = await dialog.showOpenDialog(controllerWindow, {
    title: "选择要演示的 HTML 文件",
    properties: ["openFile"],
    filters: [{ name: "HTML 页面", extensions: ["html", "htm"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const url = await startContentServer(filePath);
  currentScene = { type: "html", title: path.basename(filePath), url, filePath };
  sendToStage("stage:scene", currentScene);
  sendToController("controller:scene", currentScene);
  stageWindow.show();
  stageWindow.focus();
  return currentScene;
});

ipcMain.handle("content:open-image", async () => {
  const result = await dialog.showOpenDialog(controllerWindow, {
    title: "选择要展示的图片",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  currentScene = { type: "image", title: path.basename(filePath), url: `file:///${filePath.replace(/\\/g, "/")}`, filePath };
  sendToStage("stage:scene", currentScene);
  sendToController("controller:scene", currentScene);
  stageWindow.show();
  stageWindow.focus();
  return currentScene;
});

ipcMain.handle("content:show-whiteboard", () => {
  currentScene = { type: "whiteboard", title: "白板" };
  sendToStage("stage:scene", currentScene);
  sendToController("controller:scene", currentScene);
  stageWindow.show();
  stageWindow.focus();
  return currentScene;
});

ipcMain.handle("stage:show", () => {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.show();
    stageWindow.focus();
  }
  return true;
});

ipcMain.handle("stage:toggle", () => {
  if (!stageWindow || stageWindow.isDestroyed()) return { visible: false };
  if (stageWindow.isVisible()) {
    stageWindow.hide();
  } else {
    stageWindow.show();
    stageWindow.focus();
  }
  return { visible: stageWindow.isVisible() };
});

ipcMain.handle("stage:get-visibility", () => ({
  visible: Boolean(stageWindow && !stageWindow.isDestroyed() && stageWindow.isVisible())
}));

ipcMain.on("stage:settings", (_event, settings) => {
  currentSettings = { ...currentSettings, ...settings };
  sendToStage("stage:settings", currentSettings);
});

ipcMain.on("stage:devices", (_event, devices) => sendToController("controller:devices", devices));
ipcMain.on("stage:status", (_event, status) => sendToController("controller:stage-status", status));
ipcMain.on("stage:ready", () => {
  sendToStage("stage:scene", currentScene);
  sendToStage("stage:settings", currentSettings);
});

ipcMain.handle("recording:start", (_event, profile) => {
  const dir = recordingsDir();
  const format = normalizeRecordingProfile(profile);
  const base = `ABAO-Presenter-${timestamp()}`;
  const filePath = path.join(dir, `${base}.${format.extension}`);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(filePath, Buffer.alloc(0));
  recordingSessions.set(id, { filePath, ...format });
  return { ok: true, id, path: filePath, format: format.extension };
});

ipcMain.handle("recording:append", (_event, payload) => {
  const recording = recordingSessions.get(payload?.id);
  if (!recording) return { ok: false, error: "录制会话不存在" };
  fs.appendFileSync(recording.filePath, Buffer.from(payload.bytes));
  return { ok: true };
});

ipcMain.handle("recording:finish", (_event, id) => {
  const recording = recordingSessions.get(id);
  if (!recording) return { ok: false, error: "录制会话不存在" };
  recordingSessions.delete(id);
  const size = fs.existsSync(recording.filePath) ? fs.statSync(recording.filePath).size : 0;
  return {
    ok: size > 0,
    path: size > 0 ? recording.filePath : null,
    format: recording.extension,
    size,
    error: size > 0 ? "" : "录制文件为空"
  };
});

ipcMain.handle("recording:cancel", (_event, id) => {
  const recording = recordingSessions.get(id);
  if (!recording) return { ok: true };
  recordingSessions.delete(id);
  const size = fs.existsSync(recording.filePath) ? fs.statSync(recording.filePath).size : 0;
  if (!size) {
    try { fs.unlinkSync(recording.filePath); } catch {
      // A locked or already-removed empty recovery file can be safely ignored.
    }
  }
  return { ok: true, recoveryPath: size ? recording.filePath : null };
});

ipcMain.handle("recordings:open-folder", async () => {
  const dir = recordingsDir();
  const error = await shell.openPath(dir);
  return { ok: !error, error };
});
