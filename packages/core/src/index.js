export const APP_VERSION = "1.0.9";
export const DEFAULT_BASE_URL = "/api";
export const DEFAULT_SERVER_BASE_URL = "http://192.168.123.195:38695";

export const DEFAULT_MODELS = {
  chat: "grok-chat-fast",
  image: "grok-imagine-image",
  imageQuality: "grok-imagine-image-quality",
  video: "grok-imagine-video",
  voice: "grok-voice-latest",
  speechToText: "grok-stt"
};

export const PROMPT_WORKFLOWS = [
  {
    id: "image-to-prompt",
    title: "上传图片 -> 生成还原提示词",
    shortTitle: "图片还原提示词",
    inputLabel: "补充说明",
    placeholder: "可选：补充人物、风格、用途，或者留空让模型只分析图片。",
    needsImage: true,
    outputLabel: "还原提示词",
    system: [
      "你是专业的图像提示词还原专家。",
      "用户会上传一张参考图片，你要从画面中还原可复用的 AI 生图提示词。",
      "输出必须包含：中文提示词、English prompt、主体、构图、镜头、光线、材质/服饰、风格、色彩、细节、负面提示词。",
      "不要解释你的工作过程，只给可复制使用的结果。"
    ].join("\n")
  },
  {
    id: "text-to-prompt",
    title: "文字描述 -> 生成专业图片提示词",
    shortTitle: "专业图片提示词",
    inputLabel: "文字描述",
    placeholder: "例如：赛博朋克雨夜里的红发女剑士。",
    needsImage: false,
    outputLabel: "专业图片提示词",
    system: [
      "你是专业 AI 图片提示词工程师。",
      "把用户的简短描述扩写成适合 Grok Imagine、Midjourney、Stable Diffusion 使用的专业图片提示词。",
      "输出必须包含：中文主提示词、English prompt、风格关键词、镜头/构图、灯光、画质参数建议、负面提示词。",
      "保持具体、可执行、画面感强。"
    ].join("\n")
  },
  {
    id: "cinematic-plan",
    title: "一句话 -> 生成完整影视制作全案",
    shortTitle: "影视制作全案",
    inputLabel: "一句话创意",
    placeholder: "例如：一个宇航员在月球废墟里发现会呼吸的花。",
    needsImage: false,
    outputLabel: "影视制作全案",
    system: [
      "你是电影导演、分镜师和 AI 视频提示词工程师。",
      "把用户的一句话创意扩展成完整影视制作全案。",
      "输出必须包含：片名、核心概念、视觉风格、角色/场景、美术设定、镜头分镜、镜头运动、动作设计、灯光色彩、声音氛围、剪辑节奏、可直接用于视频生成模型的中文 Prompt 和 English Prompt。",
      "结果要能直接指导 Grok Imagine Video 生成。"
    ].join("\n")
  }
];

export const PROMPT_TOOLS = PROMPT_WORKFLOWS;

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || DEFAULT_BASE_URL).trim();
  if (!value || value === "/") return "";
  return value.replace(/\/+$/, "");
}

