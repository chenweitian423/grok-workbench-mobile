import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AudioLines,
  Clapperboard,
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  ImageIcon,
  ImagePlus,
  KeyRound,
  Music2,
  Loader2,
  Mic,
  Eye,
  EyeOff,
  MessageSquareText,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Upload,
  Volume2,
  X
} from "lucide-react";
import {
  APP_VERSION,
  DEFAULT_BASE_URL,
  DEFAULT_MODELS,
  GrokApi,
  buildVideoGenerationBody,
  PROMPT_WORKFLOWS,
  extractJobId,
  extractMediaItems
} from "@grok-workbench/core";
import "./styles.css";

const saved = JSON.parse(localStorage.getItem("grok-workbench-settings") || "{}");

const tabs = [
  { id: "prompt", label: "提示词", icon: Sparkles },
  { id: "chat", label: "聊天", icon: MessageSquareText },
  { id: "image", label: "图片", icon: ImageIcon },
  { id: "video", label: "视频", icon: Film },
  { id: "voice", label: "语音", icon: AudioLines },
  { id: "music", label: "音乐", icon: Music2 },
  { id: "settings", label: "设置", icon: Settings }
];

const KNOWN_CHAT_MODELS = [
  "grok-composer-2.5-fast",
  "grok-4.5",
  "grok-4.6",
  "grok-build-0.1",
  "grok-4.20-multi-agent-0309",
  "grok-4.20-0309-non-reasoning",
  "grok-4.20-0309-reasoning",
  "grok-4.3",
  "grok-chat-fast",
  "grok-chat-auto",
  "grok-chat-expert",
  "grok-chat-heavy"
];

const MUSIC_MODEL_FALLBACKS = ["grok-4.5", "grok-4.6", "grok-chat-fast"];
const MUSIC_LENGTH_PROFILES = {
  short: {
    label: "短歌",
    durationLabel: "2–3 分钟",
    minDuration: 120,
    maxDuration: 180,
    minLines: 30,
    minCharacters: 180,
    maxTokens: 4200,
    structure: "[Intro] 2-4 lines; [Verse 1] 6-8 lines; [Pre-Chorus] 3-4 lines; [Chorus] 6-8 lines; [Verse 2] 6-8 lines; [Bridge] 4-6 lines; [Final Chorus] 8-10 lines; [Outro] 2-4 lines"
  },
  standard: {
    label: "标准",
    durationLabel: "3.5–4.5 分钟",
    minDuration: 210,
    maxDuration: 270,
    minLines: 45,
    minCharacters: 300,
    maxTokens: 6500,
    structure: "[Intro] 2-4 lines; [Verse 1] 6-8 lines; [Pre-Chorus] 4 lines; [Chorus] 6-8 lines; [Verse 2] 6-8 lines; repeat [Pre-Chorus] in full; repeat [Chorus] in full; [Bridge] 4-6 lines; [Final Chorus] 8-10 lines; [Outro] 2-4 lines"
  },
  long: {
    label: "长歌",
    durationLabel: "4.5–5.5 分钟",
    minDuration: 270,
    maxDuration: 330,
    minLines: 65,
    minCharacters: 430,
    maxTokens: 8500,
    structure: "[Intro] 4 lines; [Verse 1] 10-12 lines; [Pre-Chorus] 4-6 lines; [Chorus] 10-12 lines; [Post-Chorus] 4 lines; [Verse 2] 10-12 lines; repeat [Pre-Chorus] and [Chorus] in full; [Bridge] 8-10 lines; [Final Chorus] 12-16 lines; [Outro] 4-6 lines"
  }
};

// grok2api exposes these Web routes as aliases in /v1/models, but the lite
// route is also a valid public model and needs to remain selectable.
const KNOWN_IMAGE_MODELS = [
  "grok-imagine-image-2.0",
  "grok-imagine-image",
  "grok-imagine-image-lite",
  "grok-imagine-image-quality"
];

const KNOWN_VOICE_MODELS = [
  "grok-voice-latest",
  "grok-voice-think-fast-1.0",
  "grok-voice-think-fast-2.0"
];

