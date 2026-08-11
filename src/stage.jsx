import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CameraOff,
  Eraser,
  PenTool,
  Trash2,
  Type,
  Undo2
} from "lucide-react";
import "./stage.css";

const initialSettings = {
  cameraId: "",
  cameraEnabled: false,
  pointerEffects: true,
  bubbleSize: 176,
  bubbleShape: "rounded",
  background: "studio-mist"
};

const boardStorageKey = "abao-whiteboard-draft";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function Whiteboard() {
  const canvasRef = useRef(null);
  const textInputRef = useRef(null);
  const drawingRef = useRef(false);
  const historyRef = useRef([]);
  const didRestoreRef = useRef(false);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#182235");
  const [lineWidth, setLineWidth] = useState(5);
  const [textEditor, setTextEditor] = useState(null);

  const prepareContext = useCallback((canvas) => {
    const context = canvas.getContext("2d");
    context.lineCap = "round";
    context.lineJoin = "round";
    return context;
  }, []);

  function pointFor(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  const persistBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      localStorage.setItem(boardStorageKey, canvas.toDataURL("image/png"));
    } catch {
      // localStorage may be unavailable or full; recording must remain usable.
    }
  }, []);

  function saveSnapshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current = [...historyRef.current.slice(-19), canvas.toDataURL("image/png")];
  }

  function beginStroke(event) {
    if (event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (tool === "text") {
      const rect = canvas.getBoundingClientRect();
      setTextEditor({
        x: clamp(event.clientX - rect.left, 12, Math.max(12, rect.width - 292)),
        y: clamp(event.clientY - rect.top, 78, Math.max(78, rect.height - 130)),
        value: ""
      });
      return;
    }
    saveSnapshot();
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const context = prepareContext(canvas);
    const point = pointFor(event, canvas);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function drawStroke(event) {
    if (!drawingRef.current || tool === "text") return;
    const canvas = canvasRef.current;
    const context = prepareContext(canvas);
    const point = pointFor(event, canvas);
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = color;
    context.lineWidth = (tool === "eraser" ? lineWidth * 4 : lineWidth) * scale;
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function endStroke(event) {
    if (drawingRef.current) persistBoard();
    drawingRef.current = false;
    try { canvasRef.current?.releasePointerCapture(event.pointerId); } catch {}
  }

  const restoreSnapshot = useCallback((dataUrl, shouldPersist = true) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl) return;
    const image = new Image();
    image.onload = () => {
      const context = prepareContext(canvas);
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (shouldPersist) persistBoard();
    };
    image.src = dataUrl;
  }, [persistBoard, prepareContext]);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop();
    if (snapshot) restoreSnapshot(snapshot);
  }, [restoreSnapshot]);

  function clearBoard() {
    const canvas = canvasRef.current;
    if (!canvas || !window.confirm("确定要清空当前白板吗？")) return;
    saveSnapshot();
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    persistBoard();
  }

  function drawWrappedText(context, text, startX, startY, maxWidth, fontSize, scale) {
    const lineHeight = fontSize * 1.45 * scale;
    let y = startY;
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const character of paragraph || " ") {
        const candidate = line + character;
        if (line && context.measureText(candidate).width > maxWidth) {
          context.fillText(line, startX, y);
          line = character;
          y += lineHeight;
        } else {
          line = candidate;
        }
      }
      if (line.trim()) context.fillText(line, startX, y);
      y += lineHeight;
    }
  }

  function commitText() {
    const value = textEditor?.value?.trim();
    const canvas = canvasRef.current;
    if (!value || !canvas) {
      setTextEditor(null);
      return;
    }
    saveSnapshot();
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const context = prepareContext(canvas);
    const fontSize = 28;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = color;
    context.font = `700 ${fontSize * scale}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.textBaseline = "top";
    drawWrappedText(
      context,
      value,
      textEditor.x * scale,
      textEditor.y * scale,
      Math.min(430, rect.width - textEditor.x - 18) * scale,
      fontSize,
      scale
    );
    persistBoard();
    setTextEditor(null);
  }

  useEffect(() => {
    if (textEditor) requestAnimationFrame(() => textInputRef.current?.focus());
  }, [textEditor]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !textEditor) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [textEditor, undo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const holder = canvas?.parentElement;
    if (!canvas || !holder) return undefined;

    const resize = () => {
      const rect = holder.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const old = document.createElement("canvas");
      old.width = canvas.width;
      old.height = canvas.height;
      if (canvas.width && canvas.height) old.getContext("2d").drawImage(canvas, 0, 0);
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      if (old.width && old.height) {
        prepareContext(canvas).drawImage(old, 0, 0, old.width, old.height, 0, 0, canvas.width, canvas.height);
      } else if (!didRestoreRef.current) {
        didRestoreRef.current = true;
        restoreSnapshot(localStorage.getItem(boardStorageKey), false);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(holder);
    return () => observer.disconnect();
  }, [prepareContext, restoreSnapshot]);

  return (
    <div className="whiteboard">
      <div className="whiteboard-toolbar" role="toolbar" aria-label="白板工具">
        <button title="画笔" aria-label="画笔" className={tool === "pen" ? "tool-button active" : "tool-button"} onClick={() => setTool("pen")}><PenTool size={17} /></button>
        <button title="橡皮擦" aria-label="橡皮擦" className={tool === "eraser" ? "tool-button active" : "tool-button"} onClick={() => setTool("eraser")}><Eraser size={17} /></button>
        <button title="文字" aria-label="文字" className={tool === "text" ? "tool-button active" : "tool-button"} onClick={() => setTool("text")}><Type size={17} /></button>
        <span className="toolbar-divider" />
        {["#182235", "#3977ff", "#ef5368"].map((item) => (
          <button
            key={item}
            className={color === item && tool === "pen" ? "color-dot active" : "color-dot"}
            style={{ "--dot-color": item }}
            onClick={() => { setColor(item); setTool("pen"); }}
            aria-label={`选择颜色 ${item}`}
          />
        ))}
        <span className="toolbar-divider" />
        <input aria-label="画笔粗细" type="range" min="2" max="14" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} />
        <button title="撤销" aria-label="撤销" className="tool-button" onClick={undo}><Undo2 size={17} /></button>
        <button title="清空白板" aria-label="清空白板" className="tool-button danger" onClick={clearBoard}><Trash2 size={17} /></button>
      </div>
      <canvas ref={canvasRef} onPointerDown={beginStroke} onPointerMove={drawStroke} onPointerUp={endStroke} onPointerCancel={endStroke} />
      {textEditor && (
        <textarea
          ref={textInputRef}
          className="whiteboard-text-editor"
          style={{ left: textEditor.x, top: textEditor.y, color }}
          value={textEditor.value}
          placeholder="输入文字，⌘ / Ctrl + Enter 完成"
          onChange={(event) => setTextEditor((current) => ({ ...current, value: event.target.value }))}
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === "Escape") setTextEditor(null);
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              commitText();
            }
          }}
        />
      )}
    </div>
  );
}

function App() {
  const [scene, setScene] = useState({ type: "whiteboard", title: "白板" });
  const [settings, setSettings] = useState(initialSettings);
  const [cameraError, setCameraError] = useState("");
  const [bubblePosition, setBubblePosition] = useState(() => {
    try { return JSON.parse(localStorage.getItem("abao-bubble-position")) || { x: 24, y: 620 }; }
    catch { return { x: 24, y: 620 }; }
  });
  const [pointer, setPointer] = useState({ x: -100, y: -100, down: false });
  const [ripples, setRipples] = useState([]);
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const offScene = window.abaoStage.onScene(setScene);
    const offSettings = window.abaoStage.onSettings((next) => setSettings((current) => ({ ...current, ...next })));
    window.abaoStage.ready();
    return () => {
      offScene?.();
      offSettings?.();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function reportDevices() {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      window.abaoStage.reportDevices({
        cameras: allDevices.filter((device) => device.kind === "videoinput").map((device) => ({ deviceId: device.deviceId, label: device.label })),
        microphones: allDevices.filter((device) => device.kind === "audioinput").map((device) => ({ deviceId: device.deviceId, label: device.label }))
      });
    }

    async function connectCamera() {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraError("");

      if (!settings.cameraEnabled) {
        await reportDevices();
        window.abaoStage.reportStatus({ ok: true, message: "人像已关闭" });
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: settings.cameraId
            ? { deviceId: { exact: settings.cameraId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        await reportDevices();
        window.abaoStage.reportStatus({ ok: true, message: "摄像头已连接" });
      } catch (error) {
        if (cancelled) return;
        setCameraError(error.message);
        await reportDevices();
        window.abaoStage.reportStatus({ ok: false, message: `摄像头未连接：${error.message}` });
      }
    }

    connectCamera();
    return () => { cancelled = true; };
  }, [settings.cameraEnabled, settings.cameraId]);

  useEffect(() => {
    localStorage.setItem("abao-bubble-position", JSON.stringify(bubblePosition));
  }, [bubblePosition]);

  useEffect(() => {
    const keepBubbleInFrame = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setBubblePosition((current) => ({
        x: clamp(current.x, 10, Math.max(10, rect.width - settings.bubbleSize - 10)),
        y: clamp(current.y, 10, Math.max(10, rect.height - settings.bubbleSize - 10))
      }));
    };
    keepBubbleInFrame();
    window.addEventListener("resize", keepBubbleInFrame);
    return () => window.removeEventListener("resize", keepBubbleInFrame);
  }, [settings.bubbleSize]);

  function handlePointerMove(event) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || scene.type === "html" || !settings.pointerEffects) return;
    setPointer((current) => ({ ...current, x: event.clientX - rect.left, y: event.clientY - rect.top }));
  }

  function handlePointerDown(event) {
    if (scene.type === "html" || !settings.pointerEffects) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ripple = { id: `${Date.now()}-${Math.random()}`, x: event.clientX - rect.left, y: event.clientY - rect.top };
    setPointer((current) => ({ ...current, down: true }));
    setRipples((current) => [...current, ripple]);
    setTimeout(() => setRipples((current) => current.filter((item) => item.id !== ripple.id)), 650);
  }

  function handlePointerUp() {
    setPointer((current) => ({ ...current, down: false }));
  }

  function startBubbleDrag(event) {
    const rootRect = rootRef.current?.getBoundingClientRect();
    if (!rootRect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rootRect.left - bubblePosition.x,
      offsetY: event.clientY - rootRect.top - bubblePosition.y
    };
  }

  function moveBubble(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const rootRect = rootRef.current?.getBoundingClientRect();
    if (!rootRect) return;
    const size = settings.bubbleSize;
    setBubblePosition({
      x: clamp(event.clientX - rootRect.left - dragRef.current.offsetX, 10, rootRect.width - size - 10),
      y: clamp(event.clientY - rootRect.top - dragRef.current.offsetY, 10, rootRect.height - size - 10)
    });
  }

  function stopBubbleDrag(event) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  const showPointerEffects = scene.type !== "html" && settings.pointerEffects;

  return (
    <main
      ref={rootRef}
      className={`record-stage background-${settings.background}`}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <section className={`content-card scene-${scene.type}`}>
        {scene.type === "whiteboard" && <Whiteboard />}
        {scene.type === "html" && (
          <iframe
            key={scene.url}
            title={scene.title}
            src={scene.url}
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
          />
        )}
        {scene.type === "image" && <img className="scene-image" src={scene.url} alt={scene.title} />}
      </section>

      {settings.cameraEnabled && (
        <div
          className={`camera-bubble ${settings.bubbleShape}`}
          style={{ width: settings.bubbleSize, height: settings.bubbleSize, transform: `translate(${bubblePosition.x}px, ${bubblePosition.y}px)` }}
          onPointerDown={startBubbleDrag}
          onPointerMove={moveBubble}
          onPointerUp={stopBubbleDrag}
          onPointerCancel={stopBubbleDrag}
        >
          <video ref={videoRef} autoPlay muted playsInline />
          {cameraError && <div className="camera-error"><CameraOff size={24} /><span>摄像头未连接</span></div>}
          <span className="drag-hint">拖动人像</span>
        </div>
      )}

      {showPointerEffects && <div className={pointer.down ? "pointer-dot down" : "pointer-dot"} style={{ transform: `translate(${pointer.x}px, ${pointer.y}px)` }} />}
      {showPointerEffects && ripples.map((ripple) => <div key={ripple.id} className="click-ripple" style={{ left: ripple.x, top: ripple.y }} />)}
      <div className="watermark"><span /> ABAO PRESENTER</div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
