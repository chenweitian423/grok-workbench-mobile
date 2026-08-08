import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronDown,
  Copy,
  Download,
  Image as ImageIcon,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  Settings,
  Sparkles,
  Upload
} from "lucide-react";
import "./styles.css";

const STORAGE_KEY = "grok-workbench-web-settings";

const DEFAULTS = {
  baseUrl: "/sub2",
  mediaBaseUrl: "/grok-media",
  apiKey: "",
  imageModel: "grok-imagine-image",
  chatModel: "grok-4.5"
};

const fallbackChatModels = ["grok-4.5", "grok-4", "grok-3", "grok-3-mini", "grok-composer-2.5-fast"];
const fallbackImageModels = ["grok-imagine-image"];
const ratios = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const resolutions = ["1k", "2k", "4k"];

function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...readSettings() }));
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState("等待连接");
  const [connected, setConnected] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [tab, setTab] = useState("image");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("一位东方女性，电影质感，精致光影，真实摄影");
  const [count, setCount] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [images, setImages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [toolMode, setToolMode] = useState("text");
  const [toolInput, setToolInput] = useState("");
  const [toolResult, setToolResult] = useState("");
  const [referenceImage, setReferenceImage] = useState(null);
  const fileRef = useRef(null);

  const apiBase = useMemo(() => runtimeApiBase(settings.baseUrl), [settings.baseUrl]);
  const mediaBase = useMemo(
    () => runtimeMediaBase(settings.mediaBaseUrl || settings.baseUrl),
    [settings.mediaBaseUrl, settings.baseUrl]
  );
  const imageModels = useMemo(
    () => merge(models.filter((item) => isImageModel(item.id)).map((item) => item.id), fallbackImageModels),
    [models]
  );
  const chatModels = useMemo(
    () => merge(models.filter((item) => !isImageModel(item.id)).map((item) => item.id), fallbackChatModels),
    [models]
  );

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setStatus("连接中");
    try {
      if (!settings.apiKey.trim()) {
        setConnected(false);
        setStatus("请填写 API Key");
        return;
      }

      const body = await requestJSON("/v1/models", { auth: true });
      const nextModels = Array.isArray(body.data) ? body.data : [];
      setModels(nextModels);
      setSettings((current) => ({
        ...current,
        imageModel: keepOrFirst(current.imageModel, nextModels, isImageModel, DEFAULTS.imageModel),
        chatModel: keepOrFirst(current.chatModel, nextModels, (id) => !isImageModel(id), DEFAULTS.chatModel)
      }));
      setConnected(true);
      setStatus("准备就绪");
    } catch (error) {
      setConnected(false);
      setStatus("连接失败");
      alert(`连接失败：${error.message}`);
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setStatus("配置已保存");
    refresh();
  }

  async function generate() {
    if (!requireKey() || !prompt.trim()) return;
    setBusy(true);
    setStatus("生成中");
    try {
      const body = await requestJSON("/v1/images/generations", {
        method: "POST",
        auth: true,
        body: {
          model: settings.imageModel,
          prompt: prompt.trim(),
          n: count,
          aspect_ratio: aspectRatio,
          resolution,
          response_format: "url"
        }
      });
      const nextImages = (body.data || []).map((item, index) => ({
        id: `${Date.now()}-${index}`,
        url: absoluteMediaUrl(item.url, item.b64_json),
        prompt: prompt.trim()
      }));
      setImages((current) => [...nextImages, ...current]);
      setStatus(`完成 ${nextImages.length} 张`);
    } catch (error) {
      setStatus("生成失败");
      alert(`生成失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!requireKey() || !text) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setChatInput("");
    setBusy(true);
    try {
      const body = await requestJSON("/v1/chat/completions", {
        method: "POST",
        auth: true,
        body: { model: settings.chatModel, messages: nextMessages, stream: false }
      });
      setMessages((current) => [...current, { role: "assistant", content: extractChatText(body) }]);
    } catch (error) {
      alert(`聊天失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function createPrompt() {
    if (!requireKey()) return;
    if (toolMode === "text" && !toolInput.trim()) return;
    if (toolMode === "image" && !referenceImage?.dataUrl) {
      alert("请先选择参考图片");
      return;
    }

    setBusy(true);
    setToolResult("");
    try {
      const instruction =
        toolMode === "text"
          ? `把下面的简短描述扩写成专业图片生成提示词。只输出一段可直接用于图片生成的完整提示词，不要输出 JSON，不要解释。要求包含主体、构图、镜头、光影、色彩、材质、风格、细节和负面约束。\n${toolInput.trim()}`
          : `请分析这张图片并生成可用于图片模型的还原提示词。输出两段：第一段为结构化要点，第二段标题为“可直接使用的提示词：”，后面只写完整提示词。\n${toolInput.trim()}`;
      const content =
        toolMode === "text"
          ? instruction
          : [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: referenceImage.dataUrl } }
            ];

      const body = await requestJSON("/v1/chat/completions", {
        method: "POST",
        auth: true,
        body: { model: settings.chatModel, messages: [{ role: "user", content }], stream: false }
      });
      setToolResult(extractChatText(body));
    } catch (error) {
      alert(`提示词生成失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function requestJSON(path, options = {}) {
    const headers = {};
    if (options.auth) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || `HTTP ${response.status}`);
    }
    return body;
  }

  function absoluteMediaUrl(value, b64) {
    if (b64 && !value) return `data:image/jpeg;base64,${b64}`;
    if (!value) return "";
    if (String(value).startsWith("data:")) return value;

    try {
      const parsed = new URL(value);
      if (isLocalMediaUrl(parsed)) {
        return joinUrl(mediaBase, parsed.pathname + parsed.search);
      }
      return parsed.toString();
    } catch {
      return joinUrl(mediaBase, String(value));
    }
  }

  async function onPickImage(file) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setReferenceImage({ name: file.name, dataUrl });
    setToolResult("");
  }

  function requireKey() {
    if (!settings.apiKey.trim()) {
      alert("请先在右上角设置里填写 API Key");
      return false;
    }
    return true;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">GROK WORKBENCH WEB</div>
          <h1>{tab === "image" ? "图片工作台" : tab === "chat" ? "聊天" : "提示词工具"}</h1>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={refresh} title="刷新模型">
            <RefreshCw size={20} />
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen((value) => !value)} title="设置">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <section className="status-row">
        <span className={`status ${connected ? "good" : "bad"}`}>
          <i />
          {status}
        </span>
        <span className="server-text">直连现有 sub2api / grok2api</span>
      </section>

      {settingsOpen && (
        <section className="settings-panel">
          <label>API 地址</label>
          <input value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} />
          <label>图片媒体地址</label>
          <input
            value={settings.mediaBaseUrl}
            onChange={(event) => setSettings({ ...settings, mediaBaseUrl: event.target.value })}
          />
          <label>API Key</label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
          />
          <div className="settings-actions">
            <button onClick={saveSettings}>
              <Save size={18} />
              保存配置
            </button>
            <button onClick={refresh}>
              <RefreshCw size={18} />
              测试连接
            </button>
          </div>
        </section>
      )}

      <nav className="mode-tabs">
        <button className={tab === "image" ? "active" : ""} onClick={() => setTab("image")}>
          <ImageIcon size={18} />
          图片
        </button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          <MessageCircle size={18} />
          聊天
        </button>
        <button className={tab === "tools" ? "active" : ""} onClick={() => setTab("tools")}>
          <Sparkles size={18} />
          提示词
        </button>
      </nav>

      {tab === "image" && (
        <section className="workspace">
          <ModelSelect
            label="图片模型"
            value={settings.imageModel}
            models={imageModels}
            onChange={(imageModel) => setSettings({ ...settings, imageModel })}
          />
          <div className="image-grid">
            {images.length === 0 ? (
              <Empty icon={<ImageIcon size={44} />} title="还没有图片" text="输入描述后生成，结果会显示在这里。" />
            ) : (
              images.map((item, index) => (
                <article className="image-card" key={item.id}>
                  <img src={item.url} alt={`生成图片 ${index + 1}`} />
                  <footer>
                    <b>图片 {images.length - index}</b>
                    <div>
                      <button onClick={() => navigator.clipboard.writeText(item.url)} title="复制链接">
                        <Copy size={18} />
                      </button>
                      <a href={item.url} target="_blank" rel="noreferrer" title="打开图片">
                        <Download size={18} />
                      </a>
                    </div>
                  </footer>
                </article>
              ))
            )}
          </div>
          <section className="composer">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你想生成的画面" />
            <div className="control-row">
              <Segment values={[1, 2, 4]} value={count} onChange={setCount} suffix="x" />
              <Segment values={ratios} value={aspectRatio} onChange={setAspectRatio} />
              <Segment values={resolutions} value={resolution} onChange={setResolution} />
              <button className="send-btn" disabled={busy} onClick={generate} title="生成图片">
                <Send size={20} />
              </button>
            </div>
          </section>
        </section>
      )}

      {tab === "chat" && (
        <section className="workspace chat-workspace">
          <ModelSelect
            label="聊天模型"
            value={settings.chatModel}
            models={chatModels}
            onChange={(chatModel) => setSettings({ ...settings, chatModel })}
          />
          <div className="messages">
            {messages.length === 0 ? (
              <Empty icon={<MessageCircle size={44} />} title="开始聊天" text="直接使用所选模型交流、改写和构思。" />
            ) : (
              messages.map((item, index) => (
                <article className={`message ${item.role}`} key={index}>
                  <b>{item.role === "user" ? "你" : "Grok"}</b>
                  <p>{item.content}</p>
                </article>
              ))
            )}
          </div>
          <section className="chat-composer">
            <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="输入消息..." />
            <button className="send-btn" disabled={busy} onClick={sendChat} title="发送">
              <Send size={20} />
            </button>
          </section>
        </section>
      )}

      {tab === "tools" && (
        <section className="workspace prompt-tools">
          <div className="tool-switch">
            <button className={toolMode === "text" ? "active" : ""} onClick={() => setToolMode("text")}>
              文字生成图片提示词
            </button>
            <button className={toolMode === "image" ? "active" : ""} onClick={() => setToolMode("image")}>
              图片还原提示词
            </button>
          </div>
          {toolMode === "image" && (
            <button className="upload-box" onClick={() => fileRef.current?.click()}>
              {referenceImage ? (
                <img src={referenceImage.dataUrl} alt="参考图" />
              ) : (
                <>
                  <Upload size={28} />
                  选择参考图片
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => onPickImage(event.target.files?.[0])} />
            </button>
          )}
          <textarea
            className="tool-input"
            value={toolInput}
            onChange={(event) => setToolInput(event.target.value)}
            placeholder={toolMode === "text" ? "例如：雨夜东京街头，一位穿红色风衣的女孩" : "选择图片后，可补充你想重点还原的内容"}
          />
          <button className="primary" disabled={busy} onClick={createPrompt}>
            <Sparkles size={18} />
            生成提示词
          </button>
          {toolResult && (
            <article className="result-panel">
              <b>结果</b>
              <pre>{toolResult}</pre>
              <button
                onClick={() => {
                  setPrompt(cleanImagePrompt(toolResult));
                  setTab("image");
                }}
              >
                发送到图片生成
              </button>
            </article>
          )}
        </section>
      )}
    </main>
  );
}

function ModelSelect({ label, value, models, onChange }) {
  return (
    <label className="model-select">
      {label}
      <span>
        <Sparkles size={16} />
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <ChevronDown size={16} />
      </span>
    </label>
  );
}

function Segment({ values, value, onChange, suffix = "" }) {
  return (
    <div className="segment">
      {values.map((item) => (
        <button key={item} className={item === value ? "active" : ""} onClick={() => onChange(item)}>
          {item}
          {suffix}
        </button>
      ))}
    </div>
  );
}

function Empty({ icon, title, text }) {
  return (
    <div className="empty">
      {icon}
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return raw.replace(/\/v1$/i, "");
}

function runtimeApiBase(value) {
  const normalized = normalizeBaseUrl(value);
  if (isKnownPublicHost(normalized, ["api.sky423.cn"])) return "/sub2";
  return normalized;
}

function runtimeMediaBase(value) {
  const normalized = normalizeBaseUrl(value);
  if (isKnownPublicHost(normalized, ["grok.sky423.cn"])) return "/grok-media";
  return normalized;
}

function isKnownPublicHost(value, hosts) {
  try {
    return hosts.includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function joinUrl(base, path) {
  const cleanBase = normalizeBaseUrl(base);
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

function merge(primary, fallback) {
  return Array.from(new Set([...primary.filter(Boolean), ...fallback]));
}

function keepOrFirst(current, models, predicate, fallback) {
  const ids = models.map((item) => item.id).filter(Boolean);
  if (ids.includes(current)) return current;
  return ids.find(predicate) || current || fallback;
}

function isImageModel(id) {
  const value = String(id || "").toLowerCase();
  return value.includes("image") || value.includes("imagine") || value.includes("draw") || value.includes("flux");
}

function isLocalMediaUrl(url) {
  return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.pathname.startsWith("/v1/media/");
}

function extractChatText(body) {
  const content = body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.text ?? body?.output?.[0]?.content;
  if (Array.isArray(content)) return content.map((item) => item.text || item.content || "").join("");
  return String(content || body?.message || "接口没有返回文本");
}

function cleanImagePrompt(value) {
  let text = String(value || "")
    .replace(/```(?:json|text)?/gi, "")
    .replace(/```/g, "")
    .trim();
  for (const marker of ["可直接使用的提示词：", "可直接使用的提示词:", "完整还原提示词：", "还原提示词：", "图片生成提示词："]) {
    const index = text.lastIndexOf(marker);
    if (index >= 0 && text.slice(index + marker.length).trim()) {
      text = text.slice(index + marker.length).trim();
      break;
    }
  }
  return text.slice(0, 12000);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

createRoot(document.getElementById("root")).render(<App />);
