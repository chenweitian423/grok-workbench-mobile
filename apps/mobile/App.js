import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_GROK2API_BASE_URL || "http://192.168.123.195:38695";
const DEFAULT_API_KEY = process.env.EXPO_PUBLIC_GROK2API_KEY || "";
const DEFAULT_MEDIA_BASE_URL = process.env.EXPO_PUBLIC_GROK2API_MEDIA_BASE_URL || "http://192.168.123.195:38695";
const DEFAULT_CHAT_MODELS = ["grok-4.5", "grok-4", "grok-3", "grok-3-mini", "grok-composer-2.5-fast"];
const DEFAULT_IMAGE_MODELS = ["grok-imagine-image"];
const aspectRatios = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const resolutions = ["1k", "2k", "4k"];
const counts = [1, 2, 4];

export default function App() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [mediaBaseUrl, setMediaBaseUrl] = useState(DEFAULT_MEDIA_BASE_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [health, setHealth] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(DEFAULT_IMAGE_MODELS[0]);
  const [chatModel, setChatModel] = useState(DEFAULT_CHAT_MODELS[0]);
  const [prompt, setPrompt] = useState("一位东方女性，电影质感，精致光影，真实摄影");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [count, setCount] = useState(1);
  const [results, setResults] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [toolInput, setToolInput] = useState("");
  const [toolResult, setToolResult] = useState("");
  const [referenceImage, setReferenceImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState("image");
  const [toolMode, setToolMode] = useState("text");
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [status, setStatus] = useState("等待连接");
  const [saved, setSaved] = useState(false);

  const apiBase = useMemo(() => normalizeBaseUrl(baseUrl), [baseUrl]);
  const mediaApiBase = useMemo(() => normalizeBaseUrl(mediaBaseUrl || baseUrl), [mediaBaseUrl, baseUrl]);
  const imageModels = useMemo(() => mergeModels(models.filter((item) => isImageModel(item.id)).map((item) => item.id), DEFAULT_IMAGE_MODELS), [models]);
  const chatModels = useMemo(() => mergeModels(models.filter((item) => !isImageModel(item.id)).map((item) => item.id), DEFAULT_CHAT_MODELS), [models]);
  const connected = Boolean(health?.ok || health?.status === "ok" || models.length > 0);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const stored = await AsyncStorage.getItem("grok-workbench-settings");
    if (stored) {
        const value = JSON.parse(stored);
        if (value.baseUrl) setBaseUrl(value.baseUrl);
        if (value.mediaBaseUrl) setMediaBaseUrl(value.mediaBaseUrl);
        if (value.apiKey) setApiKey(value.apiKey);
    }
  }

  async function saveSettings() {
    await AsyncStorage.setItem("grok-workbench-settings", JSON.stringify({ baseUrl, mediaBaseUrl, apiKey }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    await refresh();
  }

  async function refresh() {
    try {
      setStatus("连接工作台");
      try {
        setHealth(await requestJSON("/healthz", { auth: false }));
      } catch {
        setHealth({ status: "gateway" });
      }

      if (!apiKey.trim()) {
        setModels([]);
        setStatus("请填写 Key");
        return;
      }

      const modelsBody = await requestJSON("/v1/models", { auth: true });
      const nextModels = Array.isArray(modelsBody.data) ? modelsBody.data : [];
      setModels(nextModels);
      const nextImage = nextModels.find((item) => isImageModel(item.id));
      const nextChat = nextModels.find((item) => !isImageModel(item.id));
      if (nextImage && model === DEFAULT_IMAGE_MODELS[0]) setModel(nextImage.id);
      if (nextChat && chatModel === DEFAULT_CHAT_MODELS[0]) setChatModel(nextChat.id);
      setStatus("准备就绪");
    } catch (error) {
      setStatus("连接失败");
      setHealth(null);
      Alert.alert("连接失败", error.message);
    }
  }

  async function generate() {
    if (!requireKey() || !prompt.trim()) return;
    setLoading(true);
    setStatus("生成中");
    try {
      const body = await requestJSON("/v1/images/generations", {
        method: "POST",
        auth: true,
        body: { model, prompt: prompt.trim(), n: count, aspect_ratio: aspectRatio, resolution, response_format: "url" }
      });
      const images = (body.data || []).map((item, index) => ({
        id: `${Date.now()}-${index}`,
        url: absoluteMediaUrl(item.url, item.b64_json),
        prompt: prompt.trim(),
        model
      }));
      setResults((current) => [...images, ...current]);
      setStatus(`完成 ${images.length} 张`);
    } catch (error) {
      setStatus("生成失败");
      Alert.alert("生成失败", error.message || "上游服务不可用，请确认图片模型和提示词内容。");
    } finally {
      setLoading(false);
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!requireKey() || !text) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setChatInput("");
    setMessages(nextMessages);
    setLoading(true);
    try {
      const body = await requestJSON("/v1/chat/completions", {
        method: "POST",
        auth: true,
        body: { model: chatModel, messages: nextMessages, stream: false }
      });
      setMessages((current) => [...current, { role: "assistant", content: extractChatText(body) }]);
    } catch (error) {
      Alert.alert("聊天失败", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function createPrompt() {
    if (!requireKey()) return;
    if (toolMode === "text" && !toolInput.trim()) return;
    setLoading(true);
    setToolResult("");
    try {
      const instruction = toolMode === "text"
        ? `把下面的简短描述扩写成专业图片生成提示词。必须使用简体中文输出，只输出一段可直接用于图片生成的完整中文提示词，不要输出 JSON，不要解释。要求包含主体、构图、镜头、光影、色彩、材质、风格、细节和负面约束；必要的模型术语可以保留英文。\n${toolInput.trim()}`
        : "请分析这张图片并生成可用于图片模型的还原提示词。必须使用简体中文输出。输出两段：第一段为中文结构化要点，第二段标题为“可直接使用的提示词：”，后面只写完整中文提示词；必要的模型术语可以保留英文。";
      const content = toolMode === "text"
        ? instruction
        : [{ type: "text", text: `${instruction}\n${toolInput.trim()}` }, { type: "image_url", image_url: { url: await imageAsDataUrl(referenceImage) } }];
      const body = await requestJSON("/v1/chat/completions", {
        method: "POST",
        auth: true,
        body: { model: chatModel, messages: [{ role: "user", content }], stream: false }
      });
      setToolResult(extractChatText(body));
    } catch (error) {
      Alert.alert("提示词生成失败", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function pickReferenceImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, base64: false });
    if (!result.canceled && result.assets?.[0]) {
      setReferenceImage(result.assets[0]);
      setToolResult("");
    }
  }

  function useToolResult() {
    if (!toolResult.trim()) return;
    setPrompt(cleanImagePrompt(toolResult));
    setTab("image");
  }

  function requireKey() {
    if (!apiKey.trim()) {
      Alert.alert("缺少 Key", "请在右上角设置中填写 API Key。");
      return false;
    }
    return true;
  }

  async function requestJSON(path, options = {}) {
    const headers = {};
    if (options.auth) headers.Authorization = `Bearer ${apiKey.trim()}`;
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
    if (!response.ok) throw new Error(body?.error?.message || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function absoluteMediaUrl(value, b64Json) {
    if (b64Json && !value) return `data:image/jpeg;base64,${b64Json}`;
    if (!value) return "";
    if (String(value).startsWith("data:")) return value;
    try {
      const url = new URL(value);
      if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
        const base = new URL(url.pathname.startsWith("/v1/media/") ? mediaApiBase : apiBase);
        url.protocol = base.protocol;
        url.hostname = base.hostname;
        url.port = base.port;
      }
      return url.toString();
    } catch {
      return `${apiBase}${String(value).startsWith("/") ? value : `/${value}`}`;
    }
  }

  async function imageAsDataUrl(asset) {
    if (!asset?.uri) throw new Error("请先选择一张参考图片");
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:${asset.mimeType || "image/jpeg"};base64,${base64}`;
  }

  async function shareImage(item) {
    await Share.share({ title: "Grok 生成图", message: item.url, url: item.url });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.shell} behavior="padding">
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>GROK WORKBENCH</Text>
            <Text style={styles.title}>{tab === "image" ? "图片工作台" : tab === "chat" ? "聊天" : "提示词工具"}</Text>
          </View>
          <View style={styles.headerButtons}>
            <Pressable style={styles.iconButton} onPress={refresh}><Ionicons name="refresh" size={20} color="#202020" /></Pressable>
            <Pressable style={styles.iconButton} onPress={() => setSettingsOpen((value) => !value)}><Ionicons name="settings-outline" size={20} color="#202020" /></Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, connected ? styles.statusGood : styles.statusBad]}>
              <View style={[styles.dot, connected ? styles.dotGood : styles.dotBad]} />
              <Text style={styles.statusText}>{status}</Text>
            </View>
            <Text style={styles.serverText}>直连 API 网关</Text>
          </View>
          {settingsOpen ? <Settings {...{ baseUrl, setBaseUrl, mediaBaseUrl, setMediaBaseUrl, apiKey, setApiKey, refresh, saveSettings, saved }} /> : null}
          {tab === "image" ? <ImageWorkspace {...{ imageModels, model, setModel, imagePickerOpen, setImagePickerOpen, results, shareImage, prompt, setPrompt, count, setCount, aspectRatio, setAspectRatio, resolution, setResolution, generate, loading }} /> : null}
          {tab === "chat" ? <ChatWorkspace {...{ messages, chatInput, setChatInput, sendChat, loading, chatModel, setChatModel, chatModels, chatPickerOpen, setChatPickerOpen }} /> : null}
          {tab === "tools" ? <PromptWorkspace {...{ toolMode, setToolMode, toolInput, setToolInput, toolResult, pickReferenceImage, referenceImage, createPrompt, useToolResult, loading }} /> : null}
        </ScrollView>
        <View style={styles.tabBar}>
          <TabButton icon="image-outline" label="图片" active={tab === "image"} onPress={() => setTab("image")} />
          <TabButton icon="chatbubble-ellipses-outline" label="聊天" active={tab === "chat"} onPress={() => setTab("chat")} />
          <TabButton icon="sparkles-outline" label="提示词" active={tab === "tools"} onPress={() => setTab("tools")} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Settings({ baseUrl, setBaseUrl, mediaBaseUrl, setMediaBaseUrl, apiKey, setApiKey, refresh, saveSettings, saved }) {
  return <View style={styles.panel}>
    <Text style={styles.label}>API 地址</Text>
    <TextInput value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} placeholder="https://api.sky423.cn:18888 或 http://192.168.123.195:38695" placeholderTextColor="#999" style={styles.input} />
    <Text style={styles.label}>图片媒体地址</Text>
    <TextInput value={mediaBaseUrl} onChangeText={setMediaBaseUrl} autoCapitalize="none" autoCorrect={false} placeholder="Sub2 转发时填 Grok2API 地址，如 http://192.168.123.195:38695" placeholderTextColor="#999" style={styles.input} />
    <Text style={styles.label}>API Key</Text>
    <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="sk-... / g2a_..." placeholderTextColor="#999" style={styles.input} />
    <View style={styles.settingsActions}>
      <Pressable style={styles.testButton} onPress={saveSettings}><Ionicons name="save-outline" size={18} color="#111" /><Text style={styles.testButtonText}>{saved ? "已保存" : "保存配置"}</Text></Pressable>
      <Pressable style={styles.testButton} onPress={refresh}><Ionicons name="pulse-outline" size={18} color="#111" /><Text style={styles.testButtonText}>测试连接</Text></Pressable>
    </View>
  </View>;
}

function ImageWorkspace(props) {
  const { imageModels, model, setModel, imagePickerOpen, setImagePickerOpen, results, shareImage, prompt, setPrompt, count, setCount, aspectRatio, setAspectRatio, resolution, setResolution, generate, loading } = props;
  return <>
    <View style={styles.modeBar}><View style={styles.modeActive}><Ionicons name="image-outline" size={18} color="#111" /><Text style={styles.modeActiveText}>图片生成</Text></View><View style={styles.modeDisabled}><Ionicons name="videocam-outline" size={18} color="#999" /><Text style={styles.modeDisabledText}>视频暂不支持</Text></View></View>
    <ModelPanel open={imagePickerOpen} models={imageModels} value={model} onSelect={(id) => { setModel(id); setImagePickerOpen(false); }} />
    <View style={styles.gallery}>{results.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons name="image-sparkle-outline" size={44} color="#777" /><Text style={styles.emptyTitle}>还没有图片</Text><Text style={styles.emptyText}>输入描述后生成，结果会显示在这里。</Text></View> : results.map((item, index) => <View key={item.id} style={styles.card}><Image source={{ uri: item.url }} style={styles.image} resizeMode="cover" /><View style={styles.cardFooter}><Text style={styles.cardTitle}>图片 {results.length - index}</Text><View style={styles.cardActions}><Pressable style={styles.smallButton} onPress={() => shareImage(item)}><Ionicons name="share-outline" size={18} color="#111" /></Pressable><Pressable style={styles.smallButton} onPress={() => Linking.openURL(item.url)}><Ionicons name="open-outline" size={18} color="#111" /></Pressable></View></View></View>)}</View>
    <View style={styles.composer}><TextInput value={prompt} onChangeText={setPrompt} multiline placeholder="描述你想生成的画面" placeholderTextColor="#999" style={styles.prompt} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controls}><ToolButton icon="sparkles-outline" label={model || "选择图片模型"} onPress={() => setImagePickerOpen((value) => !value)} /><Segment values={counts} value={count} onChange={setCount} suffix="x" /><Segment values={aspectRatios} value={aspectRatio} onChange={setAspectRatio} /><Segment values={resolutions} value={resolution} onChange={setResolution} /></ScrollView><Pressable style={[styles.send, loading && styles.sendDisabled]} onPress={generate} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={24} color="#fff" />}</Pressable></View>
  </>;
}

function ChatWorkspace({ messages, chatInput, setChatInput, sendChat, loading, chatModel, setChatModel, chatModels, chatPickerOpen, setChatPickerOpen }) {
  return <View style={styles.chatArea}>
    <View style={styles.chatToolbar}>
      <ToolButton icon="chatbubble-ellipses-outline" label={chatModel || "选择聊天模型"} onPress={() => setChatPickerOpen((value) => !value)} />
      <Text style={styles.toolbarHint}>点击模型名称选择</Text>
    </View>
    <ModelPanel open={chatPickerOpen} models={chatModels} value={chatModel} onSelect={(id) => { setChatModel(id); setChatPickerOpen(false); }} />
    {messages.length === 0 ? <View style={styles.empty}><Ionicons name="chatbubble-ellipses-outline" size={44} color="#777" /><Text style={styles.emptyTitle}>开始聊天</Text><Text style={styles.emptyText}>直接使用所选模型交流、改写和构思。</Text></View> : messages.map((item, index) => <View key={`${item.role}-${index}`} style={[styles.message, item.role === "user" ? styles.userMessage : styles.assistantMessage]}><Text style={styles.messageRole}>{item.role === "user" ? "你" : "Grok"}</Text><Text style={styles.messageText}>{item.content}</Text></View>)}
    <View style={styles.chatComposer}><TextInput value={chatInput} onChangeText={setChatInput} multiline placeholder="输入消息..." placeholderTextColor="#999" style={styles.chatInput} /><Pressable style={[styles.send, loading && styles.sendDisabled]} onPress={sendChat} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={22} color="#fff" />}</Pressable></View>
  </View>;
}

function PromptWorkspace({ toolMode, setToolMode, toolInput, setToolInput, toolResult, pickReferenceImage, referenceImage, createPrompt, useToolResult, loading }) {
  return <View style={styles.toolArea}>
    <View style={styles.segmentWide}><Pressable style={[styles.segmentWideItem, toolMode === "text" && styles.segmentWideActive]} onPress={() => setToolMode("text")}><Text style={styles.segmentWideText}>文字生成提示词</Text></Pressable><Pressable style={[styles.segmentWideItem, toolMode === "image" && styles.segmentWideActive]} onPress={() => setToolMode("image")}><Text style={styles.segmentWideText}>图片还原提示词</Text></Pressable></View>
    {toolMode === "image" ? <Pressable style={styles.imagePicker} onPress={pickReferenceImage}>{referenceImage ? <Image source={{ uri: referenceImage.uri }} style={styles.referenceImage} /> : <><Ionicons name="image-outline" size={28} color="#777" /><Text style={styles.emptyText}>选择参考图片</Text></>}</Pressable> : null}
    <TextInput value={toolInput} onChangeText={setToolInput} multiline placeholder={toolMode === "text" ? "例如：雨夜东京街头，一位穿红色风衣的女孩" : "选择图片后，可补充你想重点还原的内容"} placeholderTextColor="#999" style={styles.toolInput} />
    <Pressable style={[styles.primaryButton, loading && styles.sendDisabled]} onPress={createPrompt} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Ionicons name="sparkles-outline" size={18} color="#fff" /><Text style={styles.primaryButtonText}>生成提示词</Text></>}</Pressable>
    {toolResult ? <View style={styles.resultPanel}><Text style={styles.resultLabel}>结果</Text><Text selectable style={styles.resultText}>{toolResult}</Text><Pressable style={styles.secondaryButton} onPress={useToolResult}><Ionicons name="arrow-forward-outline" size={18} color="#111" /><Text style={styles.secondaryButtonText}>发送到图片生成</Text></Pressable></View> : null}
  </View>;
}

function ModelPanel({ open, models, value, onSelect }) {
  if (!open) return null;
  return <View style={styles.modelPanel}>
    {models.map((id) => <Pressable key={id} style={[styles.modelRow, id === value && styles.modelRowActive]} onPress={() => onSelect(id)}>
      <Text numberOfLines={1} style={[styles.modelRowText, id === value && styles.modelRowTextActive]}>{id}</Text>
      {id === value ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
    </Pressable>)}
  </View>;
}

function TabButton({ icon, label, active, onPress }) {
  return <Pressable style={styles.tabButton} onPress={onPress}><Ionicons name={icon} size={20} color={active ? "#111" : "#888"} /><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></Pressable>;
}

function ToolButton({ icon, label, onPress }) {
  return <Pressable style={styles.toolButton} onPress={onPress}><Ionicons name={icon} size={16} color="#111" /><Text numberOfLines={1} style={styles.toolText}>{label}</Text><Ionicons name="chevron-down" size={15} color="#555" /></Pressable>;
}

function Segment({ values, value, onChange, suffix = "" }) {
  return <View style={styles.segment}>{values.map((item) => <Pressable key={String(item)} style={[styles.segmentItem, item === value && styles.segmentItemActive]} onPress={() => onChange(item)}><Text style={[styles.segmentText, item === value && styles.segmentTextActive]}>{item}{suffix}</Text></Pressable>)}</View>;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function mergeModels(primary, fallback) {
  return Array.from(new Set([...primary.filter(Boolean), ...fallback]));
}

function isImageModel(id) {
  const value = String(id || "").toLowerCase();
  return value.includes("image") || value.includes("imagine") || value.includes("draw") || value.includes("flux");
}

function cleanImagePrompt(value) {
  let text = String(value || "").replace(/```(?:json|text)?/gi, "").replace(/```/g, "").trim();
  const markers = ["可直接使用的提示词", "可复制的完整还原提示词", "完整还原提示词", "还原提示词", "图片生成提示词"];
  for (const marker of markers) {
    const index = text.lastIndexOf(marker);
    if (index >= 0 && text.slice(index + marker.length).trim()) {
      text = text.slice(index + marker.length).replace(/^[:：\s]+/, "").trim();
      break;
    }
  }
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text);
      text = parsed.prompt || parsed.提示词 || parsed.还原提示词 || text;
    } catch {}
  }
  return text.slice(0, 12000);
}

function extractChatText(body) {
  const content = body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.text ?? body?.output?.[0]?.content;
  if (Array.isArray(content)) return content.map((item) => item.text || "").join("");
  return String(content || body?.message || "接口没有返回文本");
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f7f4" },
  shell: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: "#777", fontSize: 12, fontWeight: "800" },
  title: { color: "#141414", fontSize: 28, fontWeight: "800", marginTop: 2 },
  headerButtons: { flexDirection: "row", gap: 10 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#ecece7" },
  content: { paddingHorizontal: 16, paddingBottom: 100 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1 },
  statusGood: { backgroundColor: "#eff8ef", borderColor: "#d7ead7" },
  statusBad: { backgroundColor: "#fff0ed", borderColor: "#f2d2ca" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotGood: { backgroundColor: "#2f9e44" },
  dotBad: { backgroundColor: "#d9480f" },
  statusText: { color: "#222", fontSize: 13, fontWeight: "800" },
  serverText: { color: "#777", fontSize: 13, fontWeight: "800" },
  panel: { backgroundColor: "#fff", borderRadius: 8, padding: 14, borderWidth: 1, borderColor: "#ecece7", marginBottom: 12 },
  label: { fontSize: 13, color: "#555", fontWeight: "800", marginBottom: 8, marginTop: 4 },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: "#e4e4de", paddingHorizontal: 12, color: "#111", backgroundColor: "#fafaf8" },
  settingsActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  testButton: { flex: 1, height: 42, borderRadius: 8, borderWidth: 1, borderColor: "#ddd", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  testButtonText: { color: "#111", fontWeight: "800" },
  modeBar: { flexDirection: "row", backgroundColor: "#ecece7", borderRadius: 24, padding: 4, alignSelf: "flex-start", gap: 4, marginBottom: 16 },
  modeActive: { height: 38, paddingHorizontal: 16, borderRadius: 19, flexDirection: "row", gap: 7, alignItems: "center", backgroundColor: "#fff" },
  modeActiveText: { color: "#111", fontWeight: "800" },
  modeDisabled: { height: 38, paddingHorizontal: 16, borderRadius: 19, flexDirection: "row", gap: 7, alignItems: "center" },
  modeDisabledText: { color: "#888", fontWeight: "800" },
  modelPanel: { backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#ecece7", padding: 8, gap: 6, marginBottom: 12 },
  modelRow: { height: 40, borderRadius: 8, backgroundColor: "#f4f4f0", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modelRowActive: { backgroundColor: "#111" },
  modelRowText: { color: "#222", fontWeight: "800", flex: 1 },
  modelRowTextActive: { color: "#fff" },
  gallery: { gap: 16 },
  empty: { minHeight: 300, borderRadius: 8, borderWidth: 1, borderColor: "#ecece7", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "800", color: "#222" },
  emptyText: { marginTop: 6, fontSize: 14, color: "#777", textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#ecece7" },
  image: { width: "100%", aspectRatio: 1 },
  cardFooter: { minHeight: 54, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 14, color: "#555", fontWeight: "800" },
  cardActions: { flexDirection: "row", gap: 8 },
  smallButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f4f0" },
  composer: { marginTop: 18, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#deded8", padding: 12 },
  prompt: { minHeight: 74, maxHeight: 118, color: "#111", fontSize: 15, lineHeight: 21, textAlignVertical: "top" },
  controls: { alignItems: "center", gap: 8, paddingTop: 10 },
  toolButton: { height: 36, maxWidth: 240, borderRadius: 18, backgroundColor: "#f4f4f0", paddingHorizontal: 12, alignItems: "center", flexDirection: "row", gap: 6 },
  toolText: { color: "#111", fontSize: 13, fontWeight: "800", maxWidth: 180 },
  segment: { height: 36, borderRadius: 18, backgroundColor: "#f4f4f0", padding: 3, flexDirection: "row" },
  segmentItem: { minWidth: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segmentItemActive: { backgroundColor: "#111" },
  segmentText: { fontSize: 12, fontWeight: "800", color: "#555" },
  segmentTextActive: { color: "#fff" },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  sendDisabled: { opacity: 0.65 },
  chatArea: { gap: 10 },
  chatToolbar: { minHeight: 44, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#ecece7", padding: 4, flexDirection: "row", alignItems: "center", gap: 10 },
  toolbarHint: { color: "#888", fontSize: 12, fontWeight: "700" },
  message: { maxWidth: "88%", borderRadius: 8, padding: 12, borderWidth: 1 },
  userMessage: { alignSelf: "flex-end", backgroundColor: "#111", borderColor: "#111" },
  assistantMessage: { alignSelf: "flex-start", backgroundColor: "#fff", borderColor: "#ecece7" },
  messageRole: { fontSize: 12, fontWeight: "800", color: "#888", marginBottom: 5 },
  messageText: { color: "#222", fontSize: 15, lineHeight: 22 },
  chatComposer: { marginTop: 12, minHeight: 80, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#deded8", padding: 12, flexDirection: "row", alignItems: "flex-end", gap: 10 },
  chatInput: { flex: 1, minHeight: 46, maxHeight: 120, fontSize: 15, color: "#111", textAlignVertical: "top" },
  toolArea: { gap: 12 },
  segmentWide: { flexDirection: "row", backgroundColor: "#ecece7", borderRadius: 8, padding: 4 },
  segmentWideItem: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  segmentWideActive: { backgroundColor: "#fff" },
  segmentWideText: { color: "#222", fontWeight: "800", fontSize: 13 },
  imagePicker: { height: 220, borderWidth: 1, borderStyle: "dashed", borderColor: "#cfcfc8", borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  referenceImage: { width: "100%", height: "100%", resizeMode: "contain" },
  toolInput: { minHeight: 120, borderRadius: 8, borderWidth: 1, borderColor: "#e4e4de", backgroundColor: "#fff", padding: 12, fontSize: 15, lineHeight: 22, color: "#111", textAlignVertical: "top" },
  primaryButton: { height: 46, borderRadius: 8, backgroundColor: "#111", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  resultPanel: { backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#ecece7", padding: 14 },
  resultLabel: { color: "#777", fontSize: 12, fontWeight: "800", marginBottom: 8 },
  resultText: { color: "#222", fontSize: 14, lineHeight: 21 },
  secondaryButton: { marginTop: 14, height: 42, borderRadius: 8, backgroundColor: "#f4f4f0", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: "#111", fontWeight: "800" },
  tabBar: { height: 72, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e7e7e1", flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  tabButton: { alignItems: "center", justifyContent: "center", gap: 4, minWidth: 80 },
  tabText: { color: "#888", fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: "#111" }
});
