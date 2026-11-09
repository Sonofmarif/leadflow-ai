// ============================================================================
// 🛡️ LEADFLOW AI - ENTERPRISE BACKGROUND ENGINE v2.5.0
// Universal AI Key Auto-Detector | Dynamic Model Discovery | Anti-Detect Timings
// Real-Time Listing & Image Scraper | MV3 Keep-Alive Heartbeat
// ============================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const humanSleep = (minMs = 350, maxMs = 850) => sleep(randInt(minMs, maxMs));

let isAutomationRunning = false;
let extensionStopEpoch = 0;
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
    chrome.storage.local.set({ __lastHeartbeat: Date.now() });
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("✅ LeadFlow AI v2.5.0 Enterprise Engine Installed & Ready.");
  chrome.storage.local.get(["aiConfig", "humanMode"], (res) => {
    if (!res.aiConfig) {
      chrome.storage.local.set({
        aiConfig: {
          enabled: false,
          apiKey: "",
          provider: "auto",
          model: "",
          serviceNiche: "Emergency Plumber",
          uniquePerTab: true,
          tone: "urgent",
          emojis: true
        },
        humanMode: "balanced"
      });
    }
  });
});

function startStopAwareWork() {
  return extensionStopEpoch;
}

function isStopRequested(epoch) {
  return Number(epoch) !== Number(extensionStopEpoch);
}

function throwIfStopped(epoch) {
  if (isStopRequested(epoch)) throw new Error("Stopped by user");
}

async function setTabStopEpoch(tabId, epoch = extensionStopEpoch) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (stopEpoch) => { window.__MP_EXT_STOP_EPOCH__ = Number(stopEpoch) || 0; },
      args: [epoch]
    });
  } catch (e) {}
}

async function stopAllExtensionWork() {
  extensionStopEpoch += 1;
  isAutomationRunning = false;
  stopKeepAlive();
  cancelOpenListingAutofillJob(activeOpenListingAutofillJob, "Stopped by user");

  const currentEpoch = extensionStopEpoch;
  try { await chrome.storage.local.set({ __MP_EXT_STOP_EPOCH__: currentEpoch }); } catch (e) {}

  try {
    const tabs = await chrome.tabs.query({
      url: ["*://www.facebook.com/*", "*://facebook.com/*", "*://web.facebook.com/*", "*://m.facebook.com/*"]
    });
    await Promise.all((tabs || []).filter((t) => t?.id).map(async (tab) => {
      try { await chrome.tabs.sendMessage(tab.id, { type: "STOP_EXTENSION_WORK", stopEpoch: currentEpoch }); } catch (e) {}
      await setTabStopEpoch(tab.id, currentEpoch);
    }));
  } catch (e) {}

  return currentEpoch;
}