function authHeaders(apiKey, extra = {}) {
  const headers = { ...extra };
  if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

async function parseResponse(response) {
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

export class GrokApi {
  constructor({ baseUrl = DEFAULT_BASE_URL, apiKey = "" } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
  }

  request(path, options = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: authHeaders(this.apiKey, options.headers)
    }).then(parseResponse);
  }

  health() {
    return this.request("/healthz");
  }

  models() {
    return this.request("/v1/models");
  }

  voices({ model = DEFAULT_MODELS.voice } = {}) {
    return this.request(`/v1/tts/voices?model=${encodeURIComponent(model)}`);
  }

  async translateForSpeech({ text, language, model = DEFAULT_MODELS.chat } = {}) {
    const source = String(text || "").trim();
    if (!source || !language || language === "auto") return source;
    const languageNames = {
      zh: "简体中文",
      en: "English",
      ja: "日本語",
      ko: "한국어",
      fr: "Français",
      de: "Deutsch",
      es: "Español"
    };
    const target = languageNames[language] || language;
    const data = await this.chat({
      model,
      temperature: 0.1,
      max_tokens: 1800,
      messages: [
        {
          role: "system",
          content: `你是语音合成前置翻译器。把用户文本完整翻译成${target}。保持原意、语气和标点，只输出译文，不要解释，不要加引号或语言标签。`
        },
        { role: "user", content: source }
      ]
    });
    const translated = data?.choices?.[0]?.message?.content?.trim();
    if (!translated) throw new Error("翻译接口没有返回有效文本");
    return translated;
  }

  chat({ model = DEFAULT_MODELS.chat, messages, temperature = 0.7, max_tokens = 2200 }) {
    return this.request("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature, max_tokens })
    });
  }

  responses({ model, messages }) {
    return this.request("/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: messages.map(({ role, content }) => ({ role, content })),
        stream: false,
        store: false
      })
    });
  }

  async runPromptWorkflow({ workflowId, input, imageDataUrl, model = DEFAULT_MODELS.chat }) {
    const workflow = PROMPT_WORKFLOWS.find((item) => item.id === workflowId) || PROMPT_WORKFLOWS[1];
    const textInput = input || "请根据上传图片生成还原提示词。";
    const userContent = imageDataUrl ? buildVisionContent(textInput, imageDataUrl, "chat") : input;

    const data = await this.chat({
      model,
      messages: [
        { role: "system", content: workflow.system },
        { role: "user", content: userContent }
      ]
    });
    let text = data?.choices?.[0]?.message?.content || "";
    if (imageDataUrl && looksLikeMissingImage(text)) {
      const retry = await this.chat({
        model,
        messages: [
          { role: "system", content: workflow.system },
          { role: "user", content: buildVisionContent(textInput, imageDataUrl, "responses") }
        ]
      });
      text = retry?.choices?.[0]?.message?.content || text;
    }
    return text;
  }

  improvePrompt({ toolId, input, imageDataUrl, model = DEFAULT_MODELS.chat }) {
    return this.runPromptWorkflow({ workflowId: toolId, input, imageDataUrl, model });
  }

  async describeReferenceImage({ prompt = "", imageDataUrl, model = DEFAULT_MODELS.chat } = {}) {
    if (!imageDataUrl) return "";
    const system = [
      "你是图生图任务的视觉分析器。",
      "分析参考图片，并提取可供图片生成模型复现的视觉约束。",
      "重点包含：主体身份与外观、姿态、构图、视角、场景、光线、色彩、服装/材质和画面风格。",
      "用户文字描述的修改意图优先；不要输出解释、标题或 Markdown，只输出一段紧凑的中文生图提示词。"
    ].join("\n");
    const instruction = prompt
      ? `用户的生成要求：${prompt}\n请结合参考图提取视觉约束。`
      : "请提取这张参考图的视觉约束。";
    const data = await this.chat({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: buildVisionContent(instruction, imageDataUrl, "chat") }
      ],
      max_tokens: 1200
    });
    return data?.choices?.[0]?.message?.content || "";
  }

  generateImage({ prompt, model = DEFAULT_MODELS.image, count = 1, aspectRatio = "1:1", resolution = "1k", response_format = "url" } = {}) {
    const body = {
      model,
      prompt,
      n: Number(count),
      aspect_ratio: aspectRatio,
      resolution,
      response_format,
      stream: false
    };
    return this.request("/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  generateVideo(options = {}) {
    const body = Object.prototype.hasOwnProperty.call(options, "aspect_ratio")
      ? options
      : buildVideoGenerationBody(options);
    return this.request("/v1/videos/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  async synthesizeSpeech({ model = DEFAULT_MODELS.voice, text, voiceId, language = "zh", speed = 1 } = {}) {
    if (!String(text || "").trim()) throw new Error("请输入要合成的文字");
    if (!voiceId) throw new Error("请选择音色");
    const response = await fetch(`${this.baseUrl}/v1/tts`, {
      method: "POST",
      headers: authHeaders(this.apiKey, {
        Accept: "application/json, audio/*",
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ model, text, voice_id: voiceId, language, speed: Number(speed) })
    });
    if (!response.ok) return parseResponse(response);
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (!data?.audio) throw new Error("语音接口没有返回音频");
      const type = data.content_type || "audio/mpeg";
      return { url: `data:${type};base64,${data.audio}`, contentType: type, duration: data.duration };
    }
    const bytes = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(bytes);
    return { url: `data:${contentType};base64,${base64}`, contentType };
  }

  async transcribeAudio({ model = DEFAULT_MODELS.speechToText, file, filename = "recording.webm", mimeType = "audio/webm", language = "zh" } = {}) {
    if (!file) throw new Error("请先上传音频文件");
    const form = new FormData();
    form.append("model", model);
    form.append("language", language);
    form.append("format", "true");
    if (file?.uri) {
      form.append("file", { uri: file.uri, name: file.name || filename, type: file.type || mimeType });
    } else {
      form.append("file", file, filename);
    }
    return this.requestMultipart("/v1/stt", form);
  }

  requestMultipart(path, body) {
    return fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: authHeaders(this.apiKey),
      body
    }).then(parseResponse);
  }

  getVideo(id) {
    return this.request(`/v1/videos/${encodeURIComponent(id)}`);
  }

  async getVideoSnapshot(id) {
    const encoded = encodeURIComponent(id);
    const candidates = [
      `/v1/videos/${encoded}`,
      `/v1/videos/generations/${encoded}`,
      `/v1/videos/${encoded}/status`,
      `/v1/videos/${encoded}/result`,
      `/v1/media/videos/${encoded}`,
      `/v1/media/${encoded}`
    ];

    let lastError = null;
    for (const path of candidates) {
      try {
        return await this.request(path);
      } catch (error) {
        const message = String(error?.message || "");
        if (message.includes("404")) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    if (lastError) throw lastError;
    return null;
  }
}

function arrayBufferToBase64(value) {
  const bytes = new Uint8Array(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  if (typeof btoa === "function") return btoa(binary);
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString("base64");
  throw new Error("当前客户端不支持音频编码");
}

export function extractMediaItems(data) {
  const rawItems = data?.data || data?.items || data?.images || data?.videos || data?.assets || data?.records || data?.results || data?.list || data?.rows || (Array.isArray(data) ? data : []);
  const normalizedItems = Array.isArray(rawItems) ? [...rawItems] : [rawItems].filter(Boolean);
  if (data?.video) normalizedItems.push(data.video);
  if (data?.image) normalizedItems.push(data.image);
  if (data?.result) normalizedItems.push(data.result);
  if (data?.media) normalizedItems.push(data.media);
  if (data?.asset) normalizedItems.push(data.asset);
  if (data?.result_asset) normalizedItems.push(data.result_asset);
  if (data?.resultAsset) normalizedItems.push(data.resultAsset);
  if (data?.result_asset_id || data?.resultAssetId) normalizedItems.push({
    id: data.result_asset_id || data.resultAssetId,
    asset_id: data.result_asset_id || data.resultAssetId,
    assetId: data.result_asset_id || data.resultAssetId,
    mime_type: data.content_type || data.contentType,
    content_type: data.content_type || data.contentType
  });
  collectNestedMedia(data, normalizedItems);
  return normalizedItems.map((item) => ({
    id: item.id || item.asset_id || item.url || item.b64_json?.slice(0, 20),
    url: normalizeMediaUrl(assetIdToUrl(item.asset_id || item.assetId || item.result_asset_id || item.resultAssetId || item.id) || item.url || item.asset_url || item.video_url || item.image_url || item.download_url || item.media_url || item.mediaUrl || item.thumbnail_url || item.thumbnailUrl),
    b64: item.b64_json,
    mime: item.mime_type || item.content_type || item.mimeType || ""
  })).filter((item) => item.url || item.b64);
}

function collectNestedMedia(value, output, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectNestedMedia(item, output, seen));
    return;
  }

  const nestedId = value.id || value.asset_id || value.assetId || value.result_asset_id || value.resultAssetId;
  const nestedUrl = value.url || value.asset_url || value.video_url || value.image_url || value.download_url || value.media_url || value.mediaUrl;
  if (/^(img|vid)_[A-Za-z0-9._-]+$/.test(String(nestedId || "")) || /(img|vid)_[A-Za-z0-9._-]+/.test(String(nestedUrl || ""))) {
    output.push(value);
  }
  Object.values(value).forEach((item) => collectNestedMedia(item, output, seen));
}

