import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppWindow,
  Camera,
  CircleStop,
  Eye,
  EyeOff,
  FileCode2,
  FileImage,
  FolderOpen,
  Gauge,
  Mic,
  MonitorPlay,
  PenTool,
  Play,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Video
} from "lucide-react";
import "./controller.css";

const defaultSettings = {
  cameraId: "",
  micId: "",
  cameraEnabled: false,
  pointerEffects: true,
  bubbleSize: 176,
  bubbleShape: "rounded",
  background: "studio-mist"
};

const sourceOptions = [
  {
    type: "whiteboard",
    title: "白板",
    description: "书写、标注与讲解",
    icon: PenTool
  },
  {
    type: "html",
    title: "动态 HTML",
    description: "演示交互页面",
    icon: FileCode2
  },
  {
    type: "image",
    title: "图片",
    description: "PNG / JPG / GIF",
    icon: FileImage
  }
];

function readStoredJson(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key)) };
  } catch {
    return fallback;
  }
}

function preferredDevice(list, preferredPattern, blockedPattern) {
  const preferred = list.find((device) => preferredPattern.test(device.label || ""));
  if (preferred) return preferred.deviceId;
  const physical = list.find((device) => !blockedPattern.test(device.label || ""));
  return physical?.deviceId || list[0]?.deviceId || "";
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const value = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hours ? `${String(hours).padStart(2, "0")}:${value}` : value;
}

function Toggle({ checked, disabled = false, label, description, onChange }) {
  return (
    <div className="toggle-row">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={checked ? "switch-control checked" : "switch-control"}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, meta }) {
  return (
    <div className="section-heading">
      <div className="section-heading-main">
        <span className="section-icon"><Icon size={17} strokeWidth={1.9} /></span>
        <h2>{title}</h2>
      </div>
      {meta}
    </div>
  );
}

