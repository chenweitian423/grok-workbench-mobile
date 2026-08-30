import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { DEFAULT_MODELS, DEFAULT_SERVER_BASE_URL, GrokApi, PROMPT_TOOLS, PROMPT_WORKFLOWS, buildVideoGenerationBody, extractJobId } from "@grok-workbench/core";

const SETTINGS_KEY = "grok-workbench-mobile-settings";
const GALLERY_KEY = "grok-workbench-mobile-gallery";
const MOBILE_APP_VERSION = "1.0.11";
const DEFAULT_WORKBENCH_BASE_URL = "http://192.168.123.195:38696";

const TABS = [
  { id: "prompt", label: "提示词" },
  { id: "chat", label: "聊天" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "voice", label: "语音" },
  { id: "music", label: "音乐" },
  { id: "gallery", label: "图库" },
  { id: "settings", label: "设置" }
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

const KNOWN_CHAT_MODELS = [
  "grok-composer-2.5-fast",
  "grok-4.5",
  "grok-4.6",
  "grok-build-0.1",
  "grok-4.3",
  "grok-chat-fast",
  "grok-chat-auto",
  "grok-chat-expert",
  "grok-chat-heavy"
];

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

export default function App() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_SERVER_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [wbBaseUrl, setWbBaseUrl] = useState(DEFAULT_WORKBENCH_BASE_URL);
  const [wbToken, setWbToken] = useState("");
  const [wbUser, setWbUser] = useState(null);
  const [wbUsername, setWbUsername] = useState("");
  const [wbPassword, setWbPassword] = useState("");
  const [models, setModels] = useState([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [mode, setMode] = useState("prompt");
  const [workflowId, setWorkflowId] = useState("text-to-prompt");
  const [promptInput, setPromptInput] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [media, setMedia] = useState([]);
  const [status, setStatus] = useState("请在设置里填写客户端 Key 并获取模型");
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState("tts");
  const [voiceList, setVoiceList] = useState([]);
  const [voiceId, setVoiceId] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState("zh");
  const [voiceFile, setVoiceFile] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [voiceSynthesisText, setVoiceSynthesisText] = useState("");
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const [sound, setSound] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatImages, setChatImages] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [musicInput, setMusicInput] = useState("");
  const [musicPlan, setMusicPlan] = useState(null);
  const [musicLength, setMusicLength] = useState("standard");
  const [copied, setCopied] = useState("");
  const [chatModel, setChatModel] = useState(DEFAULT_MODELS.chat);
  const [imageModel, setImageModel] = useState(DEFAULT_MODELS.image);
  const [videoModel, setVideoModel] = useState(DEFAULT_MODELS.video);
  const [voiceModel, setVoiceModel] = useState(DEFAULT_MODELS.voice);
  const [musicModel, setMusicModel] = useState("grok-4.5");
  const [gallery, setGallery] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);

  const api = useMemo(() => new GrokApi({ baseUrl, apiKey }), [baseUrl, apiKey]);
  const workflow = PROMPT_WORKFLOWS.find((item) => item.id === workflowId) || PROMPT_WORKFLOWS[1];
  const modelLists = useMemo(() => buildModelLists(models), [models]);
  const galleryItems = useMemo(
    () => (Array.isArray(gallery) ? gallery.map((item) => repairGalleryItem(item, baseUrl)).filter(Boolean) : []),
    [gallery, baseUrl]
  );

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.baseUrl) setBaseUrl(saved.baseUrl);
          if (saved.apiKey) setApiKey(saved.apiKey);
          if (saved.wbBaseUrl) setWbBaseUrl(saved.wbBaseUrl);
          if (saved.wbToken) setWbToken(saved.wbToken);
          if (saved.wbUser) setWbUser(saved.wbUser);
          if (saved.wbUsername) setWbUsername(saved.wbUsername);
          if (Array.isArray(saved.models) && saved.models.length) setModels(saved.models);
        }
      } catch {}
      finally {
        setSettingsLoaded(true);
      }
    })();
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(GALLERY_KEY);
        const saved = raw ? JSON.parse(raw) : [];
        setGallery(Array.isArray(saved) ? saved : []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return undefined;
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ baseUrl, apiKey, models, wbBaseUrl, wbToken, wbUser, wbUsername })).catch(() => {});
  }, [settingsLoaded, baseUrl, apiKey, models, wbBaseUrl, wbToken, wbUser, wbUsername]);

  useEffect(() => {
    AsyncStorage.setItem(GALLERY_KEY, JSON.stringify(gallery)).catch(() => {});
  }, [gallery]);

  useEffect(() => {
    if (mode !== "voice" || !apiKey.trim() || voiceMode !== "tts") return undefined;
    let cancelled = false;
    api.voices({ model: voiceModel }).then((data) => {
      if (cancelled) return;
      const next = Array.isArray(data?.voices) ? data.voices : [];
      setVoiceList(next);
      setVoiceId((current) => next.some((item) => item.voice_id === current) ? current : (next[0]?.voice_id || ""));
    }).catch((error) => { if (!cancelled) setStatus(error.message); });
    return () => { cancelled = true; };
  }, [api, apiKey, mode, voiceMode, voiceModel]);

  function requireKey() {
    if (!apiKey.trim()) {
      setStatus("请先在设置里填写完整客户端 Key");
      return false;
    }
    return true;
  }

  async function saveSettings() {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ baseUrl, apiKey, models, wbBaseUrl, wbToken, wbUser, wbUsername }));
      setStatus("设置已保存");
    } catch (error) {
      setStatus(`保存失败：${error.message}`);
    }
  }

  function wbAuthHeaders() {
    return wbToken ? { Authorization: `Bearer ${wbToken}` } : {};
  }

  async function wbLogin() {
    if (!wbUsername.trim() || !wbPassword) return setStatus("请输入工作台账号和密码");
    setBusy(true);
    try {
      const data = await rawJsonRequest(`${cleanBaseUrl(wbBaseUrl)}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: wbUsername.trim(), password: wbPassword })
      });
      if (!data?.token) throw new Error("登录接口未返回令牌");
      setWbToken(data.token);
      setWbUser(data.user || { username: wbUsername.trim() });
      setWbPassword("");
      setStatus(`已登录：${data.user?.username || wbUsername.trim()}，可在图库同步你的历史`);
    } catch (error) {
      setStatus(`登录失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function wbRegister() {
    if (!wbUsername.trim() || !wbPassword) return setStatus("请输入工作台账号和密码");
    setBusy(true);
    try {
      const data = await rawJsonRequest(`${cleanBaseUrl(wbBaseUrl)}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: wbUsername.trim(), password: wbPassword })
      });
      if (!data?.token) throw new Error("注册接口未返回令牌");
      setWbToken(data.token);
      setWbUser(data.user || { username: wbUsername.trim() });
      setWbPassword("");
      setStatus(`注册成功，已登录：${data.user?.username || wbUsername.trim()}`);
    } catch (error) {
      setStatus(`注册失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function wbLogout() {
    try {
      await rawJsonRequest(`${cleanBaseUrl(wbBaseUrl)}/auth/logout`, {
        method: "POST",
        headers: wbAuthHeaders()
      });
    } catch {}
    setWbToken("");
    setWbUser(null);
    setWbPassword("");
    setStatus("已退出登录");
  }

  async function claimToServer(items, meta = {}) {
    if (!wbToken || !Array.isArray(items) || !items.length) return;
    const valid = items
      .map((item) => String(item?.id || ""))
      .filter((id) => /^(img|vid)_[A-Za-z0-9._-]+$/.test(id));
    if (!valid.length) return;
    try {
      await rawJsonRequest(`${cleanBaseUrl(wbBaseUrl)}/ownership/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...wbAuthHeaders() },
        body: JSON.stringify({
          items: valid.map((id) => ({ id })),
          kind: meta.kind || "image",
          prompt: String(meta.prompt || ""),
          model: String(meta.model || "")
        })
      });
    } catch {}
  }

  async function loadModels() {
    if (!apiKey.trim()) return setStatus("请先在设置里填写完整客户端 Key");
    setBusy(true);
    try {
      const data = await api.models();
      const list = (data?.data || []).map((item) => item.id).filter(Boolean);
      setModels(list);
      const mapped = list.map(normalizeModelOption);
      setChatModel((current) => pickChatModel(mapped) || current);
      setImageModel((current) => pickImageModel(mapped) || current);
      setVideoModel((current) => pickVideoModel(mapped) || current);
      setVoiceModel((current) => pickVoiceModel(mapped) || current);
      setStatus(`已读取 ${list.length} 个模型，可在各功能页选择`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickAudio() {
    const result = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]) {
      setVoiceFile(result.assets[0]);
      setTranscript("");
    }
  }

  async function synthesizeVoice() {
    if (!requireKey()) return;
    if (!voiceText.trim()) return setStatus("请输入要合成的文字");
    if (!voiceId) return setStatus("请先选择音色");
    setBusy(true);
    try {
      setStatus(voiceLanguage === "auto" ? "正在合成语音" : "正在翻译目标语言");
      const synthesisText = await api.translateForSpeech({ text: voiceText, language: voiceLanguage, model: chatModel });
      setVoiceSynthesisText(synthesisText);
      const result = await api.synthesizeSpeech({ model: voiceModel, text: synthesisText, voiceId, language: voiceLanguage, speed: 1 });
      if (sound) await sound.unloadAsync();
      const next = await Audio.Sound.createAsync({ uri: result.url }, { shouldPlay: true });
      setSound(next.sound);
      setStatus("语音合成完成");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  async function previewVoice() {
    if (!requireKey()) return;
    if (!voiceId) return setStatus("请先选择音色");
    setVoicePreviewBusy(true);
    try {
      const language = voiceLanguage === "auto" ? "zh" : voiceLanguage;
      const sample = VOICE_PREVIEW_TEXT[language] || VOICE_PREVIEW_TEXT.zh;
      setStatus("正在生成音色试听");
      const result = await api.synthesizeSpeech({ model: voiceModel, text: sample, voiceId, language, speed: 1 });
      if (sound) await sound.unloadAsync();
      const next = await Audio.Sound.createAsync({ uri: result.url }, { shouldPlay: true });
      setSound(next.sound);
      setStatus(`试听完成：${voiceId}`);
    } catch (error) { setStatus(error.message); }
    finally { setVoicePreviewBusy(false); }
  }

  async function transcribeVoice() {
    if (!requireKey()) return;
    if (!voiceFile) return setStatus("请先选择音频文件");
    setBusy(true);
    try {
      const result = await api.transcribeAudio({ file: voiceFile, model: DEFAULT_MODELS.speechToText, language: voiceLanguage });
      setTranscript(result?.text || "接口没有返回识别文本");
      setStatus("语音识别完成");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setStatus("需要相册权限才能选择图片");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.85 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setImageDataUrl(`data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`);
      setStatus("参考图已选择");
    }
  }

  async function addChatImages() {
    const remaining = Math.max(0, 4 - chatImages.length);
    if (!remaining) return setStatus("单条聊天最多添加 4 张图片");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setStatus("需要相册权限才能选择聊天图片");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: remaining
    });
    if (result.canceled || !result.assets?.length) return;
    const next = result.assets.slice(0, remaining).map((asset) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: asset.fileName || `截图-${Date.now()}.jpg`,
      dataUrl: `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
    })).filter((item) => item.dataUrl.includes("base64,"));
    if (!next.length) return setStatus("图片读取失败，请重试");
    setChatImages((current) => [...current, ...next].slice(0, 4));
    setStatus(`已添加 ${next.length} 张图片`);
  }

  function removeChatImage(id) {
    setChatImages((current) => current.filter((image) => image.id !== id));
  }

  async function sendChat() {
    if (!requireKey()) return;
    if (!chatInput.trim() && !chatImages.length) return setStatus("请输入聊天内容或添加截图");
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
      const usesChatCompletions = /chat/i.test(chatModel);
      const requestMessages = buildMultimodalMessages(nextMessages, usesChatCompletions ? "chat" : "responses");
      const data = usesChatCompletions
        ? await api.chat({ model: chatModel, messages: requestMessages })
        : await api.responses({ model: chatModel, messages: requestMessages });
      const text = extractTextResponse(data);
      setChatMessages([...nextMessages, { role: "assistant", content: text }]);
      setStatus("聊天回复完成");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflow() {
    if (!requireKey()) return;
    if (workflow.needsImage && !imageDataUrl) return setStatus("这个功能需要先上传图片");
    if (!workflow.needsImage && !promptInput.trim()) return setStatus("请输入一句话或文字描述");
    setBusy(true);
    try {
      const text = await api.runPromptWorkflow({ workflowId, input: promptInput, imageDataUrl, model: chatModel });
      setGeneratedPrompt(text);
      setStatus(`${workflow.outputLabel}已生成`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function copyGeneratedToInput() {
    if (!generatedPrompt.trim()) return;
    setPromptInput(generatedPrompt);
    setStatus("已复制到输入框，可到图片/视频页使用");
  }

  async function createImage() {
    if (!requireKey()) return;
    const originalPrompt = String(generatedPrompt || promptInput || "").trim();
    if (!originalPrompt) return setStatus("请输入或生成图片提示词");
    setBusy(true);
    try {
      let prompt = originalPrompt;
      if (imageDataUrl) {
        setStatus("正在分析参考图并提取视觉约束");
        const referenceDescription = await api.describeReferenceImage({
          prompt: originalPrompt,
          imageDataUrl,
          model: chatModel
        });
        if (!referenceDescription.trim()) throw new Error("参考图分析没有返回有效结果");
        prompt = `${originalPrompt}\n\n参考图视觉约束（在不冲突时保持）：\n${referenceDescription}`;
        setStatus("参考图分析完成，正在生成图片");
      }
      const data = await api.generateImage({ prompt, model: imageModel });
      const items = extractMobileMediaItems(data, baseUrl, "image");
      setMedia(items);
      addToGallery(items, { prompt, model: imageModel });
      claimToServer(items, { kind: "image", prompt, model: imageModel });
      setStatus(extractJobId(data) ? `任务已提交：${extractJobId(data)}` : "图片生成完成");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createVideo() {
    if (!requireKey()) return;
    const rawPrompt = String(generatedPrompt || promptInput || "").trim();
    if (!rawPrompt) return setStatus("请输入或生成视频提示词");
    setBusy(true);
    try {
      setStatus("正在提交视频任务");
      const data = await api.generateVideo(buildVideoGenerationBody({
        prompt: rawPrompt,
        model: videoModel,
        duration: 6,
        resolution: "720p",
        aspectRatio: "16:9",
        image: imageDataUrl || undefined
      }));
      const items = extractMobileMediaItems(data, baseUrl, "video");
      setMedia(items);
      addToGallery(items, { prompt: rawPrompt, model: videoModel });
      claimToServer(items, { kind: "video", prompt: rawPrompt, model: videoModel });
      setStatus(extractJobId(data) ? `任务已提交：${extractJobId(data)}` : "视频生成完成");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function addToGallery(items, meta = {}) {
    if (!Array.isArray(items) || !items.length) return;
    setGallery((current) => {
      const next = [...current];
      for (const item of items) {
        if (!item?.url) continue;
        const key = String(item.id || item.url);
        const exists = next.some((entry) => String(entry.id || entry.url) === key || entry.url === item.url);
        if (!exists) {
          next.unshift({
            id: item.id || item.url,
            url: item.url,
            kind: item.kind || "image",
            mime: item.mime || "",
            prompt: item.prompt || meta.prompt || "",
            model: item.model || meta.model || "",
            createdAt: Date.now()
          });
        }
      }
      return next.slice(0, 300);
    });
  }

  async function syncServerGallery() {
    if (!wbToken) return setStatus("请先在设置里注册/登录工作台账号，再同步图库");
    setGalleryLoading(true);
    try {
      setStatus("正在从工作台同步你的图库");
      const headers = wbAuthHeaders();
      const [imageData, videoData] = await Promise.all([
        rawJsonRequest(`${cleanBaseUrl(wbBaseUrl)}/library?kind=image&limit=200`, { headers }),
        rawJsonRequest(`${cleanBaseUrl(wbBaseUrl)}/library?kind=video&limit=200`, { headers })
      ]);
      const serverItems = [
        ...extractWorkbenchLibraryItems(imageData, baseUrl, "image"),
        ...extractWorkbenchLibraryItems(videoData, baseUrl, "video")
      ];
      if (serverItems.length) {
        setGallery((current) => {
          const next = [...current];
          for (const item of serverItems) {
            const exists = next.some((entry) => entry.url === item.url || String(entry.id) === String(item.id));
            if (!exists) next.push(item);
          }
          return next.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 300);
        });
        setStatus(`已同步图库 ${serverItems.length} 条（账号：${wbUser?.username || wbUsername}）`);
      } else {
        setStatus(`图库为空，生成图片/视频后会记录到你的账号（${wbUser?.username || wbUsername}）`);
      }
    } catch (error) {
      setStatus(`同步失败：${error.message}`);
    } finally {
      setGalleryLoading(false);
    }
  }

  async function downloadMedia(item) {
    if (!item?.url) return setStatus("没有可下载的媒体");
    const repaired = repairGalleryItem(item, baseUrl);
    const url = repaired?.url || item.url;
    setStatus(item.kind === "video" ? "正在下载视频" : "正在下载图片");
    try {
      const fileUri = await downloadToCache(url, item.kind === "video" ? "video" : "image");
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted || permission.accessPrivileges === "all") {
        await MediaLibrary.saveToLibraryAsync(fileUri);
        setStatus(item.kind === "video" ? "视频已保存到系统相册" : "图片已保存到系统相册");
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: item.kind === "video" ? "video/mp4" : "image/jpeg",
          dialogTitle: "保存 Grok 媒体"
        });
        setStatus("相册权限未开启，已改用系统分享保存");
      } else {
        setStatus(`已下载到缓存：${fileUri}`);
      }
    } catch (error) {
      setStatus(`下载失败：${error.message}`);
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
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyField(name, value) {
    await Clipboard.setStringAsync(String(value ?? ""));
    setCopied(name);
    setTimeout(() => setCopied((current) => current === name ? "" : current), 1600);
  }

  const isOutputMode = mode === "image" || mode === "video";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Image source={require("./assets/icon.png")} style={styles.logo} />
        <View>
          <Text style={styles.title}>Grok Workbench</Text>
          <Text style={styles.version}>v{MOBILE_APP_VERSION}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((item) => (
          <Pressable key={item.id} style={[styles.tab, mode === item.id && styles.active]} onPress={() => setMode(item.id)}>
            <Text style={styles.tabText}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.status}>{status}</Text>

      {mode === "settings" ? (
        <SettingsWorkspace
          baseUrl={baseUrl}
          setBaseUrl={setBaseUrl}
          apiKey={apiKey}
          setApiKey={setApiKey}
          wbBaseUrl={wbBaseUrl}
          setWbBaseUrl={setWbBaseUrl}
          wbUser={wbUser}
          wbUsername={wbUsername}
          setWbUsername={setWbUsername}
          wbPassword={wbPassword}
          setWbPassword={setWbPassword}
          onLogin={wbLogin}
          onRegister={wbRegister}
          onLogout={wbLogout}
          saveSettings={saveSettings}
          loadModels={loadModels}
          models={models}
          busy={busy}
        />
      ) : mode === "prompt" ? (
        <PromptWorkspace
          workflow={workflow}
          workflowId={workflowId}
          setWorkflowId={setWorkflowId}
          input={promptInput}
          setInput={setPromptInput}
          imageDataUrl={imageDataUrl}
          pickImage={pickImage}
          runWorkflow={runWorkflow}
          generatedPrompt={generatedPrompt}
          copyGeneratedToInput={copyGeneratedToInput}
          chatModel={chatModel}
          setChatModel={setChatModel}
          chatModelOptions={modelLists.chat}
          busy={busy}
        />
      ) : mode === "chat" ? (
        <ChatWorkspace
          chatModel={chatModel}
          setChatModel={setChatModel}
          chatModelOptions={modelLists.chat}
          chatInput={chatInput}
          setChatInput={setChatInput}
          chatImages={chatImages}
          addChatImages={addChatImages}
          removeChatImage={removeChatImage}
          chatMessages={chatMessages}
          sendChat={sendChat}
          busy={busy}
        />
      ) : mode === "voice" ? (
        <VoiceWorkspace
          voiceMode={voiceMode}
          setVoiceMode={setVoiceMode}
          voiceModel={voiceModel}
          setVoiceModel={setVoiceModel}
          voiceModelOptions={modelLists.voice}
          voiceList={voiceList}
          voiceId={voiceId}
          setVoiceId={setVoiceId}
          voiceText={voiceText}
          setVoiceText={setVoiceText}
          voiceLanguage={voiceLanguage}
          setVoiceLanguage={setVoiceLanguage}
          voiceSynthesisText={voiceSynthesisText}
          voiceFile={voiceFile}
          pickAudio={pickAudio}
          transcript={transcript}
          synthesizeVoice={synthesizeVoice}
          previewVoice={previewVoice}
          transcribeVoice={transcribeVoice}
          busy={busy}
          voicePreviewBusy={voicePreviewBusy}
        />
      ) : mode === "music" ? (
        <MusicWorkspace
          input={musicInput}
          setInput={setMusicInput}
          plan={musicPlan}
          generate={generateMusicPlan}
          model={musicModel}
          setModel={setMusicModel}
          length={musicLength}
          setLength={setMusicLength}
          busy={busy}
          copied={copied}
          copyField={copyField}
        />
      ) : mode === "gallery" ? (
        <GalleryWorkspace
          gallery={galleryItems}
          loading={galleryLoading}
          sync={syncServerGallery}
          download={downloadMedia}
          openPreview={setPreviewItem}
          clearLocal={() => {
            setGallery([]);
            setStatus("本机图库记录已清空");
          }}
        />
      ) : (
        <MediaWorkspace
          mode={mode}
          model={mode === "video" ? videoModel : imageModel}
          setModel={mode === "video" ? setVideoModel : setImageModel}
          modelOptions={mode === "video" ? modelLists.video : modelLists.image}
          input={promptInput}
          setInput={setPromptInput}
          imageDataUrl={imageDataUrl}
          pickImage={pickImage}
          create={mode === "video" ? createVideo : createImage}
          busy={busy}
          media={media}
        />
      )}

      {busy && <ActivityIndicator style={styles.loading} />}
      {isOutputMode && media.map((item) => {
        if (!item.url) return null;
        const isVideo = item.mime.includes("video") || item.url.endsWith(".mp4");
        return isVideo ? (
          <Pressable key={item.id} style={styles.videoLink} onPress={() => Linking.openURL(item.url)}>
            <Text style={styles.videoTitle}>视频生成完成</Text>
            <Text style={styles.videoUrl} numberOfLines={2}>{item.url}</Text>
          </Pressable>
        ) : (
          <Image key={item.id} source={{ uri: item.url }} style={styles.output} />
        );
      })}

      <Modal visible={!!previewItem} transparent animationType="fade" onRequestClose={() => setPreviewItem(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewItem(null)}>
          {previewItem?.kind === "video" ? (
            <Pressable style={styles.previewCard} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.previewTitle}>{previewItem.prompt || "视频"}</Text>
              <Pressable style={styles.button} onPress={() => Linking.openURL(previewItem.url)}><Text style={styles.buttonText}>在浏览器播放</Text></Pressable>
              <Pressable style={styles.primary} onPress={() => downloadMedia(previewItem)}><Text style={styles.primaryText}>下载视频</Text></Pressable>
              <Pressable style={styles.button} onPress={() => setPreviewItem(null)}><Text style={styles.buttonText}>关闭</Text></Pressable>
            </Pressable>
          ) : (
            <Pressable style={styles.previewCard} onPress={(event) => event.stopPropagation()}>
              <Image source={{ uri: previewItem?.url }} style={styles.previewImage} resizeMode="contain" />
              {!!previewItem?.prompt && <Text style={styles.previewTitle} numberOfLines={2}>{previewItem.prompt}</Text>}
              <View style={styles.actions}>
                <Pressable style={styles.primary} onPress={() => downloadMedia(previewItem)}><Text style={styles.primaryText}>下载图片</Text></Pressable>
                <Pressable style={styles.button} onPress={() => setPreviewItem(null)}><Text style={styles.buttonText}>关闭</Text></Pressable>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function SettingsWorkspace({ baseUrl, setBaseUrl, apiKey, setApiKey, wbBaseUrl, setWbBaseUrl, wbUser, wbUsername, setWbUsername, wbPassword, setWbPassword, onLogin, onRegister, onLogout, saveSettings, loadModels, models, busy }) {
  return (
    <View style={styles.workspace}>
      <Text style={styles.sectionTitle}>账号（与 Web 端通用，图库按账号隔离）</Text>
      <Text style={styles.label}>工作台地址</Text>
      <TextInput value={wbBaseUrl} onChangeText={setWbBaseUrl} style={styles.input} autoCapitalize="none" placeholder="http://192.168.123.195:38696" />
      {wbUser ? (
        <View style={styles.actions}>
          <Text style={styles.hint}>已登录：{wbUser.username || wbUsername}</Text>
          <Pressable style={styles.button} onPress={onLogout}><Text style={styles.buttonText}>退出登录</Text></Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.label}>用户名</Text>
          <TextInput value={wbUsername} onChangeText={setWbUsername} style={styles.input} autoCapitalize="none" placeholder="3-40 位字母/数字/._-@，小写" />
          <Text style={styles.label}>密码</Text>
          <TextInput value={wbPassword} onChangeText={setWbPassword} style={styles.input} autoCapitalize="none" secureTextEntry placeholder="至少 6 位" />
          <View style={styles.actions}>
            <Pressable style={styles.primary} onPress={onLogin} disabled={busy}><Text style={styles.primaryText}>{busy ? "处理中..." : "登录"}</Text></Pressable>
            <Pressable style={styles.button} onPress={onRegister} disabled={busy}><Text style={styles.buttonText}>{busy ? "处理中..." : "注册新账号"}</Text></Pressable>
          </View>
        </>
      )}
      <Text style={styles.sectionTitle}>生成服务</Text>
      <Text style={styles.label}>Grok2API 地址</Text>
      <TextInput value={baseUrl} onChangeText={setBaseUrl} style={styles.input} autoCapitalize="none" placeholder="http://192.168.123.195:38695" />
      <Text style={styles.label}>完整客户端 Key</Text>
      <TextInput value={apiKey} onChangeText={setApiKey} style={styles.input} autoCapitalize="none" secureTextEntry placeholder="sk-..." />
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={saveSettings}><Text style={styles.primaryText}>保存设置</Text></Pressable>
        <Pressable style={styles.button} onPress={loadModels} disabled={busy}><Text style={styles.buttonText}>{busy ? "读取中..." : "获取模型"}</Text></Pressable>
      </View>
      <Text style={styles.hint}>已获取 {models.length} 个模型。登录工作台账号后，生成的图片/视频会自动记到你的账号；换手机登录同一账号也能在图库看到自己的历史，别人看不到。</Text>
    </View>
  );
}

function PromptWorkspace({ workflow, workflowId, setWorkflowId, input, setInput, imageDataUrl, pickImage, runWorkflow, generatedPrompt, copyGeneratedToInput, chatModel, setChatModel, chatModelOptions, busy }) {
  return (
    <View style={styles.workspace}>
      <View style={styles.toolGrid}>
        {PROMPT_TOOLS.map((tool) => (
          <Pressable key={tool.id} style={[styles.tool, workflowId === tool.id && styles.active]} onPress={() => setWorkflowId(tool.id)}>
            <Text style={styles.toolTitle}>{tool.title}</Text>
            <Text style={styles.toolHint}>{tool.hint}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>{workflow.inputLabel}</Text>
      <TextInput value={input} onChangeText={setInput} style={styles.textarea} multiline placeholder={workflow.placeholder} />
      <ModelChips label="创作模型" value={chatModel} options={chatModelOptions} onChange={setChatModel} disabled={busy} />
      <View style={styles.actions}>
        {workflow.needsImage ? <Pressable style={styles.button} onPress={pickImage}><Text style={styles.buttonText}>参考图</Text></Pressable> : null}
        <Pressable style={styles.primary} onPress={runWorkflow} disabled={busy}><Text style={styles.primaryText}>{busy ? "生成中..." : workflow.shortTitle}</Text></Pressable>
      </View>
      {workflow.needsImage && imageDataUrl ? <Image source={{ uri: imageDataUrl }} style={styles.preview} /> : null}
      {generatedPrompt ? (
        <View style={styles.resultBlock}>
          <View style={styles.resultHead}>
            <Text style={styles.resultTitle}>{workflow.outputLabel}</Text>
            <Pressable style={styles.copyButton} onPress={copyGeneratedToInput}><Text style={styles.copyButtonText}>用于创作</Text></Pressable>
          </View>
          <Text selectable style={styles.resultText}>{generatedPrompt}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MediaWorkspace({ mode, model, setModel, modelOptions, input, setInput, imageDataUrl, pickImage, create, busy, media }) {
  const isVideo = mode === "video";
  return (
    <View style={styles.workspace}>
      <ModelChips label={isVideo ? "视频模型" : "图片模型"} value={model} options={modelOptions} onChange={setModel} disabled={busy} />
      <Text style={styles.label}>提示词</Text>
      <TextInput value={input} onChangeText={setInput} style={styles.textarea} multiline placeholder={isVideo ? "描述视频画面、动作、镜头和节奏。" : "描述你的想法，生成图片 Prompt。"} />
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={pickImage}><Text style={styles.buttonText}>参考图</Text></Pressable>
        <Pressable style={styles.primary} onPress={create} disabled={busy}><Text style={styles.primaryText}>{isVideo ? "生成视频" : "生成图片"}</Text></Pressable>
      </View>
      {imageDataUrl ? <Image source={{ uri: imageDataUrl }} style={styles.preview} /> : null}
    </View>
  );
}

function GalleryWorkspace({ gallery, loading, sync, download, openPreview, clearLocal }) {
  const images = gallery.filter((item) => item.kind !== "video");
  const videos = gallery.filter((item) => item.kind === "video");
  return (
    <View style={styles.galleryArea}>
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={sync} disabled={loading}><Text style={styles.primaryText}>{loading ? "同步中..." : "同步我的图库"}</Text></Pressable>
        <Pressable style={styles.button} onPress={clearLocal}><Text style={styles.buttonText}>清空本机记录</Text></Pressable>
      </View>
      {gallery.length === 0 ? (
        <Text style={styles.emptyTitle}>图库为空。生成图片/视频后会自动记录；登录工作台账号后点“同步服务器媒体”，可拉取你自己账号的历史。</Text>
      ) : (
        <>
          <Text style={styles.label}>图片（{images.length}）</Text>
          <View style={styles.galleryGrid}>
            {images.map((item) => (
              <Pressable key={String(item.id || item.url)} style={styles.galleryItem} onPress={() => openPreview(item)}>
                <Image source={{ uri: item.url }} style={styles.galleryThumb} />
                <View style={styles.galleryItemBar}>
                  <Text style={styles.galleryItemPrompt} numberOfLines={1}>{item.prompt || item.model || "图片"}</Text>
                  <Pressable style={styles.galleryDownload} onPress={() => download(item)}><Text style={styles.galleryDownloadText}>下载</Text></Pressable>
                </View>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>视频（{videos.length}）</Text>
          {videos.map((item) => (
            <View key={String(item.id || item.url)} style={styles.videoLink}>
              <Text style={styles.videoTitle} numberOfLines={1}>{item.prompt || item.model || "视频"}</Text>
              <Text style={styles.videoUrl} numberOfLines={2}>{item.url}</Text>
              <View style={styles.actions}>
                <Pressable style={styles.button} onPress={() => Linking.openURL(item.url)}><Text style={styles.buttonText}>播放</Text></Pressable>
                <Pressable style={styles.button} onPress={() => download(item)}><Text style={styles.buttonText}>下载</Text></Pressable>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function ModelChips({ label, value, options, onChange, disabled }) {
  const list = Array.isArray(options) && options.length ? options : [value].filter(Boolean);
  return (
    <View style={styles.modelArea}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelChips}>
        {list.map((item) => (
          <Pressable key={item} style={[styles.choiceChip, value === item && styles.active]} onPress={() => onChange(item)} disabled={disabled}>
            <Text style={styles.choiceChipText} numberOfLines={1}>{displayModelName(item)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ChatWorkspace({ chatModel, setChatModel, chatModelOptions, chatInput, setChatInput, chatImages, addChatImages, removeChatImage, chatMessages, sendChat, busy }) {
  return (
    <View style={styles.chatArea}>
      <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {chatMessages.length === 0 ? (
          <Text style={styles.emptyTitle}>今天想聊什么？</Text>
        ) : (
          chatMessages.map((message, index) => (
            <View key={index} style={[styles.message, message.role === "user" ? styles.userMessage : styles.assistantMessage]}>
              <Text style={styles.messageRole}>{message.role === "user" ? "你" : "Grok"}</Text>
              {!!message.content && <Text selectable style={styles.messageText}>{message.content}</Text>}
              {!!message.images?.length && (
                <View style={styles.messageImages}>
                  {message.images.map((image, imageIndex) => (
                    <Image key={`${image.name}-${imageIndex}`} source={{ uri: image.dataUrl }} style={styles.messageImage} />
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.composer}>
        {!!chatImages.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chatImagePreviews}>
            {chatImages.map((image) => (
              <View key={image.id} style={styles.chatImageWrap}>
                <Image source={{ uri: image.dataUrl }} style={styles.chatImagePreview} />
                <Pressable style={styles.chatImageRemove} onPress={() => removeChatImage(image.id)}>
                  <Text style={styles.chatImageRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
        <TextInput value={chatInput} onChangeText={setChatInput} style={styles.chatInput} multiline placeholder="输入内容，或添加截图。" />
        <ModelChips label="聊天模型" value={chatModel} options={chatModelOptions} onChange={setChatModel} disabled={busy} />
        <View style={styles.controlBar}>
          <Pressable style={styles.button} onPress={addChatImages}><Text style={styles.buttonText}>添加图片（{chatImages.length}/4）</Text></Pressable>
          <Pressable style={styles.primary} onPress={sendChat} disabled={busy}><Text style={styles.primaryText}>{busy ? "回复中..." : "发送"}</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function MusicWorkspace({ input, setInput, plan, generate, model, setModel, length, setLength, busy, copied, copyField }) {
  return (
    <View style={styles.musicArea}>
      <View style={styles.musicIntro}>
        <Text style={styles.musicTitle}>音乐创作设定</Text>
        <Text style={styles.musicHint}>生成 MiniMax Music 3 所需的英文描述、中文说明、歌词和自动时长。</Text>
      </View>
      <Text style={styles.label}>音乐想法</Text>
      <TextInput value={input} onChangeText={setInput} style={styles.textarea} multiline placeholder="例如：一首关于深夜城市和重新出发的中文流行电子歌曲，女声，克制但有希望，适合片尾。" />
      <Text style={styles.label}>创作模型</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.musicChoices}>
        {MUSIC_MODEL_FALLBACKS.map((item) => (
          <Pressable key={item} style={[styles.choiceChip, model === item && styles.active]} onPress={() => setModel(item)} disabled={busy}>
            <Text style={styles.choiceChipText}>{displayModelName(item)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.label}>歌曲长度</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.musicLengthChoices}>
        {Object.entries(MUSIC_LENGTH_PROFILES).map(([id, profile]) => (
          <Pressable key={id} style={[styles.lengthCard, length === id && styles.active]} onPress={() => setLength(id)} disabled={busy}>
            <Text style={styles.lengthLabel}>{profile.label}</Text>
            <Text style={styles.lengthDuration}>{profile.durationLabel}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable style={styles.primary} onPress={generate} disabled={busy}>
        <Text style={styles.primaryText}>{busy ? "生成中..." : "生成 MiniMax 参数"}</Text>
      </Pressable>
      {plan && (
        <View style={styles.musicOutputs}>
          <ResultBlock title="Description / English" value={plan.descriptionEn} copied={copied === "descriptionEn"} onCopy={() => copyField("descriptionEn", plan.descriptionEn)} />
          <ResultBlock title="中文描述" value={plan.descriptionZh} copied={copied === "descriptionZh"} onCopy={() => copyField("descriptionZh", plan.descriptionZh)} />
          <ResultBlock title={`Lyrics / 歌词${plan.quality ? ` · ${plan.quality.lineCount} 行` : ""}`} value={plan.lyrics} copied={copied === "lyrics"} onCopy={() => copyField("lyrics", plan.lyrics)} />
          <ResultBlock title="max_duration / 自动时长" value={String(plan.maxDuration)} copied={copied === "duration"} onCopy={() => copyField("duration", String(plan.maxDuration))} />
        </View>
      )}
    </View>
  );
}

function ResultBlock({ title, value, copied, onCopy }) {
  return (
    <View style={styles.resultBlock}>
      <View style={styles.resultHead}>
        <Text style={styles.resultTitle}>{title}</Text>
        <Pressable style={styles.copyButton} onPress={onCopy}><Text style={styles.copyButtonText}>{copied ? "已复制" : "复制"}</Text></Pressable>
      </View>
      <Text selectable style={styles.resultText}>{value}</Text>
    </View>
  );
}

function VoiceWorkspace({ voiceMode, setVoiceMode, voiceModel, setVoiceModel, voiceModelOptions, voiceList, voiceId, setVoiceId, voiceText, setVoiceText, voiceLanguage, setVoiceLanguage, voiceSynthesisText, voiceFile, pickAudio, transcript, synthesizeVoice, previewVoice, transcribeVoice, busy, voicePreviewBusy }) {
  const isTts = voiceMode === "tts";
  return <View style={styles.voiceArea}>
    <View style={styles.voiceModes}>
      <Pressable style={[styles.voiceMode, isTts && styles.active]} onPress={() => setVoiceMode("tts")}><Text>合成语音</Text></Pressable>
      <Pressable style={[styles.voiceMode, !isTts && styles.active]} onPress={() => setVoiceMode("stt")}><Text>识别语音</Text></Pressable>
    </View>
    {isTts ? <>
      <TextInput value={voiceText} onChangeText={setVoiceText} style={styles.textarea} multiline placeholder="输入要合成的文本。" />
      <ModelChips label="语音模型" value={voiceModel} options={voiceModelOptions} onChange={setVoiceModel} disabled={busy} />
      <TextInput value={voiceLanguage} onChangeText={setVoiceLanguage} style={styles.input} autoCapitalize="none" placeholder="语言，例如 zh、en、ko、auto" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voiceChoices}>
        {voiceList.map((item) => <Pressable key={item.voice_id} style={[styles.button, voiceId === item.voice_id && styles.active]} onPress={() => setVoiceId(item.voice_id)}><Text>{item.name || item.voice_id}</Text></Pressable>)}
      </ScrollView>
      <Pressable style={styles.button} onPress={previewVoice} disabled={voicePreviewBusy || !voiceId}><Text>{voicePreviewBusy ? "试听中..." : "试听当前音色"}</Text></Pressable>
      <Pressable style={styles.primary} onPress={synthesizeVoice} disabled={busy}><Text style={styles.primaryText}>{busy ? "合成中..." : "合成并播放"}</Text></Pressable>
      {voiceSynthesisText && voiceSynthesisText !== voiceText.trim() ? <Text selectable style={styles.transcript}>实际合成：{voiceSynthesisText}</Text> : null}
    </> : <>
      <Pressable style={styles.audioPicker} onPress={pickAudio}><Text>{voiceFile?.name || "选择音频文件"}</Text></Pressable>
      <Pressable style={styles.primary} onPress={transcribeVoice} disabled={busy}><Text style={styles.primaryText}>{busy ? "识别中..." : "开始识别"}</Text></Pressable>
      {transcript ? <Text selectable style={styles.transcript}>{transcript}</Text> : null}
    </>}
  </View>;
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

function cleanBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

async function rawJsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText || "请求失败";
    throw new Error(`${response.status} ${message}`);
  }
  return data;
}

async function downloadToCache(url, kind) {
  const ext = kind === "video" ? "mp4" : "jpg";
  const fileUri = `${FileSystem.cacheDirectory}grok-${kind}-${Date.now()}.${ext}`;
  if (String(url || "").startsWith("data:")) {
    const match = String(url).match(/^data:[^;]+;base64,(.*)$/s);
    if (!match) throw new Error("不支持的数据格式");
    await FileSystem.writeAsStringAsync(fileUri, match[1], { encoding: FileSystem.EncodingType.Base64 });
    return fileUri;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败（${response.status}）`);
  const blob = await response.blob();
  const base64 = await blobToBase64(blob);
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取下载内容失败"));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(blob);
  });
}

function normalizeMobileMediaUrl(value, baseUrl) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  const origin = cleanBaseUrl(baseUrl);
  if (/^https?:\/\//i.test(raw)) {
    const pathMatch = raw.match(/^https?:\/\/[^/]+(\/.*)$/i);
    const path = pathMatch ? pathMatch[1] : raw;
    if (/127\.0\.0\.1|localhost|host\.docker\.internal|0\.0\.0\.0/i.test(raw)) {
      return `${origin}${path}`;
    }
    return raw;
  }
  if (raw.startsWith("/")) return `${origin}${raw}`;
  return raw;
}

function repairGalleryItem(item, baseUrl) {
  if (!item || typeof item !== "object") return null;
  const origin = cleanBaseUrl(baseUrl);
  const kind = item.kind === "video" ? "video" : "image";
  const id = String(item.id || item.assetId || item.asset_id || "");
  let url = String(item.url || "");
  if (/^(img|vid)_[A-Za-z0-9._-]+$/.test(id)) {
    url = `${origin}/v1/media/${kind === "video" ? "videos" : "images"}/${encodeURIComponent(id)}`;
  } else {
    url = normalizeMobileMediaUrl(url, origin);
    const assetMatch = url.match(/(?:^|\/)((?:img|vid)_[A-Za-z0-9._-]+)(?:$|\?)/);
    if (assetMatch) {
      url = `${origin}/v1/media/${kind === "video" ? "videos" : "images"}/${assetMatch[1]}`;
    }
  }
  if (!url) return null;
  return { ...item, id: id || url, url, kind };
}

function collectNestedMobileMedia(value, output, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectNestedMobileMedia(item, output, seen));
    return;
  }
  const nestedId = value.id || value.asset_id || value.assetId || value.result_asset_id || value.resultAssetId;
  const nestedUrl = value.url || value.asset_url || value.video_url || value.image_url || value.download_url || value.media_url || value.mediaUrl;
  if (/^(img|vid)_[A-Za-z0-9._-]+$/.test(String(nestedId || "")) || /(img|vid)_[A-Za-z0-9._-]+/.test(String(nestedUrl || ""))) {
    output.push(value);
  }
  Object.values(value).forEach((item) => collectNestedMobileMedia(item, output, seen));
}

function extractMobileMediaItems(data, baseUrl, defaultKind = "image") {
  const rawItems = data?.data || data?.items || data?.images || data?.videos || data?.assets || data?.records || data?.results || data?.list || data?.rows || (Array.isArray(data) ? data : []);
  const normalizedItems = Array.isArray(rawItems) ? [...rawItems] : [rawItems].filter(Boolean);
  if (data?.video) normalizedItems.push(data.video);
  if (data?.image) normalizedItems.push(data.image);
  if (data?.result) normalizedItems.push(data.result);
  if (data?.media) normalizedItems.push(data.media);
  collectNestedMobileMedia(data, normalizedItems);
  const origin = cleanBaseUrl(baseUrl);
  const seen = new Set();
  const output = [];
  for (const item of normalizedItems) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || item.asset_id || item.assetId || item.result_asset_id || item.resultAssetId || "");
    const rawUrl = String(item.url || item.asset_url || item.video_url || item.image_url || item.download_url || item.media_url || item.mediaUrl || item.thumbnail_url || item.thumbnailUrl || "");
    let url = rawUrl ? normalizeMobileMediaUrl(rawUrl, origin) : "";
    const isVideoId = /^vid_/.test(id);
    if (!url && /^(img|vid)_[A-Za-z0-9._-]+$/.test(id)) {
      url = `${origin}/v1/media/${isVideoId ? "videos" : "images"}/${encodeURIComponent(id)}`;
    }
    if (!url) continue;
    const urlKey = url.split("?")[0];
    if (seen.has(urlKey)) continue;
    seen.add(urlKey);
    const kind = isVideoId || /\/videos?\//.test(url) || /video/i.test(item.mime_type || item.content_type || "") ? "video" : defaultKind;
    output.push({
      id: id || url,
      url,
      kind,
      mime: item.mime_type || item.content_type || item.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg"),
      prompt: item.prompt || "",
      model: item.model || ""
    });
  }
  return output;
}

function extractWorkbenchLibraryItems(data, grokBaseUrl, kind) {
  const list = data?.data || data?.items || (Array.isArray(data) ? data : []);
  if (!Array.isArray(list)) return [];
  const origin = cleanBaseUrl(grokBaseUrl);
  const output = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "");
    if (!/^(img|vid)_[A-Za-z0-9._-]+$/.test(id)) continue;
    const itemKind = kind === "video" ? "video" : "image";
    output.push({
      id,
      url: `${origin}/v1/media/${itemKind === "video" ? "videos" : "images"}/${encodeURIComponent(id)}`,
      kind: itemKind,
      mime: item.mime || (itemKind === "video" ? "video/mp4" : "image/jpeg"),
      prompt: item.prompt || "",
      model: item.model || "",
      createdAt: new Date(item.createdAt || item.updatedAt || Date.now()).getTime()
    });
  }
  return output;
}

function buildModelLists(models) {
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

function pickChatModel(mapped) {
  return mapped.find((id) => /grok-composer-2\.5-fast/i.test(id)) || mapped.find((id) => /grok-4\.5/i.test(id)) || mapped.find((id) => /chat/i.test(id));
}

function pickImageModel(mapped) {
  return mapped.find((id) => /^grok-imagine-image$/i.test(id)) || mapped.find((id) => /image/i.test(id) && !/edit/i.test(id));
}

function pickVideoModel(mapped) {
  return mapped.find((id) => /^grok-imagine-video$/i.test(id)) || mapped.find((id) => /video/i.test(id));
}

function pickVoiceModel(mapped) {
  return mapped.find((id) => /^grok-voice-latest$/i.test(id)) || mapped.find((id) => /voice/i.test(id));
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function displayModelName(id) {
  return String(id || "").replace(/^(Web|Console|Build)\//, "");
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f8f8" },
  content: { padding: 18, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 28 },
  logo: { width: 54, height: 54, borderRadius: 12 },
  title: { fontSize: 24, fontWeight: "700", color: "#15171c" },
  version: { color: "#747b85", marginTop: 2 },
  tabs: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  tab: { height: 42, minWidth: 76, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: "#dfe3e8", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  active: { backgroundColor: "#edf1f5", borderColor: "#cbd3dd" },
  tabText: { color: "#232831", fontWeight: "600" },
  status: { color: "#69707a" },
  workspace: { gap: 12 },
  sectionTitle: { color: "#15171c", fontWeight: "700", fontSize: 16, marginTop: 4 },
  label: { color: "#69707a", marginTop: 4 },
  hint: { color: "#9aa1ab", lineHeight: 19 },
  input: { minHeight: 46, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3e8", borderRadius: 8, paddingHorizontal: 12 },
  toolGrid: { gap: 10 },
  tool: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e6eb", borderRadius: 8, padding: 12 },
  toolTitle: { fontWeight: "700", color: "#15171c" },
  toolHint: { color: "#69707a", marginTop: 4, lineHeight: 19 },
  textarea: { minHeight: 150, textAlignVertical: "top", backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3e8", borderRadius: 8, padding: 14 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  button: { height: 44, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: "#dfe3e8", backgroundColor: "#fff", justifyContent: "center" },
  buttonText: { color: "#22262d", fontWeight: "600" },
  primary: { height: 44, paddingHorizontal: 18, borderRadius: 8, backgroundColor: "#15171c", justifyContent: "center", alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "700" },
  loading: { marginTop: 4 },
  preview: { width: 140, height: 140, borderRadius: 8, backgroundColor: "#e9edf2" },
  output: { width: "100%", aspectRatio: 1, borderRadius: 8, backgroundColor: "#e9edf2" },
  videoLink: { padding: 14, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3e8" },
  videoTitle: { fontWeight: "700", color: "#15171c" },
  videoUrl: { color: "#69707a", marginTop: 6 },
  voiceArea: { gap: 12 },
  voiceModes: { flexDirection: "row", gap: 8, justifyContent: "center" },
  voiceMode: { paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#dfe3e8", backgroundColor: "#fff", justifyContent: "center" },
  voiceChoices: { gap: 8 },
  audioPicker: { minHeight: 140, borderWidth: 1, borderStyle: "dashed", borderColor: "#cbd3dd", borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  transcript: { padding: 14, backgroundColor: "#fff", borderRadius: 8, color: "#22262d", lineHeight: 22 },
  chatArea: { gap: 12 },
  messages: { maxHeight: 360, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e6eb" },
  messagesContent: { padding: 12, gap: 10 },
  emptyTitle: { color: "#9aa1ab", textAlign: "center", paddingVertical: 24 },
  message: { borderRadius: 10, padding: 12, maxWidth: "100%" },
  userMessage: { backgroundColor: "#eef3fb", alignSelf: "flex-start" },
  assistantMessage: { backgroundColor: "#f4f6f8", alignSelf: "flex-start" },
  messageRole: { fontWeight: "700", color: "#15171c", marginBottom: 4 },
  messageText: { color: "#22262d", lineHeight: 21 },
  messageImages: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  messageImage: { width: 96, height: 96, borderRadius: 6, backgroundColor: "#e9edf2" },
  composer: { gap: 10 },
  chatInput: { minHeight: 90, maxHeight: 150, textAlignVertical: "top", backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3e8", borderRadius: 8, padding: 12 },
  controlBar: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  chatImagePreviews: { gap: 8, paddingVertical: 2 },
  chatImageWrap: { position: "relative" },
  chatImagePreview: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#e9edf2" },
  chatImageRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: "#c0392b", alignItems: "center", justifyContent: "center", zIndex: 2 },
  chatImageRemoveText: { color: "#fff", fontWeight: "700", lineHeight: 20 },
  musicArea: { gap: 12 },
  musicIntro: { gap: 4 },
  musicTitle: { fontSize: 18, fontWeight: "700", color: "#15171c" },
  musicHint: { color: "#69707a", lineHeight: 20 },
  musicChoices: { gap: 8 },
  musicLengthChoices: { gap: 8 },
  lengthCard: { minWidth: 110, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#dfe3e8", backgroundColor: "#fff" },
  lengthLabel: { fontWeight: "700", color: "#15171c" },
  lengthDuration: { color: "#69707a", marginTop: 2, fontSize: 12 },
  musicOutputs: { gap: 10 },
  resultBlock: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e6eb", borderRadius: 10, padding: 12 },
  resultHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  resultTitle: { fontWeight: "700", color: "#15171c", flex: 1, marginRight: 8 },
  copyButton: { height: 32, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: "#dfe3e8", backgroundColor: "#fff", justifyContent: "center" },
  copyButtonText: { color: "#22262d", fontWeight: "600", fontSize: 12 },
  resultText: { color: "#22262d", lineHeight: 21 },
  modelArea: { gap: 8 },
  modelChips: { gap: 8, paddingVertical: 2 },
  choiceChip: { height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: "#dfe3e8", backgroundColor: "#fff", justifyContent: "center", maxWidth: 220 },
  choiceChipText: { color: "#22262d", fontWeight: "600" },
  galleryArea: { gap: 12 },
  galleryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  galleryItem: { width: "48%", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e6eb", borderRadius: 10, overflow: "hidden" },
  galleryThumb: { width: "100%", aspectRatio: 1, backgroundColor: "#e9edf2" },
  galleryItemBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 8, gap: 6 },
  galleryItemPrompt: { flex: 1, color: "#22262d", fontSize: 12 },
  galleryDownload: { height: 28, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: "#dfe3e8", justifyContent: "center" },
  galleryDownloadText: { color: "#22262d", fontWeight: "600", fontSize: 12 },
  previewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 22 },
  previewCard: { width: "100%", maxWidth: 520, backgroundColor: "#fff", borderRadius: 14, padding: 16, gap: 12 },
  previewImage: { width: "100%", height: 380, borderRadius: 10, backgroundColor: "#e9edf2" },
  previewTitle: { color: "#15171c", fontWeight: "600", lineHeight: 21 }
});