async function reportErrorTelemetry(context, errorObj) {
  try {
    const { telemetryWebhookUrl } = await chrome.storage.local.get("telemetryWebhookUrl");
    const payload = {
      timestamp: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      context,
      error: String(errorObj?.message || errorObj),
      stack: errorObj?.stack || null
    };
    if (telemetryWebhookUrl && telemetryWebhookUrl.startsWith("https://")) {
      await fetch(telemetryWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
  } catch (e) {}
}

// ============================================================================
// 🧠 UNIVERSAL AI PROVIDER & MODEL DETECTION ENGINE
// ============================================================================
const PROVIDER_METADATA = {
  gemini: {
    name: "Google Gemini",
    icon: "🤖",
    defaultModel: "gemini-3.8-flash",
    recommendedModels: ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
    badgeText: "Fast & Free Tier Available"
  },
  groq: {
    name: "Groq Cloud",
    icon: "⚡",
    defaultModel: "llama-3.3-70b-versatile",
    recommendedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    badgeText: "Ultra-Fast Inference"
  },
  openai: {
    name: "OpenAI",
    icon: "🧠",
    defaultModel: "gpt-4o-mini",
    recommendedModels: ["gpt-4o-mini", "gpt-4o", "o3-mini"],
    badgeText: "Industry Benchmark"
  },
  openrouter: {
    name: "OpenRouter",
    icon: "🌐",
    defaultModel: "openai/gpt-4o-mini",
    recommendedModels: ["openai/gpt-4o-mini", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct"],
    badgeText: "200+ Multi-Model Router"
  },
  anthropic: {
    name: "Anthropic Claude",
    icon: "🔮",
    defaultModel: "claude-3-5-haiku-20241022",
    recommendedModels: ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022"],
    badgeText: "Top Copywriting Nuance"
  },
  deepseek: {
    name: "DeepSeek",
    icon: "👁️",
    defaultModel: "deepseek-chat",
    recommendedModels: ["deepseek-chat", "deepseek-reasoner"],
    badgeText: "Cost-Effective Reasoning"
  },
  nvidia: {
    name: "NVIDIA NIM",
    icon: "🟩",
    defaultModel: "meta/llama-3.1-70b-instruct",
    recommendedModels: ["meta/llama-3.1-70b-instruct", "mistralai/mixtral-8x22b-instruct-v0.1"],
    badgeText: "Enterprise Acceleration"
  }
};

function sanitizeApiKey(rawKey = "") {
  let k = String(rawKey || "").trim();
  // Strip wrapping quotes (double, single, smart quotes, backticks)
  k = k.replace(/^["'`“”‘’\s]+|["'`“”‘’\s]+$/g, "");
  // Strip "Bearer " prefix if user accidentally included it
  k = k.replace(/^Bearer\s+/i, "");
  // Strip any env var style prefixes like "GEMINI_API_KEY=", "API_KEY=", "key:", etc.
  k = k.replace(/^[A-Za-z0-9_-]+[:=]\s*/, "");
  return k.trim();
}

function detectAiProvider(apiKey = "", forcedProvider = "auto") {
  const key = sanitizeApiKey(apiKey);

  if (!key) return { provider: "none", name: "No Key", icon: "⚪", defaultModel: "", recommendedModels: [] };

  // 1. Signature analysis from key itself
  let detectedProvider = null;
  if (key.startsWith("AIza") || key.includes("AIzaSy")) {
    detectedProvider = "gemini";
  } else if (key.startsWith("gsk_")) {
    detectedProvider = "groq";
  } else if (key.startsWith("sk-ant-")) {
    detectedProvider = "anthropic";
  } else if (key.startsWith("sk-or-")) {
    detectedProvider = "openrouter";
  } else if (key.startsWith("nvapi-")) {
    detectedProvider = "nvidia";
  } else if (key.startsWith("sk-proj-") || key.startsWith("sk-admin-")) {
    detectedProvider = "openai";
  } else if (key.startsWith("sk-")) {
    detectedProvider = "openai";
  } else if (/^[A-Za-z0-9_-]{35,45}$/.test(key)) {
    // 39-character alphanumeric keys are standard Google AI Studio Gemini keys
    detectedProvider = "gemini";
  } else {
    // Default safe fallback is Google Gemini (free tier)
    detectedProvider = "gemini";
  }

  // 2. Resolve user choice vs detected signature (prevent fatal mismatches)
  let finalProvider = detectedProvider;
  if (forcedProvider && forcedProvider !== "auto" && PROVIDER_METADATA[forcedProvider]) {
    const isBlatantMismatch =
      (forcedProvider === "openrouter" && (key.startsWith("AIza") || key.includes("AIzaSy"))) ||
      (forcedProvider === "gemini" && key.startsWith("sk-or-")) ||
      (forcedProvider === "gemini" && key.startsWith("gsk_"));

    if (!isBlatantMismatch) {
      finalProvider = forcedProvider;
    }
  }

  const meta = PROVIDER_METADATA[finalProvider] || PROVIDER_METADATA.gemini;
  return {
    provider: finalProvider,
    name: meta.name,
    icon: meta.icon,
    defaultModel: meta.defaultModel,
    recommendedModels: meta.recommendedModels,
    badgeText: meta.badgeText
  };
}

// Live Model Fetcher: Queries provider's official /models API
async function fetchProviderModels(apiKey = "", forcedProvider = "auto") {
  const key = sanitizeApiKey(apiKey);
  const detected = detectAiProvider(key, forcedProvider);
  const provider = (forcedProvider && forcedProvider !== "auto") ? forcedProvider : detected.provider;

  if (!key || provider === "none") {
    return { ok: false, error: "Please enter an API key to fetch models." };
  }

  const meta = PROVIDER_METADATA[provider] || PROVIDER_METADATA.gemini;
  const tStart = Date.now();

  try {
    let models = [];

    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const rawList = Array.isArray(data?.models) ? data.models : [];
      models = rawList
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => m.name.replace(/^models\//, ""))
        .filter(id => !id.includes("embedding") && !id.includes("aqa") && !id.includes("imagen") && id !== "gemini-2.0-flash");

      const preferredOrder = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
      models.sort((a, b) => {
        const ia = preferredOrder.indexOf(a);
        const ib = preferredOrder.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      });
    } else if (provider === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { "Authorization": `Bearer ${key}` }
      });
      if (!res.ok) throw new Error(`Groq API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const rawList = Array.isArray(data?.data) ? data.data : [];
      models = rawList
        .filter(m => m.active !== false && !m.id.includes("whisper"))
        .map(m => m.id);
    } else if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { "Authorization": `Bearer ${key}` }
      });
      if (!res.ok) throw new Error(`OpenAI API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const rawList = Array.isArray(data?.data) ? data.data : [];
      models = rawList
        .map(m => m.id)
        .filter(id => id.startsWith("gpt-") || id.startsWith("o3-") || id.startsWith("o1-"))
        .sort((a, b) => (a.includes("mini") ? -1 : 1));
    } else if (provider === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { "Authorization": `Bearer ${key}` }
      });
      if (!res.ok) throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const rawList = Array.isArray(data?.data) ? data.data : [];
      models = rawList.slice(0, 50).map(m => m.id);
    } else if (provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/models", {
        headers: { "Authorization": `Bearer ${key}` }
      });
      if (!res.ok) throw new Error(`DeepSeek API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      models = (data?.data || []).map(m => m.id);
    } else {
      models = meta.recommendedModels;
    }

    // Ensure recommended models are at top
    const combined = [...new Set([...meta.recommendedModels, ...models])];
    const bestModel = combined.find(m => meta.recommendedModels.includes(m)) || combined[0] || meta.defaultModel;

    return {
      ok: true,
      provider,
      providerName: meta.name,
      icon: meta.icon,
      models: combined,
      bestModel,
      latencyMs: Date.now() - tStart
    };
  } catch (err) {
    return {
      ok: false,
      provider,
      providerName: meta.name,
      icon: meta.icon,
      error: err.message || String(err),
      fallbackModels: meta.recommendedModels,
      bestModel: meta.defaultModel
    };
  }
}

// Universal AI Caller for variations and direct copywriting
async function callAiApi({ apiKey, provider, model, prompt, systemPrompt }) {
  const key = sanitizeApiKey(apiKey);
  if (!key) throw new Error("API Key is missing or invalid. Paste your key in ⚡ AI & CONFIG tab.");

  const prov = provider || "auto";
  const detected = detectAiProvider(key, prov);
  const activeProvider = detected.provider;
  let activeModel = model?.trim() || detected.defaultModel;

  const sys = systemPrompt || "You are an expert US local home-services copywriter for Facebook Marketplace.";
  const tStart = Date.now();

  let rawText = "";
  let modelUsed = activeModel;

  if (activeProvider === "gemini") {
    let targetModel = (activeModel || "gemini-3.8-flash").trim().replace(/^models\//, "");
    if (!targetModel || targetModel === "gemini-2.0-flash" || targetModel.includes("2.0-flash")) {
      targetModel = "gemini-3.8-flash";
    }

    const executeGemini = async (m) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`;
      return await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${sys}\n\n${prompt}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.85,
            maxOutputTokens: 600
          }
        })
      });
    };

    let res = await executeGemini(targetModel);

    // Self-healing: if 404 or decommissioned, parse suggested model or fallback
    if (!res.ok) {
      const errText = await res.text();
      let retryModel = null;

      // Extract model suggestion from error (e.g., "Please update your code to use models/gemini-3.8-flash")
      const match = errText.match(/models\/(gemini-[\w.-]+)/i);
      if (match && match[1] && match[1] !== targetModel) {
        retryModel = match[1];
      } else if (res.status === 404) {
        const fallbacks = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
        retryModel = fallbacks.find(f => f !== targetModel) || "gemini-1.5-flash";
      }

      if (retryModel) {
        console.warn(`[LeadFlow AI] Auto-healing Gemini model: ${targetModel} -> ${retryModel}`);
        targetModel = retryModel;
        res = await executeGemini(targetModel);
      }

      if (!res.ok) {
        const finalErr = await res.text();
        let msg = `Gemini HTTP ${res.status}`;
        try { msg += `: ${JSON.parse(finalErr).error.message}`; } catch(e) { msg += `: ${finalErr.slice(0, 150)}`; }
        throw new Error(msg);
      }
    }

    modelUsed = targetModel;
    // Persist healed model to storage if it changed
    try {
      const { aiConfig } = await chrome.storage.local.get("aiConfig");
      if (aiConfig && aiConfig.model !== modelUsed) {
        aiConfig.model = modelUsed;
        await chrome.storage.local.set({ aiConfig });
      }
    } catch(e) {}

    const data = await res.json();
    rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else if (activeProvider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "dangerously-allow-browser": "true"
      },
      body: JSON.stringify({
        model: activeModel,
        system: sys,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.85
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Anthropic error (${res.status}): ${errBody.slice(0, 150)}`);
    }
    const data = await res.json();
    rawText = data?.content?.[0]?.text || "";
    modelUsed = activeModel;
  } else {
    // OpenAI-compatible endpoints (Groq, OpenAI, OpenRouter, DeepSeek, NVIDIA)
    const endpoints = {
      groq: "https://api.groq.com/openai/v1/chat/completions",
      openai: "https://api.openai.com/v1/chat/completions",
      openrouter: "https://openrouter.ai/api/v1/chat/completions",
      deepseek: "https://api.deepseek.com/v1/chat/completions",
      nvidia: "https://integrate.api.nvidia.com/v1/chat/completions"
    };
    const endpoint = endpoints[activeProvider] || endpoints.openrouter;

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    };
    if (activeProvider === "openrouter") {
      headers["HTTP-Referer"] = "https://facebook.com/marketplace";
      headers["X-Title"] = "LeadFlow AI";
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: activeModel,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt }
        ],
        temperature: 0.85,
        max_tokens: 600
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      let msg = `${detected.name} error (${res.status})`;
      try { msg += `: ${JSON.parse(errBody).error.message}`; } catch(e) { msg += `: ${errBody.slice(0, 150)}`; }
      throw new Error(msg);
    }

    const data = await res.json();
    rawText = data?.choices?.[0]?.message?.content || "";
    modelUsed = activeModel;
  }

  const latencyMs = Date.now() - tStart;
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.description) {
        return {
          title: String(parsed.title).trim(),
          description: String(parsed.description).trim(),
          modelUsed,
          provider: activeProvider,
          latencyMs,
          aiUsed: true
        };
      }
    } catch (e) {}
  }

  // Fallback if model returned plain text
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
  const fallbackTitle = lines[0]?.replace(/^title:\s*/i, "") || "Professional Local Service";
  const fallbackDesc = lines.slice(1).join(" ").replace(/^description:\s*/i, "") || rawText;

  return {
    title: fallbackTitle.slice(0, 95),
    description: fallbackDesc,
    modelUsed,
    provider: activeProvider,
    latencyMs,
    aiUsed: true
  };
}

async function generateAiListingVariation({ baseTitle, baseDescription, niche, city, tabIndex }) {
  const { aiConfig } = await chrome.storage.local.get("aiConfig");
  if (!aiConfig?.enabled || !aiConfig?.apiKey) {
    return { title: baseTitle, description: baseDescription, aiUsed: false };
  }

  const tone = aiConfig.tone || "urgent";
  const useEmojis = aiConfig.emojis !== false;

  const toneInstructions = {
    urgent: "Direct, urgent call to action. Highlight 24/7 fast dispatch, free immediate quotes, and local trust.",
    professional: "Polished, licensed & insured tone. Emphasize quality workmanship, warranty, and background-checked technicians.",
    bargain: "Emphasize big savings, seasonal discounts, and transparent flat-rate pricing with no hidden fees."
  }[tone] || "Friendly, local, dependable.";

  const emojiRule = useEmojis ? "Include 1-2 subtle, professional emojis in the title and description (e.g. ⚡, 🛠️, 📍)." : "Do NOT use any emojis.";

  const prompt = `Create a unique, high-converting Facebook Marketplace listing for a local service business.
Target Service/Niche: ${niche || baseTitle || "Home Service"}
Target City/Region: ${city || "Local Service Area"}
Base Title Reference: ${baseTitle || ""}
Base Description Reference: ${baseDescription || ""}
Tab Variation Index: #${tabIndex + 1} (Seed: ${randInt(100, 9999)})
Tone Guidelines: ${toneInstructions}
${emojiRule}

Output Rules:
1. "title": Maximum 65 characters. Punchy, local, natural.
2. "description": 3 to 5 concise sentences highlighting what you fix/do, fast response times, and a clear call to action to message now.
3. Return ONLY valid JSON: {"title": "...", "description": "..."}`;

  try {
    const result = await callAiApi({
      apiKey: aiConfig.apiKey,
      provider: aiConfig.provider,
      model: aiConfig.model,
      prompt
    });
    return result;
  } catch (err) {
    console.warn("AI variation generation failed, using fallback:", err);
    reportErrorTelemetry("generateAiListingVariation", err);
    return { title: baseTitle, description: baseDescription, aiUsed: false, error: err.message };
  }
}

// ============================================================================
// 📸 ACTIVE TAB LISTING & IMAGE SCRAPER
// ============================================================================
async function scrapeActiveListingTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found to scrape.");

  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const url = location.href.toLowerCase();
      let title = "";
      let price = "";
      let description = "";
      let category = "";
      const imageUrls = [];

      // 1. Facebook Marketplace Listing Item Page
      if (url.includes("/marketplace/item/")) {
        // Title
        const h1 = document.querySelector('h1, div[role="main"] h1');
        if (h1) title = h1.innerText?.trim() || "";

        // Price
        const priceSpans = Array.from(document.querySelectorAll('div[role="main"] span, span[dir="auto"]'));
        const priceSpan = priceSpans.find(s => /^\s*\$[\d,]+(\.\d{2})?\s*$/.test(s.innerText || ""));
        if (priceSpan) {
          price = priceSpan.innerText.replace(/[^0-9.]/g, "").trim();
        }

        // Description
        const descHeaders = Array.from(document.querySelectorAll('span, div, h2')).filter(el =>
          (el.innerText || "").trim().toLowerCase() === "description"
        );
        for (const h of descHeaders) {
          const parent = h.closest('div[role="main"], div');
          const candidate = parent?.querySelector('div[dir="auto"] span, div[dir="auto"]');
          if (candidate && candidate.innerText && candidate.innerText !== "Description") {
            description = candidate.innerText.trim();
            break;
          }
        }

        // Images: Look for high-res carousel / gallery images
        const imgs = Array.from(document.querySelectorAll('div[role="main"] img, img[src*="scontent"], img[src*="fbcdn"]'));
        imgs.forEach(img => {
          const src = img.src || img.currentSrc || "";
          if (src && (src.includes("scontent") || src.includes("fbcdn.net")) && !src.includes("p50x50") && !src.includes("p100x100")) {
            // Check dimensions
            if (img.naturalWidth > 150 || img.clientWidth > 150 || imgs.length <= 4) {
              imageUrls.push(src);
            }
          }
        });
      } else {
        // Generic Webpage / E-Commerce / Classifieds Scraper
        title = document.querySelector('meta[property="og:title"]')?.content ||
                document.querySelector('h1')?.innerText?.trim() ||
                document.title || "";

        const priceRegex = /\$[\d,]+(\.\d{2})?/;
        const bodyText = document.body?.innerText || "";
        const priceMatch = bodyText.match(priceRegex);
        if (priceMatch) price = priceMatch[0].replace(/[^0-9.]/g, "");

        description = document.querySelector('meta[property="og:description"]')?.content ||
                      document.querySelector('meta[name="description"]')?.content ||
                      "";

        const ogImg = document.querySelector('meta[property="og:image"]')?.content;
        if (ogImg) imageUrls.push(ogImg);

        const pageImgs = Array.from(document.querySelectorAll('img')).filter(img =>
          img.naturalWidth >= 200 && img.naturalHeight >= 200 && !img.src.includes(".svg")
        );
        pageImgs.forEach(img => { if (img.src) imageUrls.push(img.src); });
      }

      return {
        url: location.href,
        title: title.slice(0, 100),
        price: price ? String(parseInt(price, 10) || "") : "",
        description: description.slice(0, 2000),
        category,
        imageUrls: [...new Set(imageUrls)].slice(0, 10)
      };
    }
  });

  const scraped = res?.result;
  if (!scraped || (!scraped.title && !scraped.imageUrls.length)) {
    throw new Error("Could not detect any product listing details or photos on this tab.");
  }

  // Convert scraped images to Data URLs in background so popup can store & use them
  const downloadedDataUrls = [];
  const imageNames = [];

  for (let i = 0; i < scraped.imageUrls.length; i++) {
    const imgUrl = scraped.imageUrls[i];
    try {
      const resp = await fetch(imgUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        if (base64) {
          downloadedDataUrls.push(base64);
          imageNames.push(`scraped_photo_${i + 1}.jpg`);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch image URL:", imgUrl, e);
    }
  }

  return {
    ok: true,
    listing: {
      title: scraped.title,
      price: scraped.price,
      description: scraped.description,
      category: scraped.category,
      imageDataList: downloadedDataUrls,
      imageFileNames: imageNames,
      imagesScraped: downloadedDataUrls.length
    }
  };
}

// ============================================================================
// ⚡ TIMINGS & SPEED PROFILES
// ============================================================================
async function getTimingProfile() {
  const { humanMode } = await chrome.storage.local.get("humanMode");
  if (humanMode === "turbo") {
    return {
      tabOpenMin: 80,
      tabOpenMax: 180,
      stepMin: 100,
      stepMax: 240,
      waitAutofillTimeout: 4500,
      waitTabTimeout: 8000
    };
  }
  if (humanMode === "safe") {
    return {
      tabOpenMin: 650,
      tabOpenMax: 1200,
      stepMin: 700,
      stepMax: 1400,
      waitAutofillTimeout: 12000,
      waitTabTimeout: 20000
    };
  }
  // Balanced (Default)
  return {
    tabOpenMin: 220,
    tabOpenMax: 480,
    stepMin: 280,
    stepMax: 600,
    waitAutofillTimeout: 7500,
    waitTabTimeout: 12000
  };
}

function waitTabComplete(tabId, timeoutMs = 15000, stopEpoch = null) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(async () => {
      if (stopEpoch !== null && isStopRequested(stopEpoch)) {
        clearInterval(timer);
        resolve(false);
        return;
      }
      try {
        const t = await chrome.tabs.get(tabId);
        if (t && t.status === "complete") {
          clearInterval(timer);
          resolve(true);
          return;
        }
      } catch (e) {}
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 120);
  });
}

async function getLiveTabIds(tabIds = []) {
  const live = [];
  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.id) live.push(tabId);
    } catch (e) {}
  }
  return live;
}

let activeOpenListingAutofillJob = null;
let openListingAutofillJobSequence = 0;

function cancelOpenListingAutofillJob(job, reason = "Cancelled") {
  if (!job) return;
  job.cancelled = true;
  job.cancelReason = reason;
  job.running = false;
  if (activeOpenListingAutofillJob === job) {
    activeOpenListingAutofillJob = null;
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  const job = activeOpenListingAutofillJob;
  if (!job || !job.running || !job.tabIds.includes(tabId)) return;
  job.closedTabIds.add(tabId);
  if (job.tabIds.length && job.tabIds.every((id) => job.closedTabIds.has(id))) {
    cancelOpenListingAutofillJob(job, "All tabs closed.");
  }
});

async function activateTabAndWaitVisible(tabId, timeoutMs = 8000, stopEpoch = null) {
  try {
    const t = await chrome.tabs.get(tabId);
    if (t?.windowId) {
      try { await chrome.windows.update(t.windowId, { focused: true }); } catch (e) {}
    }
    await chrome.tabs.update(tabId, { active: true });
  } catch (e) {}

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (stopEpoch !== null && isStopRequested(stopEpoch)) return false;
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.visibilityState === "visible"
      });
      if (res?.result === true) return true;
    } catch (e) {}
    await humanSleep(50, 120);
  }
  return false;
}

function waitAutofillDone(tabId, timeoutMs = 8000, stopEpoch = null) {
  return new Promise((resolve) => {
    let finished = false;
    const stopTimer = setInterval(() => {
      if (stopEpoch !== null && isStopRequested(stopEpoch) && !finished) {
        finished = true;
        clearInterval(stopTimer);
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(false);
      }
    }, 60);

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      clearInterval(stopTimer);
      chrome.runtime.onMessage.removeListener(listener);
      resolve(false);
    }, timeoutMs);

    function listener(msg, sender) {
      if (msg?.type === "AF_FILL_DONE" && sender?.tab?.id === tabId) {
        if (finished || (stopEpoch !== null && isStopRequested(stopEpoch))) return;
        finished = true;
        clearInterval(stopTimer);
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(true);
      }
    }
    chrome.runtime.onMessage.addListener(listener);
  });
}

async function ensureAutofillContentReady(tabId, stopEpoch = null) {
  let alreadyReady = false;
  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.__AF_AUTOFILL_INIT_AUTO__
    });
    alreadyReady = probe?.result === true;
  } catch (e) {}

  if (!alreadyReady) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["auto/content.js"] });
    } catch (e) {}
  }

  // Fast readiness check: Do NOT require visibilityState == visible for background tabs!
  for (let i = 0; i < 15; i++) {
    if (stopEpoch !== null && isStopRequested(stopEpoch)) return false;
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.readyState !== "loading"
      });
      if (res?.result === true) return true;
    } catch (e) {}
    await sleep(100);
  }
  return false;
}

async function resolveAutofillImageAssignment(requestedIndex = 0) {
  try {
    const stored = await chrome.storage.local.get(["imageMode", "imageDataList"]);
    const images = Array.isArray(stored?.imageDataList) ? stored.imageDataList : [];
    const mode = stored?.imageMode === "multiple" ? "multiple" : "single";
    const requested = Math.max(0, Number(requestedIndex) || 0);
    const index = mode === "multiple" && images.length ? requested % images.length : 0;
    return { mode, index, count: images.length };
  } catch (error) {
    return { mode: "single", index: 0, count: 0 };
  }
}

async function runAutofillOnTab(tabId, stopEpoch = startStopAwareWork(), imageIndex = 0, targetCity = "") {
  const timing = await getTimingProfile();
  const imageAssignment = await resolveAutofillImageAssignment(imageIndex);
  const storedData = await chrome.storage.local.get(["title", "description", "aiConfig"]);

  let customOverride = null;
  if (storedData?.aiConfig?.enabled && storedData?.aiConfig?.apiKey && storedData?.aiConfig?.uniquePerTab) {
    customOverride = await generateAiListingVariation({
      baseTitle: storedData.title || "",
      baseDescription: storedData.description || "",
      niche: storedData.aiConfig.serviceNiche || storedData.title || "",
      city: targetCity,
      tabIndex: imageIndex
    });
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    throwIfStopped(stopEpoch);
    await setTabStopEpoch(tabId, stopEpoch);
    await activateTabAndWaitVisible(tabId, 8000, stopEpoch);
    throwIfStopped(stopEpoch);
    await Promise.race([waitTabComplete(tabId, timing.waitTabTimeout, stopEpoch), sleep(1200)]);
    throwIfStopped(stopEpoch);
    await ensureAutofillContentReady(tabId, stopEpoch);
    throwIfStopped(stopEpoch);
    await humanSleep(timing.stepMin, timing.stepMax);
    throwIfStopped(stopEpoch);

    const doneWait = waitAutofillDone(tabId, timing.waitAutofillTimeout, stopEpoch);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (assignedIndex, assignedMode) => {
          window.__AF_RUN_IMAGE_INDEX__ = Number(assignedIndex) || 0;
          window.__AF_RUN_IMAGE_MODE__ = assignedMode === "multiple" ? "multiple" : "single";
        },
        args: [imageAssignment.index, imageAssignment.mode]
      });

      await chrome.tabs.sendMessage(tabId, {
        type: "AF_RUN_NOW",
        stopEpoch,
        imageIndex: imageAssignment.index,
        imageMode: imageAssignment.mode,
        imageCount: imageAssignment.count,
        overrideTitle: customOverride?.title || null,
        overrideDescription: customOverride?.description || null
      });
    } catch (error) {}

    const done = await doneWait;
    throwIfStopped(stopEpoch);
    if (done) return true;
  }
  return false;
}

const MASTER_DEFAULT_STEPS = { autofill: true, saveDraft: true, draftOpener: true, locations: true, publish: true };

function normalizeMasterSteps(rawSteps) {
  if (!rawSteps || typeof rawSteps !== "object") return { ...MASTER_DEFAULT_STEPS };
  const steps = {
    autofill: !!rawSteps.autofill,
    saveDraft: !!rawSteps.saveDraft,
    draftOpener: !!rawSteps.draftOpener,
    locations: !!rawSteps.locations,
    publish: !!rawSteps.publish
  };
  if (rawSteps.all === true) return { ...MASTER_DEFAULT_STEPS };
  return Object.values(steps).some(Boolean) ? steps : { ...MASTER_DEFAULT_STEPS };
}

function uniqueSortedTabIds(tabs) {
  return [...new Map((tabs || [])
    .filter((t) => t && t.id && t.url)
    .sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index))
    .map((t) => [t.id, t.id]))
    .values()];
}

async function queryCreateListingTabs() {
  const tabs = await chrome.tabs.query({
    url: [
      "*://www.facebook.com/marketplace/create/item*",
      "*://facebook.com/marketplace/create/item*",
      "*://web.facebook.com/marketplace/create/item*",
      "*://m.facebook.com/marketplace/create/item*"
    ]
  });
  return uniqueSortedTabIds(tabs);
}

async function queryLocationReadyTabs() {
  const tabs = await chrome.tabs.query({
    url: ["*://www.facebook.com/marketplace/*", "*://facebook.com/marketplace/*", "*://web.facebook.com/marketplace/*", "*://m.facebook.com/marketplace/*"]
  });

  const eligible = (tabs || []).filter((t) => {
    const url = (t.url || "").toLowerCase();
    if (!url.includes("/marketplace/")) return false;
    if (url.includes("/marketplace/you/")) return false;
    if (url.includes("/marketplace/search")) return false;
    if (url.includes("/marketplace/browse")) return false;
    return url.includes("/marketplace/create/item") || url.includes("/marketplace/item/") || url.includes("/marketplace/edit/");
  });
  return uniqueSortedTabIds(eligible);
}

async function queryOpenDraftEditTabs() {
  const tabs = await chrome.tabs.query({
    url: ["*://www.facebook.com/marketplace/*", "*://facebook.com/marketplace/*", "*://web.facebook.com/marketplace/*", "*://m.facebook.com/marketplace/*"]
  });
  const draftTabs = (tabs || []).filter((t) => {
    const url = (t.url || "").toLowerCase();
    return url.includes("/marketplace/") && !url.includes("/marketplace/you/selling") && !url.includes("/marketplace/create/item");
  });
  return uniqueSortedTabIds(draftTabs);
}

async function openAndAutofillListingTabs(tabCount, stopEpoch = startStopAwareWork(), locations = []) {
  const timing = await getTimingProfile();
  const listingUrl = "https://www.facebook.com/marketplace/create/item";
  const createdTabIds = [];

  for (let i = 0; i < tabCount; i++) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    throwIfStopped(stopEpoch);
    const tab = await chrome.tabs.create({ url: listingUrl, active: false });
    if (tab?.id) createdTabIds.push(tab.id);
    await humanSleep(timing.tabOpenMin, timing.tabOpenMax);
  }

  await humanSleep(timing.stepMin, timing.stepMax);
  const filledTabIds = [];

  for (let i = 0; i < createdTabIds.length; i++) {
    const tabId = createdTabIds[i];
    if (!isAutomationRunning) throw new Error("Stopped by user");
    throwIfStopped(stopEpoch);
    try {
      const cityForTab = locations[i] || locations[locations.length - 1] || "";
      const filled = await runAutofillOnTab(tabId, stopEpoch, i, cityForTab);
      if (filled) filledTabIds.push(tabId);
      await humanSleep(timing.stepMin, timing.stepMax);
    } catch (e) {}
  }
  return filledTabIds;
}

async function saveDraftOnTab(tabId, stopEpoch = null) {
  const timing = await getTimingProfile();
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);

    try {
      if (stopEpoch !== null) await setTabStopEpoch(tabId, stopEpoch);
      await activateTabAndWaitVisible(tabId, 8000, stopEpoch);
      await Promise.race([waitTabComplete(tabId, 8000, stopEpoch), sleep(500)]);
      await humanSleep(timing.stepMin, timing.stepMax);

      const [saveResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: saveDraftFast
      });
      const result = saveResult?.result || {};
      if (result.ok) return { ok: true, result };
    } catch (error) {
      if (stopEpoch !== null && isStopRequested(stopEpoch)) throw error;
    }
    await humanSleep(timing.stepMin, timing.stepMax);
  }
  return { ok: false, error: "Save Draft was not confirmed" };
}

async function saveDraftTabs(createdTabIds = [], stopEpoch = null) {
  const draftTabIds = Array.isArray(createdTabIds) && createdTabIds.length ? createdTabIds : await queryCreateListingTabs();
  if (!draftTabIds.length) throw new Error("No create listing tabs found for Save Draft step.");

  const savedTabIds = [];
  for (const tabId of draftTabIds) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    const outcome = await saveDraftOnTab(tabId, stopEpoch);
    if (outcome.ok) savedTabIds.push(tabId);
    await humanSleep(250, 500);
  }

  await humanSleep(300, 600);
  for (const tabId of savedTabIds) {
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    try { await chrome.tabs.remove(tabId); } catch (e) {}
  }
  return { savedTabIds };
}

async function openDraftEditTabsFromSelling(tabCount, stopEpoch = null) {
  const timing = await getTimingProfile();
  if (stopEpoch !== null) throwIfStopped(stopEpoch);
  const managerTab = await chrome.tabs.create({ url: "https://www.facebook.com/marketplace/you/selling", active: true });
  if (stopEpoch !== null) await setTabStopEpoch(managerTab.id, stopEpoch);
  await waitTabComplete(managerTab.id, 12000, stopEpoch);
  await humanSleep(timing.stepMin, timing.stepMax);

  const targetedDrafts = await new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId: managerTab.id },
      func: () => {
        const elements = Array.from(document.querySelectorAll("span, div, a"));
        const buttons = elements.filter(el => {
          const text = (el.textContent || "").trim().toLowerCase();
          return text === "continue" || text === "continue listing" || text.includes("continue draft");
        });
        const links = buttons.map(btn => btn.closest("a")?.href).filter(Boolean);
        return [...new Set(links)];
      }
    }, (res) => resolve(res?.[0]?.result || []));
  });

  const editTabIds = [];
  for (const url of targetedDrafts.slice(0, tabCount || 50)) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    const t = await chrome.tabs.create({ url, active: false });
    if (t?.id) editTabIds.push(t.id);
    await humanSleep(timing.tabOpenMin, timing.tabOpenMax);
  }

  try { await chrome.tabs.remove(managerTab.id); } catch(e) {}
  return editTabIds;
}

async function pasteLocationsIntoTabs(editTabIds = [], inputLocations = [], stopEpoch = null) {
  const timing = await getTimingProfile();
  if (!inputLocations.length) throw new Error("No locations found.");
  let targetTabIds = Array.isArray(editTabIds) && editTabIds.length ? editTabIds : await queryOpenDraftEditTabs();
  if (!targetTabIds.length) throw new Error("No draft tabs found for Locations step.");

  await chrome.storage.local.set({ locations: inputLocations });

  for (let i = 0; i < targetTabIds.length; i++) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    const tabId = targetTabIds[i];
    try {
      if (stopEpoch !== null) await setTabStopEpoch(tabId, stopEpoch);
      await activateTabAndWaitVisible(tabId, 8000, stopEpoch);
      await waitTabComplete(tabId, 15000, stopEpoch);
      await humanSleep(timing.stepMin, timing.stepMax);

      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["auto/content-locations.js"] });
      } catch (e) {}

      let locResult = await chrome.tabs.sendMessage(tabId, { action: "updateLocation", index: i, stopEpoch });
      if (!locResult?.ok) {
        await humanSleep(200, 450);
        locResult = await chrome.tabs.sendMessage(tabId, { action: "updateLocation", index: i, stopEpoch });
      }
      await humanSleep(timing.stepMin, timing.stepMax);
    } catch(e) {}
  }
  return targetTabIds;
}

async function publishTabs(editTabIds = [], stopEpoch = null) {
  const timing = await getTimingProfile();
  let targetTabIds = Array.isArray(editTabIds) && editTabIds.length ? editTabIds : await queryOpenDraftEditTabs();
  if (!targetTabIds.length) throw new Error("No opened draft/edit tabs found for Publish step.");

  for (const tabId of targetTabIds) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    try {
      if (stopEpoch !== null) await setTabStopEpoch(tabId, stopEpoch);
      await activateTabAndWaitVisible(tabId, 8000, stopEpoch);
      await waitTabComplete(tabId, 15000, stopEpoch);
      await humanSleep(timing.stepMin, timing.stepMax);
      await chrome.scripting.executeScript({ target: { tabId }, func: clickNextAndPublishFast });
      await humanSleep(timing.stepMin, timing.stepMax);
    } catch (e) {}
  }
  return targetTabIds.length;
}

// ============================================================================
// 📩 CHROME RUNTIME MESSAGE DISPATCHER
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Auto Key Detector
  if (request?.type === "DETECT_AI_KEY") {
    sendResponse({ ok: true, ...detectAiProvider(request.apiKey || "", request.forcedProvider || "auto") });
    return true;
  }

  // Dynamic Live Model Fetcher
  if (request?.type === "FETCH_AI_MODELS") {
    (async () => {
      try {
        const result = await fetchProviderModels(request.apiKey || "", request.provider || "auto");
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }

  // Diagnostic Test Connection
  if (request?.type === "TEST_AI_CONNECTION") {
    (async () => {
      try {
        const apiKey = request.apiKey?.trim();
        const provider = request.provider || "auto";
        const model = request.model?.trim();
        const niche = request.niche || "24/7 Emergency Plumber";

        if (!apiKey) {
          sendResponse({ ok: false, error: "Please paste your AI API Key first." });
          return;
        }

        const prompt = `Write a sample listing for: ${niche}.
Return ONLY JSON: {"title": "Sample Title Under 50 chars", "description": "Sample 2-3 sentence description."}`;

        const result = await callAiApi({
          apiKey,
          provider,
          model,
          prompt,
          systemPrompt: "You are a professional Marketplace copywriter. Return valid JSON only."
        });

        sendResponse({
          ok: true,
          provider: result.provider,
          modelUsed: result.modelUsed,
          latencyMs: result.latencyMs,
          sample: {
            title: result.title,
            description: result.description,
            aiUsed: true
          }
        });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // 1-Click AI Write inside Autofill Tab
  if (request?.type === "AI_WRITE_LISTING") {
    (async () => {
      try {
        const { aiConfig } = await chrome.storage.local.get("aiConfig");
        if (!aiConfig?.apiKey) {
          sendResponse({
            ok: false,
            error: "No API Key configured. Open ⚡ AI & CONFIG tab to add your key."
          });
          return;
        }

        const niche = request.niche || aiConfig.serviceNiche || request.baseTitle || "Local Professional Service";
        const city = request.city || "Local Service Area";
        const baseTitle = request.baseTitle || "";
        const baseDesc = request.baseDescription || "";

        const result = await generateAiListingVariation({
          baseTitle,
          baseDescription: baseDesc,
          niche,
          city,
          tabIndex: 0
        });

        sendResponse({
          ok: true,
          title: result.title,
          description: result.description,
          modelUsed: result.modelUsed,
          latencyMs: result.latencyMs
        });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  // Active Tab Listing & Photo Scraper
  if (request?.type === "SCRAPE_ACTIVE_LISTING") {
    (async () => {
      try {
        const result = await scrapeActiveListingTab();
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }

  // STOP Automation
  if (request?.type === "STOP_MASTER_AUTOMATION") {
    stopAllExtensionWork().then((stopEpoch) => {
      sendResponse({ ok: true, status: "Stopped", stopEpoch });
    }).catch(() => sendResponse({ ok: true, status: "Stopped" }));
    return true;
  }

  // START Full Automation
  if (request?.type === "START_FULL_AUTOMATION") {
    if (isAutomationRunning) {
      sendResponse({ ok: false, error: "Automation is already running." });
      return true;
    }

    isAutomationRunning = true;
    startKeepAlive();
    const stopEpoch = startStopAwareWork();

    (async () => {
      try {
        const tabCount = Number(request.tabCount || 0);
        const inputLocations = Array.isArray(request.locations) ? request.locations : [];
        const steps = normalizeMasterSteps(request.steps);
        const customRun = !!request.customRun;

        if (!tabCount || tabCount <= 0) throw new Error("Tabs count invalid");
        if (steps.locations && inputLocations.length === 0) throw new Error("Locations list is empty");

        let createdTabIds = [];
        let editTabIds = [];

        if (steps.autofill) createdTabIds = await openAndAutofillListingTabs(tabCount, stopEpoch, inputLocations);
        if (steps.saveDraft) await saveDraftTabs(createdTabIds, stopEpoch);
        if (steps.draftOpener) editTabIds = await openDraftEditTabsFromSelling(tabCount, stopEpoch);
        if (steps.locations) editTabIds = await pasteLocationsIntoTabs(editTabIds, inputLocations, stopEpoch);
        if (steps.publish) await publishTabs(editTabIds, stopEpoch);

        isAutomationRunning = false;
        stopKeepAlive();
        sendResponse({ ok: true, status: customRun ? "Custom run completed!" : "All tasks completed!" });
      } catch (err) {
        isAutomationRunning = false;
        stopKeepAlive();
        reportErrorTelemetry("START_FULL_AUTOMATION", err);
        sendResponse({ ok: false, error: String(err.message || err) });
      }
    })();
    return true;
  }

  // Quick action tools
  const tabFilter = { url: "*://*.facebook.com/*" };
  switch (request.action) {
    case "autoPublishHandler":
      (async () => {
        const stopEpoch = startStopAwareWork();
        const tabs = await chrome.tabs.query(tabFilter);
        for (const t of tabs) {
          throwIfStopped(stopEpoch);
          if (t?.id) {
            await setTabStopEpoch(t.id, stopEpoch);
            await chrome.tabs.update(t.id, { active: true });
            await humanSleep(250, 500);
            await chrome.scripting.executeScript({ target: { tabId: t.id }, func: clickNextAndPublishFast });
            await humanSleep(350, 750);
          }
        }
      })().catch((e) => console.log("Auto Publish stopped/failed:", e?.message || e));
      break;

    case "draftOpenerHandler":
      chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
        if (tab?.id) {
          const stopEpoch = startStopAwareWork();
          await setTabStopEpoch(tab.id, stopEpoch);
          chrome.scripting.executeScript({ target: { tabId: tab.id }, func: openDrafts }).catch(() => {});
        }
      });
      break;

    case "OPEN_DRAFT_LINKS_BG":
      {
        const links = Array.isArray(request.links) ? request.links : [];
        const stopEpoch = startStopAwareWork();
        let i = 0;
        const openNext = () => {
          if (isStopRequested(stopEpoch) || i >= links.length) return;
          chrome.tabs.create({ url: links[i], active: false }, () => {
            if (isStopRequested(stopEpoch)) return;
            i++;
            setTimeout(openNext, 350);
          });
        };
        openNext();
      }
      break;

    case "openListingAndAutofillHandler":
      (async () => {
        try {
          const tabCount = Number(request.tabCount || 0);
          if (!tabCount || tabCount < 1) throw new Error("Tabs count invalid");
          const stopEpoch = startStopAwareWork();
          const listingUrl = "https://www.facebook.com/marketplace/create/item";
          const createdTabIds = [];

          for (let i = 0; i < tabCount; i++) {
            const tab = await chrome.tabs.create({ url: listingUrl, active: false });
            if (tab?.id) createdTabIds.push(tab.id);
            await humanSleep(180, 350);
          }

          let filled = 0;
          for (let i = 0; i < createdTabIds.length; i++) {
            const ok = await runAutofillOnTab(createdTabIds[i], stopEpoch, i);
            if (ok) filled++;
          }
          sendResponse({ ok: true, openedTabs: createdTabIds.length, filledTabs: filled });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || String(e) });
        }
      })();
      return true;

    case "saveDraftHandler":
      (async () => {
        try {
          const tabIds = await queryCreateListingTabs();
          if (!tabIds.length) throw new Error("No open Create Listing tabs found.");
          const stopEpoch = startStopAwareWork();
          let saved = 0;
          for (const tabId of tabIds) {
            throwIfStopped(stopEpoch);
            await setTabStopEpoch(tabId, stopEpoch);
            await activateTabAndWaitVisible(tabId, 2500, stopEpoch);
            const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: saveDraftFast });
            if (res?.result?.ok) saved++;
            await humanSleep(80, 200);
          }
          sendResponse({ ok: true, savedTabs: saved, totalTabs: tabIds.length });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || String(e) });
        }
      })();
      return true;

    case "saveLocationsFocusHandler":
      (async () => {
        try {
          const locations = Array.isArray(request.locations) ? request.locations : [];
          if (!locations.length) throw new Error("No locations provided.");
          await chrome.storage.local.set({ locations });
          const targetTabIds = await queryLocationReadyTabs();
          if (!targetTabIds.length) throw new Error("No open Marketplace edit listing tabs found.");

          const stopEpoch = startStopAwareWork();
          let pasted = 0;
          for (let i = 0; i < targetTabIds.length; i++) {
            const tabId = targetTabIds[i];
            throwIfStopped(stopEpoch);
            await setTabStopEpoch(tabId, stopEpoch);
            await activateTabAndWaitVisible(tabId, 2500, stopEpoch);
            try {
              await chrome.scripting.executeScript({ target: { tabId }, files: ["auto/content-locations.js"] });
            } catch(e) {}
            const locResult = await chrome.tabs.sendMessage(tabId, { action: "updateLocation", index: i, stopEpoch });
            if (locResult?.ok) pasted++;
            await humanSleep(100, 250);
          }
          sendResponse({ ok: true, pastedTabs: pasted });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || String(e) });
        }
      })();
      return true;

    case "markAsAvailableHandler":
    case "markAsSoldHandler":
    case "relistHandler":
    case "renewHandler":
    case "markInStockHandler":
    case "markOutOfStockHandler":
      chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
        if (!tab?.id) return;
        const stopEpoch = startStopAwareWork();
        await setTabStopEpoch(tab.id, stopEpoch);
        const map = {
          markAsAvailableHandler: { func: clickButtonsByTextWithDelay, args: ["Mark as available", 800] },
          markAsSoldHandler: { func: clickButtonsByTextNoDelay, args: ["Mark as sold"] },
          relistHandler: { func: relistItems },
          renewHandler: { func: renewItems },
          markInStockHandler: { func: markInStock },
          markOutOfStockHandler: { func: markOutOfStock }
        };
        const task = map[request.action];
        if (task) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: task.func,
            args: task.args || []
          }).catch(() => {});
        }
      });
      break;
  }
});

// Injected fast page helpers
async function saveDraftFast() {
  const ownStopEpoch = Number(window.__MP_EXT_STOP_EPOCH__ || 0);
  const stopped = () => Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== ownStopEpoch;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isVisible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const isDisabled = (el) => !!el && (el.getAttribute?.("aria-disabled") === "true" || el.disabled === true);

  const findSaveBtn = () => {
    const direct = document.querySelector('div[role="button"][aria-label="Save Draft"]') || document.querySelector('div[role="button"][aria-label="Save draft"]');
    if (direct && isVisible(direct)) return direct;
    return Array.from(document.querySelectorAll('[role="button"], button, a')).find((el) => {
      const t = norm(el.innerText || el.textContent || el.getAttribute('aria-label'));
      return isVisible(el) && (t === "save draft" || t.includes("save draft"));
    });
  };

  const hasSavedUi = () => {
    const body = norm(document.body?.innerText || "");
    return body.includes("draft saved") || body.includes("saved as draft") || body.includes("listing saved as draft");
  };

  let btn = null;
  for (let i = 0; i < 40; i++) {
    if (stopped()) return { ok: false, error: "Stopped by user" };
    btn = findSaveBtn();
    if (btn && !isDisabled(btn)) break;
    await sleep(100);
  }
  if (!btn || isDisabled(btn)) return { ok: false, error: "Save Draft button not found or disabled" };

  const startUrl = location.href;
  btn.scrollIntoView({ block: 'center', inline: 'center' });
  btn.click();

  for (let i = 0; i < 40; i++) {
    if (stopped()) return { ok: false, error: "Stopped" };
    await sleep(100);
    const current = findSaveBtn();
    if (location.href !== startUrl || !current || hasSavedUi()) return { ok: true, saved: true };
    if (isDisabled(current) && i >= 2) return { ok: true, saved: true };
  }
  return { ok: true, saved: "assumed_saved" };
}

function clickNextAndPublishFast() {
  const ownStopEpoch = Number(window.__MP_EXT_STOP_EPOCH__ || 0);
  const stopped = () => Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== ownStopEpoch;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isVisible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const findBtn = (label) => {
    const wanted = label.toLowerCase();
    return Array.from(document.querySelectorAll('[role="button"], button, a, span'))
      .map((el) => el.closest('[role="button"], button, a') || el)
      .filter((el, idx, arr) => el && arr.indexOf(el) === idx && isVisible(el))
      .find((el) => ((el.innerText || el.textContent || '').trim().toLowerCase() === wanted) ||
                    ((el.getAttribute('aria-label') || '').trim().toLowerCase() === wanted));
  };
  const strongClick = (el) => {
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return true;
  };
  (async () => {
    if (stopped()) return;
    const next = findBtn('Next');
    if (next) {
      strongClick(next);
      for (let i = 0; i < 20; i++) {
        if (stopped()) return;
        await sleep(120);
        const publish = findBtn('Publish');
        if (publish) { strongClick(publish); return; }
      }
    }
    if (stopped()) return;
    const publish = findBtn('Publish');
    if (publish) strongClick(publish);
  })();
}

function openDrafts() {
  const elements = Array.from(document.querySelectorAll("span, div, a"));
  const buttons = elements.filter(el => {
    const text = (el.textContent || "").trim().toLowerCase();
    return text === "continue" || text === "continue listing" || text.includes("continue draft");
  });
  const links = [...new Set(buttons.map((btn) => btn.closest("a")?.href).filter(Boolean))];
  chrome.runtime.sendMessage({ action: "OPEN_DRAFT_LINKS_BG", links });
}

function clickButtonsByTextWithDelay(text, delayMs = 800) {
  const spans = Array.from(document.querySelectorAll("span")).filter(el => (el.textContent || "").trim() === text);
  let delay = 0;
  spans.forEach((span) => {
    const clickable = span.closest('[role="button"]') || span.closest("button") || span;
    setTimeout(() => { clickable?.click(); }, delay);
    delay += delayMs;
  });
}

function clickButtonsByTextNoDelay(text) {
  document.querySelectorAll("span").forEach((span) => {
    if ((span.textContent || "").trim() === text) {
      const clickable = span.closest('[role="button"]') || span.closest("button") || span;
      if (clickable) clickable.click();
    }
  });
}

function relistItems() {
  document.querySelectorAll("span").forEach((el) => {
    if ((el.textContent || "").trim() === "Relist this item") {
      const parent = el.closest('[role="none"]');
      if (parent && parent.offsetParent !== null) parent.click();
    }
  });
}

function renewItems() {
  document.querySelectorAll("span").forEach((btn) => {
    if ((btn.textContent || "").trim() === "Renew") btn.click();
  });
}

function markInStock() {
  const buttons = Array.from(document.querySelectorAll('[role="button"]')).filter((btn) =>
    (btn.innerText || "").toLowerCase().includes("mark as in stock")
  );
  let index = 0;
  function clickNext() {
    if (index >= buttons.length) return;
    buttons[index].click();
    index++;
    setTimeout(clickNext, 800);
  }
  if (buttons.length > 0) clickNext();
}

function markOutOfStock() {
  document.querySelectorAll('[role="button"]').forEach((btn) => {
    if ((btn.innerText || "").toLowerCase().includes("mark out of stock")) btn.click();
  });
}