function App() {
  const [scene, setScene] = useState({ type: "whiteboard", title: "白板" });
  const [settings, setSettings] = useState(() => readStoredJson("abao-settings-v2", defaultSettings));
  const [devices, setDevices] = useState({ cameras: [], microphones: [] });
  const [stageStatus, setStageStatus] = useState({ ok: null, message: "正在连接设备" });
  const [teleprompter, setTeleprompter] = useState(() => localStorage.getItem("abao-teleprompter") || "");
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("abao-prompt-font-size")) || 28);
  const [scrollSpeed, setScrollSpeed] = useState(() => Number(localStorage.getItem("abao-prompt-speed")) || 30);
  const [autoScroll, setAutoScroll] = useState(false);
  const [stageVisible, setStageVisible] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [notice, setNotice] = useState({ tone: "neutral", text: "控制台和提词器不会进入成片。" });
  const promptRef = useRef(null);
  const recorderRef = useRef(null);
  const captureTracksRef = useRef([]);
  const recordingSessionRef = useRef(null);
  const chunkWriteQueueRef = useRef(Promise.resolve());
  const chunkWriteErrorRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }, []);

  const recordingProfile = useMemo(() => {
    const candidates = [
      { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4", label: "MP4" },
      { mimeType: "video/mp4", extension: "mp4", label: "MP4" },
      { mimeType: "video/webm;codecs=vp9,opus", extension: "webm", label: "WebM" },
      { mimeType: "video/webm;codecs=vp8,opus", extension: "webm", label: "WebM" },
      { mimeType: "video/webm", extension: "webm", label: "WebM" }
    ];
    return candidates.find((candidate) => window.MediaRecorder?.isTypeSupported(candidate.mimeType)) || {
      mimeType: "",
      extension: "webm",
      label: "WebM"
    };
  }, []);

  useEffect(() => {
    const offScene = window.abao.onScene(setScene);
    const offDevices = window.abao.onDevices((nextDevices) => {
      setDevices(nextDevices);
      setSettings((current) => {
        const cameraId = current.cameraId || preferredDevice(
          nextDevices.cameras || [],
          /logitech\s+brio/i,
          /ivcam|obs|virtual|虚拟|yy/i
        );
        const micId = current.micId || preferredDevice(
          nextDevices.microphones || [],
          /logitech\s+brio/i,
          /virtual|虚拟|stereo mix|立体声混音/i
        );
        return { ...current, cameraId, micId };
      });
    });
    const offStatus = window.abao.onStageStatus((payload) => {
      setStageStatus({ ok: payload?.ok ?? null, message: payload?.message || String(payload) });
    });
    const offVisibility = window.abao.onStageVisibility(setStageVisible);
    window.abao.getStageVisibility().then((result) => setStageVisible(Boolean(result?.visible)));
    return () => {
      offScene?.();
      offDevices?.();
      offStatus?.();
      offVisibility?.();
    };
  }, []);

  useEffect(() => {
    window.abao.sendSettings(settings);
    localStorage.setItem("abao-settings-v2", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("abao-teleprompter", teleprompter);
  }, [teleprompter]);

  useEffect(() => {
    localStorage.setItem("abao-prompt-font-size", String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem("abao-prompt-speed", String(scrollSpeed));
  }, [scrollSpeed]);

  useEffect(() => {
    if (!autoScroll) return undefined;
    let previous = performance.now();
    let exactScrollTop = promptRef.current?.scrollTop || 0;
    let frame;
    const pixelsPerSecond = 1 + 79 * Math.pow(scrollSpeed / 100, 2);
    const tick = (now) => {
      const element = promptRef.current;
      if (element) {
        const delta = (now - previous) / 1000;
        exactScrollTop += delta * pixelsPerSecond;
        element.scrollTop = exactScrollTop;
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, scrollSpeed]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    captureTracksRef.current.forEach((track) => track.stop());
  }, []);

  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  async function chooseSource(type) {
    if (recording) return;
    if (type === "whiteboard") await window.abao.showWhiteboard();
    if (type === "html") await window.abao.openHtml();
    if (type === "image") await window.abao.openImage();
  }

  async function startRecording() {
    setNotice({ tone: "progress", text: "正在准备录制环境…" });
    try {
      await window.abao.showStage();
      const stageStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1080 }, height: { ideal: 1440 } },
        audio: false
      });

      let micStream = null;
      let micWarning = "";
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: settings.micId ? { deviceId: { exact: settings.micId } } : true,
          video: false
        });
      } catch (error) {
        micWarning = `；麦克风未启用：${error.message}`;
      }

      const tracks = [
        ...stageStream.getVideoTracks(),
        ...(micStream ? micStream.getAudioTracks() : [])
      ];
      captureTracksRef.current = [
        ...stageStream.getTracks(),
        ...(micStream ? micStream.getTracks() : [])
      ];

      const combined = new MediaStream(tracks);
      const sessionResult = await window.abao.beginRecording(recordingProfile);
      if (!sessionResult?.id) throw new Error("无法创建本地录制文件");

      recordingSessionRef.current = sessionResult.id;
      chunkWriteQueueRef.current = Promise.resolve();
      chunkWriteErrorRef.current = null;
      const recorderOptions = recordingProfile.mimeType
        ? { mimeType: recordingProfile.mimeType, videoBitsPerSecond: 16_000_000, audioBitsPerSecond: 192_000 }
        : { videoBitsPerSecond: 16_000_000, audioBitsPerSecond: 192_000 };
      const recorder = new MediaRecorder(combined, recorderOptions);

      recorder.ondataavailable = (event) => {
        if (!event.data?.size) return;
        const sessionId = recordingSessionRef.current;
        chunkWriteQueueRef.current = chunkWriteQueueRef.current.then(async () => {
          const bytes = new Uint8Array(await event.data.arrayBuffer());
          const result = await window.abao.appendRecordingChunk(sessionId, bytes);
          if (!result?.ok) throw new Error(result?.error || "录像写入失败");
        }).catch((error) => {
          chunkWriteErrorRef.current = error;
        });
      };

      recorder.onerror = (event) => {
        setNotice({ tone: "error", text: `录制异常：${event.error?.message || "未知错误"}` });
      };

      recorder.onstop = async () => {
        setNotice({ tone: "progress", text: "正在完成文件写入…" });
        await chunkWriteQueueRef.current;
        const sessionId = recordingSessionRef.current;
        const result = await window.abao.finishRecording(sessionId);
        recordingSessionRef.current = null;
        recorderRef.current = null;
        captureTracksRef.current.forEach((track) => track.stop());
        captureTracksRef.current = [];

        if (chunkWriteErrorRef.current) {
          setNotice({ tone: "warning", text: `录制已结束，但写入可能不完整：${chunkWriteErrorRef.current.message}` });
        } else if (result?.path) {
          setNotice({ tone: "success", text: `已保存 ${result.format?.toUpperCase() || recordingProfile.label}：${result.path}` });
        } else {
          setNotice({ tone: "error", text: result?.error || "保存失败，请重新录制。" });
        }
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setRecordSeconds(0);
      setNotice({ tone: micWarning ? "warning" : "recording", text: `正在录制 ${recordingProfile.label}${micWarning}` });
      timerRef.current = setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    } catch (error) {
      if (recordingSessionRef.current) {
        await window.abao.cancelRecording(recordingSessionRef.current);
        recordingSessionRef.current = null;
      }
      captureTracksRef.current.forEach((track) => track.stop());
      captureTracksRef.current = [];
      setNotice({ tone: "error", text: `无法开始录制：${error.message}` });
    }
  }

  function stopRecording() {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
    setRecording(false);
    setNotice({ tone: "progress", text: "正在停止录制…" });
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function toggleStage() {
    const result = await window.abao.toggleStage();
    setStageVisible(Boolean(result?.visible));
  }

  function resetPromptScroll() {
    if (promptRef.current) promptRef.current.scrollTop = 0;
    setAutoScroll(false);
  }

  return (
    <main className="controller-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><Video size={21} strokeWidth={2.1} /></span>
          <div>
            <div className="brand-name">ABAO Presenter</div>
            <p>本地演示录制工作台</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="privacy-pill"><ShieldCheck size={14} /> 本地处理</span>
          <button className="icon-text-button" disabled={recording} onClick={toggleStage}>
            {stageVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            {stageVisible ? "隐藏画面" : "显示画面"}
          </button>
        </div>
      </header>

      <div className="format-strip">
        <span><MonitorPlay size={15} /> 3:4 竖版</span>
        <span>1080 × 1440</span>
        <span>30 FPS</span>
        <span className="format-badge">{recordingProfile.label}</span>
      </div>

      <section className="panel">
        <SectionTitle
          icon={AppWindow}
          title="演示内容"
          meta={<span className="current-source" title={scene.title}>{scene.title}</span>}
        />
        <div className="source-grid">
          {sourceOptions.map((source) => {
            const Icon = source.icon;
            return (
              <button
                key={source.type}
                className={scene.type === source.type ? "source-card active" : "source-card"}
                disabled={recording}
                onClick={() => chooseSource(source.type)}
              >
                <span className="source-icon"><Icon size={22} strokeWidth={1.8} /></span>
                <strong>{source.title}</strong>
                <small>{source.description}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <SectionTitle
          icon={Sparkles}
          title="画面与设备"
          meta={(
            <span className={`device-status ${stageStatus.ok === false ? "error" : ""}`}>
              <i />{stageStatus.message}
            </span>
          )}
        />

        <div className="device-grid">
          <label className="control-field">
            <span><Camera size={14} /> 摄像头</span>
            <select value={settings.cameraId} disabled={!settings.cameraEnabled || recording} onChange={(event) => updateSetting("cameraId", event.target.value)}>
              <option value="">默认摄像头</option>
              {devices.cameras.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>{device.label || `摄像头 ${index + 1}`}</option>
              ))}
            </select>
          </label>
          <label className="control-field">
            <span><Mic size={14} /> 麦克风</span>
            <select value={settings.micId} disabled={recording} onChange={(event) => updateSetting("micId", event.target.value)}>
              <option value="">默认麦克风</option>
              {devices.microphones.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>{device.label || `麦克风 ${index + 1}`}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="device-grid compact-grid">
          <label className="control-field">
            <span>人像形状</span>
            <select value={settings.bubbleShape} disabled={recording || !settings.cameraEnabled} onChange={(event) => updateSetting("bubbleShape", event.target.value)}>
              <option value="rounded">圆角方形</option>
              <option value="circle">圆形</option>
            </select>
          </label>
          <label className="control-field">
            <span>成片背景</span>
            <select value={settings.background} disabled={recording} onChange={(event) => updateSetting("background", event.target.value)}>
              <option value="studio-mist">影棚柔光</option>
              <option value="blueprint">蓝图空间</option>
              <option value="warm-paper">暖白纸张</option>
              <option value="dark-focus">深色聚焦</option>
            </select>
          </label>
        </div>

        <div className="toggle-grid">
          <Toggle
            checked={settings.cameraEnabled}
            disabled={recording}
            label="显示人像"
            description="可在演示画面中拖动"
            onChange={(value) => updateSetting("cameraEnabled", value)}
          />
          <Toggle
            checked={settings.pointerEffects}
            disabled={recording}
            label="鼠标强调"
            description="显示光标与点击波纹"
            onChange={(value) => updateSetting("pointerEffects", value)}
          />
        </div>

        <label className="range-field">
          <span>
            <span>人像尺寸</span>
            <b>{settings.bubbleSize}px</b>
          </span>
          <input
            aria-label="人像尺寸"
            type="range"
            min="120"
            max="280"
            disabled={recording || !settings.cameraEnabled}
            value={settings.bubbleSize}
            onChange={(event) => updateSetting("bubbleSize", Number(event.target.value))}
          />
        </label>
      </section>

      <section className="panel prompt-panel">
        <SectionTitle
          icon={ScrollText}
          title="提词器"
          meta={(
            <div className="prompt-actions">
              <button className="small-icon-button" aria-label="回到提词器开头" title="回到开头" onClick={resetPromptScroll}>
                <RotateCcw size={15} />
              </button>
              <button className={autoScroll ? "scroll-button active" : "scroll-button"} onClick={() => setAutoScroll((value) => !value)}>
                {autoScroll ? <CircleStop size={15} /> : <Play size={15} />}
                {autoScroll ? "暂停" : "自动滚动"}
              </button>
            </div>
          )}
        />
        <textarea
          ref={promptRef}
          value={teleprompter}
          onChange={(event) => setTeleprompter(event.target.value)}
          placeholder="在这里粘贴口播稿。这个区域只对你可见，不会进入成片。"
          style={{ fontSize: `${fontSize}px` }}
        />
        <div className="prompt-footer">
          <span>{teleprompter.length.toLocaleString("zh-CN")} 字</span>
          <label><span>字号 {fontSize}</span><input aria-label="提词器字号" type="range" min="20" max="42" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label>
          <label><span>速度 {scrollSpeed}%</span><input aria-label="提词器滚动速度" type="range" min="0" max="100" step="1" value={scrollSpeed} onChange={(event) => setScrollSpeed(Number(event.target.value))} /></label>
        </div>
      </section>

      <section className="record-dock">
        <div className={`notice notice-${notice.tone}`} aria-live="polite">
          <span className="notice-dot" />
          <p>{notice.text}</p>
        </div>
        <div className="record-actions">
          <button className="folder-button" onClick={() => window.abao.openRecordingsFolder()}>
            <FolderOpen size={17} />
            录制文件
          </button>
          <button className={recording ? "record-button recording" : "record-button"} onClick={recording ? stopRecording : startRecording}>
            {recording ? <CircleStop size={20} fill="currentColor" /> : <span className="record-indicator" />}
            <span>{recording ? `停止录制 ${formatTime(recordSeconds)}` : "开始录制"}</span>
          </button>
        </div>
        <div className="dock-meta">
          <span><ShieldCheck size={13} /> 素材不上传</span>
          <span><Gauge size={13} /> 分块写入本地</span>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