const VOICE_LANGUAGES = [
  ["auto", "自动"],
  ["zh", "中文"],
  ["en", "English"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["es", "Español"]
];

const VOICE_PREVIEW_TEXT = {
  zh: "你好，这是音色试听。",
  en: "Hello, this is a voice preview.",
  ja: "こんにちは、音声の試聴です。",
  ko: "안녕하세요. 음성 미리듣기입니다.",
  fr: "Bonjour, ceci est un aperçu vocal.",
  de: "Hallo, dies ist eine Sprachprobe.",
  es: "Hola, esta es una prueba de voz."
};

const HISTORY_KEY = "grok-workbench-history";
const MODEL_LIST_KEY = "grok-workbench-models";

function App() {
  const [authUser, setAuthUser] = useState(undefined);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl || DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState(saved.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [active, setActive] = useState("prompt");
  const [workflowId, setWorkflowId] = useState("text-to-prompt");
  const [input, setInput] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [models, setModels] = useState(loadSavedModels);
  const [model, setModel] = useState({
    chat: DEFAULT_MODELS.chat,
    image: DEFAULT_MODELS.image,
    video: DEFAULT_MODELS.video,
    voice: DEFAULT_MODELS.voice
  });
  const [imageParams, setImageParams] = useState({ count: 1, aspectRatio: "1:1", resolution: "1k" });
  const [videoParams, setVideoParams] = useState({ duration: 6, aspectRatio: "16:9", resolution: "720p" });
  const [voiceMode, setVoiceMode] = useState("tts");
  const [voiceModel, setVoiceModel] = useState(DEFAULT_MODELS.voice);
  const [voiceId, setVoiceId] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState("zh");
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [voiceText, setVoiceText] = useState("");
  const [voiceFile, setVoiceFile] = useState(null);
  const [voiceList, setVoiceList] = useState([]);
  const [voiceAudio, setVoiceAudio] = useState(null);
  const [voiceSynthesisText, setVoiceSynthesisText] = useState("");
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [musicInput, setMusicInput] = useState("");
  const [musicPlan, setMusicPlan] = useState(null);
  const [musicModel, setMusicModel] = useState("grok-4.5");
  const [musicLength, setMusicLength] = useState("standard");
  const [media, setMedia] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatImages, setChatImages] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [videoJob, setVideoJob] = useState(null);
  const [videoRequestPreview, setVideoRequestPreview] = useState(null);
  const [mediaHistory, setMediaHistory] = useState(() => loadHistory());
  const [status, setStatus] = useState("请填写客户端 Key 后读取模型");
  const [busy, setBusy] = useState(false);
  const pollToken = useRef(0);

  const effectiveBaseUrl = useMemo(() => normalizeWebBaseUrl(baseUrl), [baseUrl]);
  const api = useMemo(() => new GrokApi({ baseUrl: effectiveBaseUrl, apiKey }), [effectiveBaseUrl, apiKey]);
  const workflow = PROMPT_WORKFLOWS.find((item) => item.id === workflowId) || PROMPT_WORKFLOWS[1];

  useEffect(() => {
    fetch("/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setAuthUser(data?.user || null))
      .catch(() => setAuthUser(null));
  }, []);

  useEffect(() => {
    if (!authUser || !apiKey.trim()) return;
    loadModels({ silent: true });
  }, [authUser, api]);

  const modelLists = useMemo(() => {
    const ids = models.length ? models.map(normalizeModelOption) : Object.values(DEFAULT_MODELS);
    const chat = unique([...KNOWN_CHAT_MODELS, ...ids.filter((id) => /chat|grok-4|composer|build/i.test(id))]);
    const image = unique([...KNOWN_IMAGE_MODELS, ...ids.filter((id) => /image/i.test(id) && !/edit/i.test(id))]);
    const video = unique(ids.filter((id) => /video/i.test(id)));
    const voice = unique([...KNOWN_VOICE_MODELS, ...ids.filter((id) => /voice/i.test(id) && !/edit/i.test(id))]);
    return {
      chat: chat.length ? chat : [DEFAULT_MODELS.chat],
      image: image.length ? image : [DEFAULT_MODELS.image, DEFAULT_MODELS.imageQuality],
      video: video.length ? video : [DEFAULT_MODELS.video],
      voice: voice.length ? voice : [DEFAULT_MODELS.voice]
    };
  }, [models]);
  const musicModels = useMemo(() => getMusicModels(models), [models]);

  useEffect(() => {
    if (!musicModels.includes(musicModel)) setMusicModel(musicModels[0]);
  }, [musicModel, musicModels]);

  useEffect(() => {
    if (active !== "voice" || voiceMode !== "tts" || !apiKey.trim()) return;
    let cancelled = false;
    api.voices({ model: voiceModel })
      .then((data) => {
        if (cancelled) return;
        const next = Array.isArray(data?.voices) ? data.voices : [];
        setVoiceList(next);
        setVoiceId((current) => next.some((item) => item.voice_id === current) ? current : (next[0]?.voice_id || ""));
      })
      .catch((error) => {
        if (!cancelled) setStatus(formatError(error));
      });
    return () => { cancelled = true; };
  }, [active, voiceMode, voiceModel, api, apiKey]);

  function requireKey() {
    if (!apiKey.trim()) {
      setStatus("请先在设置里填写完整客户端 Key，不是列表里显示的前缀。");
      return false;
    }
    return true;
  }

  function saveSettings() {
    localStorage.setItem("grok-workbench-settings", JSON.stringify({ baseUrl, apiKey }));
    setStatus("设置已保存");
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch(`/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "登录失败");
      setAuthUser(data.user);
      setMediaHistory([]);
      setStatus("已登录");
      await refreshServerLibrary("image");
      await refreshServerLibrary("video");
    } catch (error) {
      setAuthError(error?.message || String(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    setAuthUser(null);
    setMedia([]);
    setMediaHistory([]);
    setVideoJob(null);
    setVideoRequestPreview(null);
  }

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(mediaHistory));
  }, [mediaHistory]);

  useEffect(() => {
    const syncHistory = () => setMediaHistory(loadHistory());
    window.addEventListener("grok-workbench-history-updated", syncHistory);
    window.addEventListener("storage", syncHistory);
    return () => {
      window.removeEventListener("grok-workbench-history-updated", syncHistory);
      window.removeEventListener("storage", syncHistory);
    };
  }, []);

  function refreshLocalHistory() {
    setMediaHistory(loadHistory());
  }

  async function refreshServerLibrary(kind = active === "video" ? "video" : "image") {
    try {
      if (kind === "video") {
        await claimRecentOwnership("video", {
          since: Date.now() - 6 * 60 * 60 * 1000,
          limit: 3,
          model: model.video
        });
      }
      const response = await fetch(`/library?kind=${encodeURIComponent(kind)}&limit=60`, { cache: "no-store" });
      if (response.status === 401) {
        setAuthUser(null);
        return [];
      }
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      const items = (Array.isArray(data?.data) ? data.data : []).map((item) => ({
        ...item,
        kind,
        model: item.model || (kind === "video" ? DEFAULT_MODELS.video : DEFAULT_MODELS.image),
        createdAt: item.createdAt || Date.now()
      }));
      setMediaHistory((current) => {
        const otherKind = current.filter((item) => item.kind !== kind);
        return dedupeHistory([...items, ...otherKind]).slice(0, 120);
      });
      return items;
    } catch {
      return [];
    }
  }

  async function loadModels({ silent = false } = {}) {
    if (!requireKey()) return;
    if (!silent) setBusy(true);
    try {
      const data = await api.models();
      const list = (data?.data || []).map((item) => item.id).filter(Boolean);
      setModels(list);
      localStorage.setItem(MODEL_LIST_KEY, JSON.stringify(list));
      const mapped = list.map(normalizeModelOption);
      const chatModel = mapped.find((id) => /grok-composer-2\.5-fast/i.test(id)) || mapped.find((id) => /grok-4\.5/i.test(id)) || mapped.find((id) => /chat/i.test(id));
      const imageModel = mapped.find((id) => /^grok-imagine-image$/i.test(id)) || mapped.find((id) => /image/i.test(id) && !/edit/i.test(id));
      const videoModel = mapped.find((id) => /^grok-imagine-video$/i.test(id)) || mapped.find((id) => /video/i.test(id));
      const voiceModel = mapped.find((id) => /^grok-voice-latest$/i.test(id)) || mapped.find((id) => /voice/i.test(id));
      setModel((current) => ({
        chat: chatModel || current.chat,
        image: imageModel || current.image,
        video: videoModel || current.video,
        voice: voiceModel || current.voice
      }));
      if (!silent) setStatus(`已读取 ${list.length} 个模型`);
    } catch (error) {
      if (!silent) setStatus(formatError(error));
    } finally {
      if (!silent) setBusy(false);
    }
  }

  async function synthesizeVoice() {
    if (!requireKey()) return;
    if (!voiceText.trim()) return setStatus("请输入要合成的文字。");
    if (!voiceId) return setStatus("请先选择音色。");
    setBusy(true);
    try {
      setStatus(voiceLanguage === "auto" ? "正在合成语音" : `正在翻译为${getVoiceLanguageLabel(voiceLanguage)}`);
      const synthesisText = await api.translateForSpeech({
        text: voiceText,
        language: voiceLanguage,
        model: selectChatModel(modelLists.chat)
      });
      setVoiceSynthesisText(synthesisText);
      setStatus("正在合成语音");
      const result = await api.synthesizeSpeech({ model: voiceModel, text: synthesisText, voiceId, language: voiceLanguage, speed: voiceSpeed });
      setVoiceAudio(result);
      setStatus("语音合成完成");
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function previewVoice() {
    if (!requireKey()) return;
    if (!voiceId) return setStatus("请先选择音色。");
    setVoicePreviewBusy(true);
    try {
      const language = voiceLanguage === "auto" ? "zh" : voiceLanguage;
      const sample = VOICE_PREVIEW_TEXT[language] || VOICE_PREVIEW_TEXT.zh;
      setStatus("正在生成音色试听");
      const result = await api.synthesizeSpeech({ model: voiceModel, text: sample, voiceId, language, speed: voiceSpeed });
      setVoiceAudio(result);
      setStatus(`试听完成：${voiceId}`);
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setVoicePreviewBusy(false);
    }
  }

  function onVoiceFile(event) {
    const file = event.target.files?.[0] || null;
    setVoiceFile(file);
    setTranscript("");
  }

  async function transcribeVoice() {
    if (!requireKey()) return;
    if (!voiceFile) return setStatus("请先上传音频文件。");
    setBusy(true);
    try {
      setStatus("正在识别语音");
      const result = await api.transcribeAudio({ file: voiceFile, model: DEFAULT_MODELS.speechToText, language: voiceLanguage });
      setTranscript(result?.text || "接口没有返回识别文本");
      setStatus("语音识别完成");
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflow() {
    if (!requireKey()) return;
    if (workflow.needsImage && !imageDataUrl) return setStatus("这个功能需要先上传图片。");
    if (!workflow.needsImage && !input.trim()) return setStatus("请输入一句话或文字描述。");
    setBusy(true);
    try {
      const text = await api.runPromptWorkflow({
        workflowId,
        input,
        imageDataUrl,
        model: workflow.needsImage ? selectVisionModel(modelLists.chat) : selectChatModel(modelLists.chat)
      });
      setGeneratedPrompt(text);
      setStatus(`${workflow.outputLabel}已生成`);
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function generateMusicPlan() {
    if (!requireKey()) return;
    if (!musicInput.trim()) return setStatus("请描述你想创作的音乐。");
    const profile = MUSIC_LENGTH_PROFILES[musicLength] || MUSIC_LENGTH_PROFILES.standard;
    const messages = buildMusicMessages(musicInput.trim(), musicLength);
    setBusy(true);
    try {
      setStatus(`正在使用 ${displayModelName(musicModel)} 生成${profile.label}参数`);
      const data = await api.chat({ model: musicModel, temperature: 0.85, max_tokens: profile.maxTokens, messages });
      let text = data?.choices?.[0]?.message?.content || "";
      if (!text.trim()) throw new Error("音乐方案没有返回有效内容");
      let parsed = parseMusicPlan(text);
      if (!parsed.descriptionEn || !parsed.descriptionZh || !parsed.lyrics) {
        throw new Error("返回内容缺少英文描述、中文描述或歌词，请重新生成");
      }
      let quality = assessMusicLyrics(parsed.lyrics, musicLength);
      if (!quality.meetsMinimum) {
        setStatus(`歌词只有 ${quality.lineCount} 行，正在自动扩写`);
        const retry = await api.chat({
          model: musicModel,
          temperature: 0.82,
          max_tokens: profile.maxTokens,
          messages: [
            ...messages,
            { role: "assistant", content: text },
            {
              role: "user",
              content: `上一次歌词只有 ${quality.lineCount} 个有效演唱行、约 ${quality.characterCount} 个正文字符，没有达到 ${profile.label}最低要求。请从头重写完整结果，至少 ${profile.minLines} 个有效演唱行、${profile.minCharacters} 个正文字符；每段推进故事，所有重复副歌完整写出，不要用拟声词或器乐说明凑行数。`
            }
          ]
        });
        const retryText = retry?.choices?.[0]?.message?.content || "";
        const retryPlan = parseMusicPlan(retryText);
        const retryQuality = assessMusicLyrics(retryPlan.lyrics, musicLength);
        if (retryPlan.descriptionEn && retryPlan.descriptionZh && retryPlan.lyrics && retryQuality.score > quality.score) {
          text = retryText;
          parsed = retryPlan;
          quality = retryQuality;
        }
      }
      const normalizedPlan = {
        ...parsed,
        maxDuration: normalizeMusicDuration(parsed.maxDuration, parsed.lyrics, musicLength),
        quality
      };
      setMusicPlan(normalizedPlan);
      setStatus(quality.meetsMinimum
        ? `${profile.label}参数已生成，共 ${quality.lineCount} 行歌词`
        : `参数已生成，但歌词仅 ${quality.lineCount} 行；建议切换 grok-4.5 或 grok-4.6 后重试`);
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    if (!requireKey()) return;
    if (!chatInput.trim() && !chatImages.length) return setStatus("请输入聊天内容或添加截图。");
    const userMessage = {
      role: "user",
      content: chatInput.trim(),
      images: chatImages.map(({ name, dataUrl }) => ({ name, dataUrl }))
    };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatImages([]);
    setBusy(true);
    try {
      const usesChatCompletions = /chat/i.test(model.chat);
      const requestMessages = buildMultimodalMessages(nextMessages, usesChatCompletions ? "chat" : "responses");
      const data = usesChatCompletions
        ? await api.chat({ model: model.chat, messages: requestMessages })
        : await api.responses({ model: model.chat, messages: requestMessages });
      const text = extractTextResponse(data);
      setChatMessages([...nextMessages, { role: "assistant", content: text }]);
      setStatus("聊天回复完成");
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createImage() {
    if (!requireKey()) return;
    const originalPrompt = prepareMediaPrompt(generatedPrompt || input, 3800);
    if (!originalPrompt.trim()) return setStatus("请输入或生成图片提示词。");
    setBusy(true);
    try {
      let selectedModel = model.image;
      let prompt = originalPrompt;
      let data = null;
      if (imageDataUrl) {
        setStatus("正在分析参考图并提取视觉约束");
        const referenceDescription = await api.describeReferenceImage({
          prompt: originalPrompt,
          imageDataUrl,
          model: selectVisionModel(modelLists.chat)
        });
        if (!referenceDescription.trim()) throw new Error("参考图分析没有返回有效结果");
        prompt = prepareMediaPrompt([
          originalPrompt,
          "参考图视觉约束（在不冲突时保持）：",
          referenceDescription
        ].join("\n\n"), 3800);
        setStatus("参考图分析完成，正在生成图片");
      }
      try {
        data = await api.generateImage({ prompt, model: selectedModel, ...imageParams });
      } catch (error) {
        const message = String(error?.message || "");
        if (message.includes("502") && selectedModel !== DEFAULT_MODELS.imageQuality) {
          selectedModel = DEFAULT_MODELS.imageQuality;
          setStatus("普通图片线路暂不可用，正在切换高清线路重试");
          data = await api.generateImage({ prompt, model: selectedModel, ...imageParams });
        } else {
          throw error;
        }
      }
      const items = extractMediaItems(data);
      await claimOwnership("image", items, { prompt, model: selectedModel });
      setMedia(items);
      appendHistory("image", items, { prompt, model: selectedModel });
      await refreshServerLibrary("image");
      setStatus("图片生成完成");
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createVideo() {
    if (!requireKey()) return;
    const rawPrompt = String(generatedPrompt || input || "").trim();
    const prompt = prepareVideoPrompt(rawPrompt);
    if (!prompt.trim()) return setStatus("请输入或生成视频提示词。");
    const startedAt = Date.now();
    setBusy(true);
    try {
      if (rawPrompt.length > prompt.length) {
        setStatus("视频提示词已自动压缩，避免超过 4096 限制");
      }
      const requestBody = buildVideoGenerationBody({
        prompt,
        model: model.video,
        ...videoParams,
        image: imageDataUrl || undefined
      });
      setVideoRequestPreview({
        prompt,
        promptChars: prompt.length,
        promptBytes: new TextEncoder().encode(prompt).length,
        body: requestBody
      });
      const data = await api.generateVideo(requestBody);
      const items = extractMediaItems(data);
      const jobId = extractJobId(data);
      setMedia(items);
      setVideoJob(jobId ? { id: jobId, status: "submitted", progress: 0, message: "已提交，等待生成队列处理。" } : null);
      setStatus(jobId ? `视频任务已提交：${jobId}` : "视频请求已提交");
      if (items.length) {
        await claimOwnership("video", items, { prompt, model: model.video });
        const libraryItems = await refreshServerLibrary("video");
        const nextItems = libraryItems.length ? libraryItems.slice(0, 1) : normalizeHistoryItems("video", items);
        setMedia(nextItems);
        appendHistory("video", nextItems, { prompt, model: model.video });
      }
      if (jobId && !items.length) pollVideo(jobId, prompt, model.video, ++pollToken.current, startedAt);
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function pollVideo(jobId, prompt = "", selectedModel = "", token = pollToken.current, startedAt = Date.now()) {
    let attempts = 0;
    let waitMs = 2500;
    while (pollToken.current === token) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      try {
        const data = await api.getVideoSnapshot(jobId);
        const items = extractMediaItems(data);
        const nextStatus = data?.status || data?.state || "in_progress";
        const done = ["completed", "done", "succeeded", "success"].includes(nextStatus);
        const progress = Number(data?.progress ?? data?.percent ?? (done ? 100 : 0));
        const finalEnough = done || progress >= 100 || Boolean(data?.result_asset_id || data?.resultAssetId || data?.video?.url || data?.image?.url || data?.result?.url);
        setVideoJob({
          id: jobId,
          status: finalEnough ? "completed" : nextStatus,
          progress: finalEnough ? 100 : progress,
          message: data?.error?.message || data?.error_message || data?.message || ""
        });
        if (nextStatus === "failed" || nextStatus === "error") {
          setStatus(data?.error_message || data?.message || "视频生成失败");
          return;
        }
        if (items.length || finalEnough) {
          if (items.length) {
            await claimOwnership("video", items, { prompt, model: selectedModel });
          } else {
            await claimRecentOwnership("video", {
              prompt,
              model: selectedModel,
              since: startedAt - 60 * 1000,
              limit: 1
            });
          }
          const libraryItems = await refreshServerLibrary("video");
          const nextItems = libraryItems.length ? libraryItems.slice(0, 1) : normalizeHistoryItems("video", items);
          setMedia(nextItems.slice(0, 1));
          setStatus("视频生成完成");
          appendHistory("video", nextItems.slice(0, 1), { prompt, model: selectedModel });
          return;
        }
        setStatus(`视频生成中 ${data?.progress ?? ""}%`);
        attempts += 1;
        if (attempts >= 20) {
          waitMs = 10000;
          setStatus("视频已提交，后台仍在刷新状态");
        } else if (attempts >= 8) {
          waitMs = 5000;
        }
      } catch (error) {
        setStatus(formatError(error));
        return;
      }
    }
  }

  function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function addChatImages(files) {
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const available = Math.max(0, 4 - chatImages.length);
    if (!available) return setStatus("每条聊天消息最多添加 4 张图片。");
    const accepted = imageFiles.slice(0, available);
    const oversized = accepted.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) return setStatus(`图片 ${oversized.name} 超过 10 MB，请压缩后再上传。`);
    try {
      const additions = await Promise.all(accepted.map(readImageFile));
      setChatImages((current) => [...current, ...additions].slice(0, 4));
      setStatus(imageFiles.length > available
        ? "每条聊天消息最多添加 4 张图片，多余图片未添加。"
        : `已添加 ${additions.length} 张图片`);
    } catch (error) {
      setStatus(formatError(error));
    }
  }

  function removeChatImage(id) {
    setChatImages((current) => current.filter((image) => image.id !== id));
  }

  function copyGeneratedToInput() {
    setInput(generatedPrompt);
    setActive(workflowId === "cinematic-plan" ? "video" : "image");
    setStatus("已放入创作控制台");
  }

  async function claimOwnership(kind, items, meta = {}) {
    if (!authUser || !items?.length) return;
    await fetch("/ownership/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, items, prompt: meta.prompt || "", model: meta.model || "" })
    }).catch(() => {});
  }

  async function claimRecentOwnership(kind, meta = {}) {
    if (!authUser) return [];
    const response = await fetch("/ownership/recent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        prompt: meta.prompt || "",
        model: meta.model || "",
        since: meta.since || 0,
        limit: meta.limit || 3
      })
    }).catch(() => null);
    if (!response?.ok) return [];
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data?.ids) ? data.ids : [];
  }

  if (authUser === undefined) {
    return (
      <main className="page">
        <section className="authPanel"><Loader2 className="spin" />正在检查登录状态</section>
      </main>
    );
  }

  if (!authUser) {
    return (
      <AuthPanel
        mode={authMode}
        setMode={setAuthMode}
        form={authForm}
        setForm={setAuthForm}
        error={authError}
        busy={authBusy}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <main className="page">
      <header className="header">
        <div className="brand">
          <img src="/icon.png" alt="" />
          <div>
            <strong>Grok Workbench</strong>
            <span>v{APP_VERSION}</span>
          </div>
        </div>
        <div className="headerActions">
          <span>{authUser.username}</span>
          <button className="iconButton" onClick={loadModels} title="读取模型">
            {busy ? <Loader2 className="spin" /> : <RefreshCw />}
          </button>
          <button className="logoutButton" onClick={logout}>退出</button>
        </div>
      </header>

      <section className="console">
        <div className="titleRow">
          <div>
            <h1>创作控制台</h1>
            <p>{status}</p>
          </div>
          <select className="keySelect" value={apiKey ? "configured" : "empty"} onChange={() => setActive("settings")}>
            <option value="empty">未配置客户端 Key</option>
            <option value="configured">客户端 Key 已配置</option>
          </select>
        </div>

        <nav className="tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={active === tab.id ? "tab active" : "tab"} onClick={() => setActive(tab.id)}>
                <Icon />{tab.label}
              </button>
            );
          })}
        </nav>

        {active === "settings" ? (
          <SettingsPanel
            baseUrl={baseUrl}
            apiKey={apiKey}
            effectiveBaseUrl={effectiveBaseUrl}
            showKey={showKey}
            setBaseUrl={setBaseUrl}
            setApiKey={setApiKey}
            setShowKey={setShowKey}
            saveSettings={saveSettings}
          />
        ) : active === "chat" ? (
          <ChatPanel
            model={model}
            setModel={setModel}
            modelLists={modelLists}
            chatInput={chatInput}
            setChatInput={setChatInput}
            chatImages={chatImages}
            addChatImages={addChatImages}
            removeChatImage={removeChatImage}
            chatMessages={chatMessages}
            sendChat={sendChat}
            busy={busy}
          />
        ) : active === "prompt" ? (
          <PromptPanel
            workflow={workflow}
            workflowId={workflowId}
            setWorkflowId={setWorkflowId}
            input={input}
            setInput={setInput}
            imageDataUrl={imageDataUrl}
            onFile={onFile}
            generatedPrompt={generatedPrompt}
            runWorkflow={runWorkflow}
            copyGeneratedToInput={copyGeneratedToInput}
            busy={busy}
          />
        ) : active === "voice" ? (
          <VoicePanel
            mode={voiceMode}
            setMode={setVoiceMode}
            model={voiceModel}
            setModel={setVoiceModel}
            models={modelLists.voice}
            voices={voiceList}
            voiceId={voiceId}
            setVoiceId={setVoiceId}
            language={voiceLanguage}
            setLanguage={setVoiceLanguage}
            speed={voiceSpeed}
            setSpeed={setVoiceSpeed}
            text={voiceText}
            setText={setVoiceText}
            file={voiceFile}
            onFile={onVoiceFile}
            audio={voiceAudio}
            synthesisText={voiceSynthesisText}
            transcript={transcript}
            synthesize={synthesizeVoice}
            preview={previewVoice}
            transcribe={transcribeVoice}
            busy={busy}
            previewBusy={voicePreviewBusy}
          />
        ) : active === "music" ? (
          <MusicPanel
            input={musicInput}
            setInput={setMusicInput}
            plan={musicPlan}
            generate={generateMusicPlan}
            model={musicModel}
            setModel={setMusicModel}
            models={musicModels}
            length={musicLength}
            setLength={setMusicLength}
            busy={busy}
          />
        ) : (
          <CreatePanel
            active={active}
            input={input}
            setInput={setInput}
            generatedPrompt={generatedPrompt}
            imageDataUrl={imageDataUrl}
            onFile={onFile}
            model={model}
            setModel={setModel}
            modelLists={modelLists}
            imageParams={imageParams}
            setImageParams={setImageParams}
            videoParams={videoParams}
            setVideoParams={setVideoParams}
            createImage={createImage}
            createVideo={createVideo}
            busy={busy}
            media={media}
            videoJob={videoJob}
            videoRequestPreview={videoRequestPreview}
            mediaHistory={mediaHistory}
            refreshLocalHistory={refreshLocalHistory}
            refreshServerLibrary={refreshServerLibrary}
          />
        )}
      </section>
    </main>
  );
}

function MusicPanel({ input, setInput, plan, generate, model, setModel, models, length, setLength, busy }) {
  const [copied, setCopied] = useState("");

  async function copyField(name, value) {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(name);
    window.setTimeout(() => setCopied((current) => current === name ? "" : current), 1600);
  }

  return (
    <section className="musicPanel">
      <div className="musicIntro">
        <div>
          <h2>音乐创作设定</h2>
          <p>生成 MiniMax Music 3 所需的英文描述、中文说明、歌词和自动时长。</p>
        </div>
        <span>{displayModelName(model)}</span>
      </div>
      <div className="musicComposer">
        <label htmlFor="music-brief">音乐想法</label>
        <textarea
          id="music-brief"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="例如：一首关于深夜城市和重新出发的中文流行电子歌曲，女声，克制但有希望，适合片尾。"
        />
        <div className="controlBar">
          <div className="musicControls">
            <label className="musicSelect">
              <span>创作模型</span>
              <select value={model} onChange={(event) => setModel(event.target.value)} disabled={busy}>
                {models.map((item) => <option key={item} value={item}>{displayModelName(item)}</option>)}
              </select>
            </label>
            <div className="musicLength" role="group" aria-label="歌曲长度">
              {Object.entries(MUSIC_LENGTH_PROFILES).map(([id, profile]) => (
                <button
                  key={id}
                  type="button"
                  className={length === id ? "selected" : ""}
                  onClick={() => setLength(id)}
                  disabled={busy}
                  aria-pressed={length === id}
                >
                  <strong>{profile.label}</strong>
                  <span>{profile.durationLabel}</span>
                </button>
              ))}
            </div>
          </div>
          <button className="primary" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Music2 />}生成 MiniMax 参数
          </button>
        </div>
      </div>
      {plan && (
        <div className="musicOutputs">
          <div className="resultBlock musicResult">
            <div className="resultHead">
              <strong>Description / English</strong>
              <button onClick={() => copyField("descriptionEn", plan.descriptionEn)}>
                {copied === "descriptionEn" ? <Check /> : <Copy />}{copied === "descriptionEn" ? "已复制" : "复制"}
              </button>
            </div>
            <pre>{plan.descriptionEn}</pre>
          </div>
          <div className="resultBlock musicResult">
            <div className="resultHead">
              <strong>中文描述</strong>
              <button onClick={() => copyField("descriptionZh", plan.descriptionZh)}>
                {copied === "descriptionZh" ? <Check /> : <Copy />}{copied === "descriptionZh" ? "已复制" : "复制"}
              </button>
            </div>
            <pre>{plan.descriptionZh}</pre>
          </div>
          <div className="resultBlock musicResult lyricsResult">
            <div className="resultHead">
              <strong>Lyrics / 歌词{plan.quality ? ` · ${plan.quality.lineCount} 行` : ""}</strong>
              <button onClick={() => copyField("lyrics", plan.lyrics)}>
                {copied === "lyrics" ? <Check /> : <Copy />}{copied === "lyrics" ? "已复制" : "复制"}
              </button>
            </div>
            <pre>{plan.lyrics}</pre>
          </div>
          <div className="resultBlock durationResult">
            <div className="resultHead">
              <strong>max_duration / 自动时长</strong>
              <button onClick={() => copyField("duration", String(plan.maxDuration))}>
                {copied === "duration" ? <Check /> : <Copy />}{copied === "duration" ? "已复制" : "复制"}
              </button>
            </div>
            <pre>{plan.maxDuration}</pre>
          </div>
        </div>
      )}
    </section>
  );
}

function buildMusicMessages(input, length) {
  const profile = MUSIC_LENGTH_PROFILES[length] || MUSIC_LENGTH_PROFILES.standard;
  const language = inferMusicLanguage(input);
  return [
    {
      role: "system",
      content: [
        "你是一名资深音乐制作人、作词人和 MiniMax Music 3 提示词设计师。",
        "根据用户的音乐想法，生成可直接填入本地 ComfyUI Text to Music (MiniMax Music 3) 节点的 description、lyrics 和 max_duration。不要调用音乐生成服务，也不要声称已经生成音频。",
        "即使用户只提供风格、语言或人声，也要在内部补全一个具体而连贯的创作设定：核心人物、关系或目标、明确场景、情绪起点、冲突/变化和最终落点。不要向用户反问。",
        "DESCRIPTION_EN 必须是纯英文，明确 song/lyrics language，并包含 genre、mood、tempo/BPM、time signature、key、vocals、instruments、arrangement、mixing、情绪弧线和逐段歌曲结构。描述每一段如何服务歌词故事，不要只罗列乐器。",
        "把负面约束写入 DESCRIPTION_EN 末尾的 Avoid 部分，不生成独立 Negative Prompt。Avoid 至少覆盖 noise、distortion、clipping、auto-tune artifacts、runaway pitch、over-compression、abrupt loop、muddy mix、harsh highs、weak bass、nasal male vocals 和 unprofessional audio。",
        "DESCRIPTION_ZH 必须使用简体中文，是 DESCRIPTION_EN 的忠实中文说明；保留语言、BPM、调性、段落结构、情绪推进、制作要求和 Avoid 约束，不得增加英文描述没有的要求。",
        `歌曲长度模式：${profile.label}，目标 ${profile.durationLabel}，MAX_DURATION 必须在 ${profile.minDuration}-${profile.maxDuration} 秒之间。`,
        `LYRICS 必须是一首完整歌曲而不是提纲。段落结构和行数目标：${profile.structure}。段落标签不计入演唱行数；总计至少 ${profile.minLines} 个非空演唱行、约 ${profile.minCharacters} 个正文字符。`,
        "所有重复的 Pre-Chorus、Chorus 和 Final Chorus 都必须把歌词完整写出，不得写 Repeat、同上、省略或只放段落标签。除 Intro/Outro 外，每个段落必须有实质歌词。拟声词、哼唱或无意义音节最多两行，不能用来凑长度。",
        "Verse 1 建立人物与具体场景；Verse 2 必须带来新事件、发现或矛盾，不能换词复述；Bridge 必须产生视角或情绪转折；Final Chorus 在保留核心记忆点的同时完成升华。使用可观察的细节和自然口语，避免连续堆砌空泛成语、陈词滥调和不相关意象。",
        "歌词要自然可唱，控制单行长度，注意节奏、押韵和副歌记忆点。副歌应有清晰钩子，但不能靠机械重复同一句填满整段。",
        "LYRICS 只放可演唱歌词和 [Intro]、[Verse 1]、[Pre-Chorus]、[Chorus]、[Post-Chorus]、[Verse 2]、[Bridge]、[Final Chorus]、[Outro] 等英文段落标签；不要加入制作说明、Markdown 标题、项目符号或星号。",
        "严格遵守用户指定的歌曲语言：中文使用对应中文书写，韩语使用 Hangul，日语使用自然 Kanji/Kana，其他语言使用其本地书写系统。不得用拼音、罗马字或英文翻译代替，除非用户明确要求。DESCRIPTION_EN 的英文要求不得改变歌词语言。",
        "MAX_DURATION 要综合 BPM、有效歌词字数、演唱速度、前奏/间奏/尾奏和重复段落估算，必须足够唱完全部歌词，并与所选长度模式一致。只输出整数秒数。",
        "严格按以下边界输出，不要添加解释、代码围栏或其他内容：",
        "<<<DESCRIPTION_EN>>>",
        "English description",
        "<<<DESCRIPTION_ZH>>>",
        "中文描述",
        "<<<LYRICS>>>",
        "lyrics 内容",
        "<<<MAX_DURATION>>>",
        "整数秒数",
        "<<<END>>>"
      ].join("\n")
    },
    {
      role: "user",
      content: `${input}\n\nSong language requirement: ${language}. DESCRIPTION_EN must explicitly state this song/lyrics language, and LYRICS must be written in this language.`
    }
  ];
}

function assessMusicLyrics(lyrics, length) {
  const profile = MUSIC_LENGTH_PROFILES[length] || MUSIC_LENGTH_PROFILES.standard;
  const lines = String(lyrics || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]$/.test(line));
  const characterCount = lines.join("").replace(/[\s\p{P}\p{S}]/gu, "").length;
  const lineScore = Math.min(1, lines.length / profile.minLines);
  const characterScore = Math.min(1, characterCount / profile.minCharacters);
  return {
    lineCount: lines.length,
    characterCount,
    meetsMinimum: lines.length >= profile.minLines && characterCount >= profile.minCharacters,
    score: lineScore + characterScore
  };
}

function normalizeMusicDuration(value, lyrics, length) {
  const profile = MUSIC_LENGTH_PROFILES[length] || MUSIC_LENGTH_PROFILES.standard;
  const quality = assessMusicLyrics(lyrics, length);
  const estimatedVocalSeconds = Math.round(quality.characterCount / 2.2);
  const densityMinimum = Math.min(profile.maxDuration, Math.max(profile.minDuration, estimatedVocalSeconds + 36));
  const proposed = Math.round(Number.parseFloat(value) || densityMinimum);
  return Math.max(densityMinimum, Math.min(profile.maxDuration, proposed));
}

function parseMusicPlan(text) {
  const value = String(text || "").replace(/```(?:text|markdown)?/gi, "").replace(/```/g, "").trim();
  try {
    const json = JSON.parse(value);
    const descriptionEn = json?.description_en ?? json?.descriptionEn ?? json?.description;
    const descriptionZh = json?.description_zh ?? json?.descriptionZh ?? json?.chinese_description;
    if (descriptionEn && json?.lyrics) {
      return {
        descriptionEn: String(descriptionEn).trim(),
        descriptionZh: String(descriptionZh || "").trim(),
        lyrics: String(json.lyrics).trim(),
        maxDuration: clampMusicDuration(json?.max_duration ?? json?.maxDuration)
      };
    }
  } catch {}

  const clean = value.replace(/^\s*[*_]+|[*_]+\s*$/gm, "");
  const marker = (names) => new RegExp(`(?:^|\\n)\\s*(?:#{1,4}\\s*)?(?:<<<)?(?:${names})(?:>>>)?\\s*[:：]?\\s*`, "i");
  const headers = {
    descriptionEn: marker("DESCRIPTION_EN|English\\s+Description|Description\\s*\\(English\\)|Description\\s*\\/\\s*English|Description\\s*\\/\\s*音乐描述|DESCRIPTION"),
    descriptionZh: marker("DESCRIPTION_ZH|Chinese\\s+Description|Description\\s*\\(中文\\)|中文描述|中文说明"),
    lyrics: marker("LYRICS|Lyrics\\s*\\/\\s*歌词|歌词"),
    maxDuration: marker("MAX_DURATION|max_duration|自动时长")
  };
  const positions = Object.entries(headers)
    .map(([name, regex]) => ({ name, match: regex.exec(clean) }))
    .filter((item) => item.match)
    .sort((a, b) => a.match.index - b.match.index);
  const sections = {};
  positions.forEach((item, index) => {
    const start = item.match.index + item.match[0].length;
    const next = positions[index + 1]?.match.index ?? clean.length;
    sections[item.name] = clean.slice(start, next).replace(/\n?\s*<<<END>>>[\s\S]*$/i, "").trim();
  });

  let descriptionEn = sections.descriptionEn || "";
  const negative = clean.match(/(?:^|\n)\s*#{1,4}\s*(?:Negative Prompt|负面提示词)\s*\n([\s\S]*?)(?=\n\s*#{1,4}\s*|$)/i)?.[1]?.trim();
  if (descriptionEn && negative && !/\bAvoid\b/i.test(descriptionEn)) descriptionEn += `\n\nAvoid: ${negative}`;
  return {
    descriptionEn,
    descriptionZh: sections.descriptionZh || "",
    lyrics: sections.lyrics || "",
    maxDuration: clampMusicDuration(sections.maxDuration)
  };
}

function clampMusicDuration(value) {
  return Math.max(30, Math.min(600, Math.round(Number.parseFloat(value) || 210)));
}

function inferMusicLanguage(input) {
  const value = String(input || "");
  const languages = [
    [/(?:韩文|韓文|韩语|韓語|朝鲜语|朝鮮語|k[- ]?pop|한국어|korean)/i, "Korean (native Hangul lyrics, not romanization)"],
    [/(?:日文|日语|日語|j[- ]?pop|日本語|japanese)/i, "Japanese (native Kanji and Kana lyrics, not romaji)"],
    [/(?:粤语|粵語|广东话|廣東話|cantonese)/i, "Cantonese Chinese (natural written Cantonese lyrics)"],
    [/(?:繁体中文|繁體中文|traditional chinese)/i, "Mandarin Chinese (Traditional Chinese lyrics)"],
    [/(?:中文|汉语|漢語|国语|國語|普通话|普通話|中文歌|中文歌曲|华语|華語|mandarin|chinese)/i, "Mandarin Chinese (Simplified Chinese lyrics)"],
    [/(?:英文|英语|英語|英文歌|英文歌曲|english)/i, "English"],
    [/(?:法文|法语|法語|french)/i, "French"],
    [/(?:西班牙文|西班牙语|西班牙語|spanish)/i, "Spanish"],
    [/(?:德文|德语|德語|german)/i, "German"],
    [/(?:意大利文|意大利语|義大利語|italian)/i, "Italian"],
    [/(?:葡萄牙文|葡萄牙语|葡萄牙語|portuguese)/i, "Portuguese"],
    [/(?:俄文|俄语|俄語|russian)/i, "Russian (native Cyrillic lyrics)"],
    [/(?:泰文|泰语|泰語|thai)/i, "Thai (native Thai script lyrics)"],
    [/(?:越南文|越南语|越南語|vietnamese)/i, "Vietnamese"],
    [/(?:阿拉伯文|阿拉伯语|阿拉伯語|arabic)/i, "Arabic (native Arabic script lyrics)"],
    [/(?:印地文|印地语|印地語|hindi)/i, "Hindi (native Devanagari lyrics)"],
    [/(?:印尼文|印尼语|印尼語|indonesian)/i, "Indonesian"],
    [/(?:马来文|馬來文|马来语|馬來語|malay)/i, "Malay"],
    [/(?:土耳其文|土耳其语|土耳其語|turkish)/i, "Turkish"]
  ];
  const matched = languages.find(([pattern]) => pattern.test(value));
  if (matched) return matched[1];

  const explicitLanguage = value.match(/(?:使用|用|以)\s*([^，。,.；;\n]{1,16}(?:语|語|文))\s*(?:写|寫|演唱|唱|创作|創作|歌词|歌詞)?/i)?.[1];
  if (explicitLanguage) return `the language explicitly requested by the user (${explicitLanguage}), using its native writing system`;

  if (/[\uac00-\ud7af]/.test(value)) return "Korean (native Hangul lyrics, not romanization)";
  if (/[\u3040-\u30ff]/.test(value)) return "Japanese (native Kanji and Kana lyrics, not romaji)";
  const chineseChars = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWords = (value.match(/[a-z]+/gi) || []).length;
  return chineseChars >= Math.max(2, latinWords) ? "Mandarin Chinese (Simplified Chinese lyrics)" : "English";
}

async function copyText(value) {
  const text = String(value ?? "");
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}

function AuthPanel({ mode, setMode, form, setForm, error, busy, onSubmit }) {
  const isRegister = mode === "register";
  return (
    <main className="page authPage">
      <section className="authCard">
        <div className="brand authBrand">
          <img src="/icon.png" alt="" />
          <div>
            <strong>Grok Workbench</strong>
            <span>用户空间</span>
          </div>
        </div>
        <h1>{isRegister ? "注册账号" : "登录账号"}</h1>
        <p>登录后只能看到自己生成的图片和视频库。</p>
        <form onSubmit={onSubmit}>
          <label>
            <span>用户名</span>
            <input
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              autoComplete="username"
              placeholder="username"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder="至少 6 位"
            />
          </label>
          {error && <div className="authError">{error}</div>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <KeyRound />}{isRegister ? "注册并登录" : "登录"}
          </button>
        </form>
        <button className="textButton" onClick={() => setMode(isRegister ? "login" : "register")}>
          {isRegister ? "已有账号，去登录" : "没有账号，去注册"}
        </button>
      </section>
    </main>
  );
}

function PromptPanel(props) {
  const {
    workflow,
    workflowId,
    setWorkflowId,
    input,
    setInput,
    imageDataUrl,
    onFile,
    generatedPrompt,
    runWorkflow,
    copyGeneratedToInput,
    busy
  } = props;

  return (
    <section className="promptLayout">
      <div className="workflowGrid">
        {PROMPT_WORKFLOWS.map((item) => (
          <button key={item.id} className={workflowId === item.id ? "workflow active" : "workflow"} onClick={() => setWorkflowId(item.id)}>
            <strong>{item.title}</strong>
            <span>{item.needsImage ? "参考图分析" : item.id === "cinematic-plan" ? "影视方案" : "图片 Prompt"}</span>
          </button>
        ))}
      </div>

      <div className="editorBlock">
        <label>{workflow.inputLabel}</label>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={workflow.placeholder} />
        <div className="controlBar">
          {workflow.needsImage && <FileButton onFile={onFile} label="上传图片" />}
          <button className="primary" onClick={runWorkflow}>
            {busy ? <Loader2 className="spin" /> : <Sparkles />}{workflow.shortTitle}
          </button>
        </div>
      </div>

      {imageDataUrl && <img className="reference" src={imageDataUrl} alt="参考图" />}

      {generatedPrompt && (
        <div className="resultBlock">
          <div className="resultHead">
            <strong>{workflow.outputLabel}</strong>
            <button onClick={copyGeneratedToInput}>用于创作</button>
          </div>
          <pre>{generatedPrompt}</pre>
        </div>
      )}
    </section>
  );
}

function ChatPanel({ model, setModel, modelLists, chatInput, setChatInput, chatImages, addChatImages, removeChatImage, chatMessages, sendChat, busy }) {
  function handlePaste(event) {
    const fileImages = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
    const itemImages = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    const images = fileImages.length ? fileImages : itemImages;
    if (!images.length) return;
    event.preventDefault();
    addChatImages(images);
  }

  return (
    <section className="chatPanel">
      <div className="messages">
        {chatMessages.length === 0 ? (
          <div className="emptyTitle">今天想聊什么？</div>
        ) : (
          chatMessages.map((message, index) => (
            <article key={index} className={`message ${message.role}`}>
              <strong>{message.role === "user" ? "你" : "Grok"}</strong>
              {message.content && <p>{message.content}</p>}
              {!!message.images?.length && (
                <div className="messageImages">
                  {message.images.map((image, imageIndex) => (
                    <img key={`${image.name}-${imageIndex}`} src={image.dataUrl} alt={image.name || `聊天图片 ${imageIndex + 1}`} />
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </div>
      <div className="composer">
        {!!chatImages.length && (
          <div className="chatImagePreviews">
            {chatImages.map((image) => (
              <figure key={image.id}>
                <img src={image.dataUrl} alt={image.name} />
                <button type="button" onClick={() => removeChatImage(image.id)} title={`移除 ${image.name}`} aria-label={`移除 ${image.name}`}>
                  <X />
                </button>
              </figure>
            ))}
          </div>
        )}
        <textarea
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          onPaste={handlePaste}
          placeholder="输入内容，或按 Ctrl+V 粘贴截图。"
        />
        <div className="controlBar">
          <label className="chatImageButton" title="添加图片">
            <ImagePlus />
            <span>添加图片</span>
            <input type="file" accept="image/*" multiple onChange={(event) => { addChatImages(event.target.files); event.target.value = ""; }} />
          </label>
          <select value={model.chat} onChange={(event) => setModel({ ...model, chat: event.target.value })}>
            {modelLists.chat.map((item) => <option key={item} value={item}>{displayModelName(item)}</option>)}
          </select>
          <button className="sendButton" onClick={sendChat} disabled={busy} title="发送">
            {busy ? <Loader2 className="spin" /> : <Send />}
          </button>
        </div>
      </div>
    </section>
  );
}

function VoicePanel({ mode, setMode, model, setModel, models, voices, voiceId, setVoiceId, language, setLanguage, speed, setSpeed, text, setText, file, onFile, audio, synthesisText, transcript, synthesize, preview, transcribe, busy, previewBusy }) {
  const isTts = mode === "tts";
  return (
    <section className="voicePanel">
      <div className="emptyTitle">{isTts ? "输入文字，生成一段语音" : "上传音频，识别语音内容"}</div>
      <div className="voiceModes">
        <button className={isTts ? "active" : ""} onClick={() => setMode("tts")}><Volume2 />合成语音</button>
        <button className={!isTts ? "active" : ""} onClick={() => setMode("stt")}><Mic />识别语音</button>
      </div>

      {isTts ? (
        <div className="voiceComposer">
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="输入要合成的文本。" />
          <div className="controlBar">
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {models.map((item) => <option key={item} value={item}>{displayModelName(item)}</option>)}
            </select>
            <select value={voiceId} onChange={(event) => setVoiceId(event.target.value)} disabled={!voices.length}>
              {voices.length ? voices.map((item) => <option key={item.voice_id} value={item.voice_id}>{item.name || item.voice_id}</option>) : <option value="">正在读取音色</option>}
            </select>
            <button className="secondaryButton" onClick={preview} disabled={previewBusy || !voiceId} title="试听当前音色">
              {previewBusy ? <Loader2 className="spin" /> : <Volume2 />}试听
            </button>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {VOICE_LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {[0.75, 1, 1.25, 1.5].map((item) => <option key={item} value={item}>{item}x</option>)}
            </select>
            <button className="sendButton" onClick={synthesize}>{busy ? <Loader2 className="spin" /> : <Send />}</button>
          </div>
        </div>
      ) : (
        <div className="voiceComposer">
          <label className="audioUpload"><Upload />选择音频文件<input type="file" accept="audio/*" onChange={onFile} /></label>
          {file && <div className="voiceFile">{file.name}</div>}
          <div className="controlBar">
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {VOICE_LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="primary" onClick={transcribe}>{busy ? <Loader2 className="spin" /> : <Mic />}开始识别</button>
          </div>
        </div>
      )}

      {audio?.url && (
        <div className="voiceResult">
          <audio controls src={audio.url} />
          <a href={audio.url} download="grok-voice.mp3"><Download />下载音频</a>
        </div>
      )}
      {synthesisText && synthesisText !== text.trim() && (
        <div className="resultBlock"><div className="resultHead"><strong>实际合成文本</strong></div><pre>{synthesisText}</pre></div>
      )}
      {transcript && <div className="resultBlock"><div className="resultHead"><strong>识别结果</strong></div><pre>{transcript}</pre></div>}
    </section>
  );
}

function CreatePanel(props) {
  const {
    active,
    input,
    setInput,
    generatedPrompt,
    imageDataUrl,
    onFile,
    model,
    setModel,
    modelLists,
    imageParams,
    setImageParams,
    videoParams,
    setVideoParams,
    createImage,
    createVideo,
    busy,
    media,
    videoJob,
    videoRequestPreview,
    mediaHistory,
    refreshLocalHistory,
    refreshServerLibrary
  } = props;
  const isVideo = active === "video";
  const currentHistory = mediaHistory.filter((item) => item.kind === (isVideo ? "video" : "image"));

  return (
    <section className="creator">
      <div className="emptyTitle">{isVideo ? "描述你的想法，生成一段视频" : "描述你的想法，生成一幅图片"}</div>
      <div className="composer">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={isVideo ? "描述视频画面、动作、镜头和节奏。" : "描述要生成的画面、主体、风格和细节。"}
        />
        {generatedPrompt && <div className="draftHint">已生成提示词，可直接修改后创作。</div>}
        <div className="controlBar">
          <select value={model[isVideo ? "video" : "image"]} onChange={(event) => setModel({ ...model, [isVideo ? "video" : "image"]: event.target.value })}>
            {(isVideo ? modelLists.video : modelLists.image).map((item) => <option key={item} value={item}>{displayModelName(item)}</option>)}
          </select>

          {isVideo ? (
            <>
              <FileButton onFile={onFile} label="参考图片" />
              <select value={videoParams.duration} onChange={(event) => setVideoParams({ ...videoParams, duration: Number(event.target.value) })}>
                {[6, 10, 15].map((item) => <option key={item} value={item}>{item}s</option>)}
              </select>
              <select value={videoParams.aspectRatio} onChange={(event) => setVideoParams({ ...videoParams, aspectRatio: event.target.value })}>
                {["16:9", "9:16", "1:1"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={videoParams.resolution} onChange={(event) => setVideoParams({ ...videoParams, resolution: event.target.value })}>
                {["720p", "1080p"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </>
          ) : (
            <>
              <FileButton onFile={onFile} label="参考图片" />
              <select value={imageParams.count} onChange={(event) => setImageParams({ ...imageParams, count: Number(event.target.value) })}>
                {[1, 2, 4].map((item) => <option key={item} value={item}>{item}x</option>)}
              </select>
              <select value={imageParams.aspectRatio} onChange={(event) => setImageParams({ ...imageParams, aspectRatio: event.target.value })}>
                {["1:1", "16:9", "9:16", "4:3", "3:4"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={imageParams.resolution} onChange={(event) => setImageParams({ ...imageParams, resolution: event.target.value })}>
                {["1k", "2k"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </>
          )}

          <button className="sendButton" onClick={isVideo ? createVideo : createImage}>
            {busy ? <Loader2 className="spin" /> : <Send />}
          </button>
        </div>
      </div>

      {imageDataUrl && <img className="reference" src={imageDataUrl} alt="参考图" />}

      {isVideo && videoJob && (
        <div className="jobStatus">
          <div>
            <strong>视频任务：{videoJob.id}</strong>
            <span>{formatJobStatus(videoJob.status)}{Number.isFinite(videoJob.progress) ? ` · ${videoJob.progress}%` : ""}</span>
          </div>
          <div className="progressTrack">
            <i style={{ width: `${Math.max(4, Math.min(100, Number(videoJob.progress) || 4))}%` }} />
          </div>
          {videoJob.message && <p>{videoJob.message}</p>}
        </div>
      )}

      {isVideo && videoRequestPreview && (
        <div className="resultBlock">
          <div className="resultHead">
            <strong>实际发送</strong>
            <span>{videoRequestPreview.promptChars} 字 / {videoRequestPreview.promptBytes} 字节</span>
          </div>
          <pre>{videoRequestPreview.prompt}</pre>
          <pre>{JSON.stringify(videoRequestPreview.body, null, 2)}</pre>
        </div>
      )}

      <div className="gallery">
        {media.map((item) => <MediaCard key={item.id} item={item} />)}
      </div>

      <div className="historyBlock">
        <div className="resultHead">
          <strong>{isVideo ? "视频库" : "图库"}</strong>
          <button onClick={() => refreshServerLibrary(isVideo ? "video" : "image")}>刷新</button>
        </div>
        {currentHistory.length ? (
          <div className="gallery historyGrid">
            {currentHistory.map((item) => <MediaCard key={`${item.kind}-${item.id}-${item.createdAt || 0}`} item={item} compact />)}
          </div>
        ) : (
          <div className="historyEmpty">还没有历史记录</div>
        )}
      </div>
    </section>
  );
}

function MediaCard({ item, compact = false }) {
  const url = item.url || (item.b64 ? `data:image/png;base64,${item.b64}` : "");
  if (!url) return null;

  const mime = String(item.mime || "").toLowerCase();
  const isVideo = item.kind === "video" || mime.includes("video") || /\.mp4(\?|$)/i.test(url) || /\/asset\/vid_/i.test(url);
  const downloadUrl = getDownloadUrl(url);

  return (
    <figure className="mediaCard">
      {isVideo ? (
        <video src={url} controls playsInline preload="metadata" />
      ) : (
        <img src={url} alt="" />
      )}
      <figcaption>
        <div className="mediaMeta">
          <strong>{compact && item.note ? item.note : (item.model || (isVideo ? "视频" : "图片"))}</strong>
          {item.createdAt ? <span>{formatTimestamp(item.createdAt)}</span> : null}
        </div>
        <a href={url} target="_blank" rel="noreferrer" title="打开原图/视频">
          <ExternalLink />打开
        </a>
        <a href={downloadUrl} download title="下载到本地">
          <Download />下载
        </a>
      </figcaption>
    </figure>
  );
}

function getDownloadUrl(url) {
  if (url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

function appendHistory(kind, items, meta = {}) {
  const now = Date.now();
  const stamped = normalizeHistoryItems(kind, items)
    .filter(Boolean)
    .map((item, index) => ({
      ...item,
      kind,
      prompt: meta.prompt || "",
      model: meta.model || "",
      createdAt: now - index,
      note: meta.prompt ? meta.prompt.slice(0, 120) : ""
    }));
  if (!stamped.length) return;
  const current = loadHistory();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(dedupeHistory([...stamped, ...current]).slice(0, 80)));
  // Keep the open view in sync without forcing a reload.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("grok-workbench-history-updated"));
  }
}

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? normalizeHistoryItems("", raw) : [];
  } catch {
    return [];
  }
}

function normalizeHistoryItems(kind, items) {
  return (items || []).map((item) => {
    const nextKind = kind || item.kind || "";
    const id = String(item.id || "");
    const normalized = { ...item, kind: nextKind };
    if (id.startsWith("vid_")) {
      normalized.url = `/asset/${encodeURIComponent(id)}`;
      normalized.mime = "video/mp4";
      normalized.kind = "video";
    } else if (id.startsWith("img_")) {
      normalized.url = `/asset/${encodeURIComponent(id)}`;
      normalized.mime = normalized.mime || "image/jpeg";
      normalized.kind = "image";
    }
    if (nextKind === "video" && !String(normalized.url || "").startsWith("/asset/vid_")) return null;
    return normalized;
  }).filter(Boolean);
}

function dedupeHistory(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = `${item.kind || ""}:${item.id || item.url || item.createdAt || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function formatTimestamp(value) {
  const date = new Date(Number(value) || Date.now());
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { hour12: false });
}

function SettingsPanel({ baseUrl, apiKey, effectiveBaseUrl, showKey, setBaseUrl, setApiKey, setShowKey, saveSettings }) {
  return (
    <section className="settings">
      <label>
        <span>Grok2API 地址</span>
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="/api" />
        {effectiveBaseUrl !== baseUrl.trim().replace(/\/+$/, "") && (
          <em>Web 部署环境会自动使用同源代理：{effectiveBaseUrl}</em>
        )}
      </label>
      <label>
        <span>完整客户端 Key</span>
        <div className="secretInput">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck="false"
          />
          <button type="button" onClick={() => setShowKey(!showKey)} title={showKey ? "隐藏 Key" : "显示 Key"}>
            {showKey ? <EyeOff /> : <Eye />}
          </button>
        </div>
      </label>
      <button className="primary" onClick={saveSettings}><KeyRound />保存设置</button>
    </section>
  );
}

function FileButton({ onFile, label }) {
  return (
    <label className="fileButton">
      <Upload />{label}
      <input type="file" accept="image/*" onChange={onFile} />
    </label>
  );
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name || "截图.png",
      dataUrl: String(reader.result || "")
    });
    reader.onerror = () => reject(new Error(`无法读取图片 ${file.name || ""}`.trim()));
    reader.readAsDataURL(file);
  });
}

function buildMultimodalMessages(messages, mode) {
  return messages.map((message) => {
    if (!message.images?.length) return { role: message.role, content: message.content };
    const text = message.content || "请查看并分析上传的图片。";
    const content = mode === "responses"
      ? [
          { type: "input_text", text },
          ...message.images.map((image) => ({ type: "input_image", image_url: image.dataUrl }))
        ]
      : [
          { type: "text", text },
          ...message.images.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } }))
        ];
    return { role: message.role, content };
  });
}

function formatError(error) {
  const message = error?.message || String(error);
  if (message.includes("Failed to fetch")) return "无法连接接口：请确认 Web 已通过 Docker 部署，或本地 Vite 代理已启动。";
  if (message.includes("401")) return "客户端 Key 无效或未填写完整 Key。";
  return message;
}

function formatJobStatus(value) {
  const status = String(value || "");
  if (status === "submitted") return "已提交";
  if (status === "queued") return "排队中";
  if (status === "in_progress") return "生成中";
  if (status === "completed") return "已完成";
  if (status === "done" || status === "succeeded" || status === "success") return "已完成";
  if (status === "failed" || status === "error") return "失败";
  return status || "处理中";
}

function prepareMediaPrompt(value, maxLength = 3800) {
  const raw = String(value || "").trim();
  const markers = [
    "可直接用于视频生成模型的中文 Prompt",
    "可直接用于视频生成模型的中文Prompt",
    "中文 Prompt",
    "中文Prompt",
    "可直接使用的提示词",
    "English Prompt"
  ];
  let text = raw;
  for (const marker of markers) {
    const index = raw.lastIndexOf(marker);
    if (index >= 0) {
      text = raw.slice(index + marker.length).replace(/^[:：\s]+/, "").trim();
      break;
    }
  }
  return text.replace(/```[\s\S]*?```/g, "").slice(0, maxLength);
}

function prepareVideoPrompt(value) {
  const compact = prepareMediaPrompt(value, 8000);
  const lines = compact
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const priority = lines.filter((line) => /主体|动作|镜头|节奏|风格|光线|场景|构图|时长|运镜|视频|Prompt|English/i.test(line));
  const merged = [...priority, ...lines].join("，");
  return clampUtf8Client(merged.slice(0, 1200), 3600);
}

function clampUtf8Client(value, maxBytes) {
  let bytes = 0;
  let output = "";
  const encoder = new TextEncoder();
  for (const char of String(value || "")) {
    const charBytes = encoder.encode(char).length;
    if (bytes + charBytes > maxBytes) break;
    output += char;
    bytes += charBytes;
  }
  return output;
}

function extractTextResponse(data) {
  const chatText = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text;
  if (chatText) return chatText;
  if (typeof data?.output_text === "string") return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      if (block?.text) parts.push(block.text);
      if (block?.type === "output_text" && block?.text) parts.push(block.text);
    }
  }
  return parts.join("\n") || "接口没有返回文本";
}

function normalizeWebBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw || raw === "/") return "/api";
  try {
    const url = new URL(raw);
    if (url.hostname === "grok.sky423.cn" && url.port === "18888") return "/api";
  } catch {
    // Relative paths such as /api are valid here.
  }
  return raw;
}

function normalizeModelOption(id) {
  const value = String(id || "");
  if (value === "Web/grok-imagine-image-2.0") return "grok-imagine-image-2.0";
  if (value === "Web/grok-imagine-image") return "grok-imagine-image";
  if (value === "Web/grok-imagine-image-quality") return "grok-imagine-image-quality";
  if (value === "Web/grok-imagine-video") return "grok-imagine-video";
  if (value.startsWith("Console/")) return value.slice("Console/".length);
  if (value.startsWith("Build/")) return value.slice("Build/".length);
  return value;
}

function loadSavedModels() {
  try {
    const value = JSON.parse(localStorage.getItem(MODEL_LIST_KEY) || "[]");
    return Array.isArray(value) ? value.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function displayModelName(id) {
  return String(id || "").replace(/^(Web|Console|Build)\//, "");
}

function getVoiceLanguageLabel(value) {
  return VOICE_LANGUAGES.find(([id]) => id === value)?.[1] || value;
}

function getMusicModels(models) {
  const available = unique((models || [])
    .map(normalizeModelOption)
    .filter((model) => MUSIC_MODEL_FALLBACKS.some((candidate) => candidate.toLowerCase() === model.toLowerCase())));
  return available.length ? available : MUSIC_MODEL_FALLBACKS;
}

function selectChatModel(models) {
  return (models || []).find((item) => /chat/i.test(item)) || DEFAULT_MODELS.chat;
}

function selectVisionModel(models) {
  const list = models || [];
  return list.find((item) => /grok-4\.5|grok-4\b|grok-4\.3|grok-4\.20|composer|build/i.test(item))
    || list.find((item) => !/chat-fast|chat-auto/i.test(item))
    || DEFAULT_MODELS.chat;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

createRoot(document.getElementById("root")).render(<App />);