function buildVisionContent(text, imageDataUrl, mode = "chat") {
  if (mode === "responses") {
    return [
      { type: "input_text", text },
      { type: "input_image", image_url: imageDataUrl }
    ];
  }
  return [
    { type: "text", text },
    { type: "image_url", image_url: { url: imageDataUrl } }
  ];
}

function looksLikeMissingImage(text) {
  return /请(先|直接)?上传|未(收到|看到|提供).*图|没有.*图|看不到.*图|无法.*查看.*图|upload.*image|no image/i.test(String(text || ""));
}

function assetIdToUrl(id) {
  const value = String(id || "");
  if (/^(img|vid)_/.test(value)) return `/asset/${encodeURIComponent(value)}`;
  return "";
}

export function extractJobId(data) {
  return data?.request_id || data?.requestId || data?.id || data?.job_id || data?.jobId || data?.data?.request_id || data?.data?.requestId || data?.data?.id || data?.data?.job_id || data?.data?.[0]?.id || "";
}

export function normalizeMediaUrl(value) {
  if (!value) return "";
  const raw = String(value);
  if (raw.startsWith("data:")) return raw;

  try {
    const url = new URL(raw);
    if (["127.0.0.1", "localhost", "::1", "host.docker.internal"].includes(url.hostname)) {
      return `/api${url.pathname}${url.search}`;
    }
    if (url.pathname.startsWith("/v1/media/")) {
      return `/api${url.pathname}${url.search}`;
    }
    return raw;
  } catch {
    if (raw.startsWith("/v1/media/")) return `/api${raw}`;
    return raw;
  }
}

export function buildVideoGenerationBody({ prompt, model = DEFAULT_MODELS.video, duration = 6, aspectRatio = "16:9", resolution = "720p", image } = {}) {
  const body = {
    model,
    prompt,
    duration: Number(duration),
    aspect_ratio: aspectRatio,
    resolution
  };
  if (image) body.image = { url: image };
  return body;
}
