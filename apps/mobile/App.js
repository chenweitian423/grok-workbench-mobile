import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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

const aspectRatios = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const resolutions = ["1k", "2k", "4k"];
const counts = [1, 2, 4];

export default function App() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [health, setHealth] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("grok-imagine-image");
  const [prompt, setPrompt] = useState("生成一张东方旗袍美女，电影质感，精致光影");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [count, setCount] = useState(1);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState("等待连接");

  const apiBase = useMemo(() => baseUrl.replace(/\/+$/, ""), [baseUrl]);
  const imageModels = models.filter((item) => isImageModel(item.id));
  const connected = Boolean(health?.ok || health?.status === "ok");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      setStatus("连接工作台");
      const healthBody = await requestJSON("/healthz", { auth: false });
      setHealth(healthBody);

      if (!apiKey.trim()) {
        setModels([]);
        setStatus("需要填写 Key");
        return;
      }

      const modelsBody = await requestJSON("/v1/models", { auth: true });
      const nextModels = Array.isArray(modelsBody.data) ? modelsBody.data : [];
      setModels(nextModels);

      const preferred = nextModels.find((item) => item.id === model) || nextModels.find((item) => isImageModel(item.id));
      if (preferred) setModel(preferred.id);
      setStatus("准备就绪");
    } catch (error) {
      setStatus("连接失败");
      Alert.alert("连接失败", error.message);
    }
  }

  async function generate() {
    if (!apiKey.trim()) {
      Alert.alert("缺少 Key", "请在右上角设置里填写 Grok2API 客户端 Key。");
      return;
    }
    if (!prompt.trim()) {
      Alert.alert("提示词为空", "请输入你想生成的画面。");
      return;
    }

    setLoading(true);
    setStatus("生成中");
    try {
      const body = await requestJSON("/v1/images/generations", {
        method: "POST",
        auth: true,
        body: {
          model,
          prompt: prompt.trim(),
          n: count,
          aspect_ratio: aspectRatio,
          resolution,
          response_format: "url"
        }
      });

      const images = (body.data || []).map((item, index) => ({
        id: `${Date.now()}-${index}`,
        url: absoluteMediaUrl(item.url),
        prompt: prompt.trim(),
        model
      }));
      setResults((current) => [...images, ...current]);
      setStatus(`完成 ${images.length} 张`);
    } catch (error) {
      setStatus("生成失败");
      Alert.alert("生成失败", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestJSON(path, options = {}) {
    const method = options.method || "GET";
    const headers = {};
    if (options.auth) headers.Authorization = `Bearer ${apiKey.trim()}`;
    if (options.body) headers["Content-Type"] = "application/json";

    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || `HTTP ${response.status}`);
    }
    return body;
  }

  function absoluteMediaUrl(value) {
    if (!value) return "";
    let url;
    try {
      url = new URL(value);
    } catch {
      return `${apiBase}${value.startsWith("/") ? value : `/${value}`}`;
    }
    if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      const base = new URL(apiBase);
      url.protocol = base.protocol;
      url.hostname = base.hostname;
      url.port = base.port;
    }
    return url.toString();
  }

  function cycleModel() {
    if (!imageModels.length) return;
    const index = imageModels.findIndex((item) => item.id === model);
    setModel(imageModels[(index + 1) % imageModels.length].id);
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
            <Text style={styles.brand}>Grok2API</Text>
            <Text style={styles.title}>创作工作台</Text>
          </View>
          <View style={styles.headerButtons}>
            <Pressable style={styles.iconButton} onPress={refresh}>
              <Ionicons name="refresh" size={20} color="#202020" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => setSettingsOpen((value) => !value)}>
              <Ionicons name="settings-outline" size={20} color="#202020" />
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, connected ? styles.statusGood : styles.statusBad]}>
              <View style={[styles.dot, connected ? styles.dotGood : styles.dotBad]} />
              <Text style={styles.statusText}>{status}</Text>
            </View>
            <Text style={styles.serverText}>直连服务端</Text>
          </View>

          {settingsOpen ? (
            <View style={styles.panel}>
              <Text style={styles.label}>Grok2API 地址</Text>
              <TextInput
                value={baseUrl}
                onChangeText={setBaseUrl}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Text style={styles.label}>客户端 Key</Text>
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder="g2a_xxx_xxx"
                placeholderTextColor="#999"
                style={styles.input}
              />
              <Pressable style={styles.testButton} onPress={refresh}>
                <Ionicons name="pulse-outline" size={18} color="#111" />
                <Text style={styles.testButtonText}>测试连接</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.modeBar}>
            <View style={styles.modeActive}>
              <Ionicons name="image-outline" size={18} color="#111" />
              <Text style={styles.modeActiveText}>图片</Text>
            </View>
            <View style={styles.modeDisabled}>
              <Ionicons name="videocam-outline" size={18} color="#999" />
              <Text style={styles.modeDisabledText}>视频先不做</Text>
            </View>
          </View>

          <View style={styles.gallery}>
            {results.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="image-sparkle-outline" size={44} color="#777" />
                <Text style={styles.emptyTitle}>还没有图片</Text>
                <Text style={styles.emptyText}>输入提示词后生成，结果会显示在这里。</Text>
              </View>
            ) : (
              results.map((item, index) => (
                <View key={item.id} style={styles.card}>
                  <Image source={{ uri: item.url }} style={styles.image} resizeMode="cover" />
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardTitle}>图片 {results.length - index}</Text>
                    <View style={styles.cardActions}>
                      <Pressable style={styles.smallButton} onPress={() => shareImage(item)}>
                        <Ionicons name="share-outline" size={18} color="#111" />
                      </Pressable>
                      <Pressable style={styles.smallButton} onPress={() => Linking.openURL(item.url)}>
                        <Ionicons name="open-outline" size={18} color="#111" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            multiline
            placeholder="描述你想生成的画面"
            placeholderTextColor="#999"
            style={styles.prompt}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controls}>
            <ToolButton icon="sparkles-outline" label={model} onPress={cycleModel} />
            <Segment values={counts} value={count} onChange={setCount} suffix="x" />
            <Segment values={aspectRatios} value={aspectRatio} onChange={setAspectRatio} />
            <Segment values={resolutions} value={resolution} onChange={setResolution} />
          </ScrollView>
          <Pressable style={[styles.send, loading && styles.sendDisabled]} onPress={generate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={24} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isImageModel(id) {
  const value = String(id || "").toLowerCase();
  return value.includes("image") || value.includes("imagine");
}

function ToolButton({ icon, label, onPress }) {
  return (
    <Pressable style={styles.toolButton} onPress={onPress}>
      <Ionicons name={icon} size={16} color="#111" />
      <Text numberOfLines={1} style={styles.toolText}>{label}</Text>
      <Ionicons name="chevron-down" size={15} color="#555" />
    </Pressable>
  );
}

function Segment({ values, value, onChange, suffix = "" }) {
  return (
    <View style={styles.segment}>
      {values.map((item) => {
        const active = item === value;
        return (
          <Pressable key={String(item)} style={[styles.segmentItem, active && styles.segmentItemActive]} onPress={() => onChange(item)}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item}{suffix}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f7f4" },
  shell: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  brand: { color: "#777", fontSize: 12, fontWeight: "800" },
  title: { color: "#141414", fontSize: 28, fontWeight: "800", marginTop: 2 },
  headerButtons: { flexDirection: "row", gap: 10 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ecece7"
  },
  content: { paddingHorizontal: 16, paddingBottom: 220 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    borderWidth: 1
  },
  statusGood: { backgroundColor: "#eff8ef", borderColor: "#d7ead7" },
  statusBad: { backgroundColor: "#fff0ed", borderColor: "#f2d2ca" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotGood: { backgroundColor: "#2f9e44" },
  dotBad: { backgroundColor: "#d9480f" },
  statusText: { color: "#222", fontSize: 13, fontWeight: "800" },
  serverText: { color: "#777", fontSize: 13, fontWeight: "800" },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#ecece7",
    marginBottom: 12
  },
  label: { fontSize: 13, color: "#555", fontWeight: "800", marginBottom: 8, marginTop: 4 },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e4e4de",
    paddingHorizontal: 12,
    color: "#111",
    backgroundColor: "#fafaf8"
  },
  testButton: {
    marginTop: 12,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  testButtonText: { color: "#111", fontWeight: "800" },
  modeBar: {
    flexDirection: "row",
    backgroundColor: "#ecece7",
    borderRadius: 24,
    padding: 4,
    alignSelf: "flex-start",
    gap: 4,
    marginBottom: 16
  },
  modeActive: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    backgroundColor: "#fff"
  },
  modeActiveText: { color: "#111", fontWeight: "800" },
  modeDisabled: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    flexDirection: "row",
    gap: 7,
    alignItems: "center"
  },
  modeDisabledText: { color: "#888", fontWeight: "800" },
  gallery: { gap: 16 },
  empty: {
    minHeight: 360,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ecece7",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "800", color: "#222" },
  emptyText: { marginTop: 6, fontSize: 14, color: "#777", textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#ecece7" },
  image: { width: "100%", aspectRatio: 1 },
  cardFooter: {
    minHeight: 54,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cardTitle: { fontSize: 14, color: "#555", fontWeight: "800" },
  cardActions: { flexDirection: "row", gap: 8 },
  smallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f4f0"
  },
  composer: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#deded8",
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 6
  },
  prompt: {
    minHeight: 62,
    maxHeight: 118,
    color: "#111",
    fontSize: 15,
    lineHeight: 21,
    paddingRight: 52,
    textAlignVertical: "top"
  },
  controls: { alignItems: "center", gap: 8, paddingTop: 10, paddingRight: 58 },
  toolButton: {
    height: 36,
    maxWidth: 210,
    borderRadius: 18,
    backgroundColor: "#f4f4f0",
    paddingHorizontal: 12,
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  toolText: { color: "#111", fontSize: 13, fontWeight: "800", maxWidth: 150 },
  segment: { height: 36, borderRadius: 18, backgroundColor: "#f4f4f0", padding: 3, flexDirection: "row" },
  segmentItem: { minWidth: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segmentItemActive: { backgroundColor: "#111" },
  segmentText: { fontSize: 12, fontWeight: "800", color: "#555" },
  segmentTextActive: { color: "#fff" },
  send: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center"
  },
  sendDisabled: { opacity: 0.65 }
});
