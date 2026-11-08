// ============================================================================
// 🛡️ LEADFLOW AI - ENTERPRISE BACKGROUND ENGINE v2.0
// Anti-Detect Human Timing | MV3 Keep-Alive | Universal AI Key Router
// ============================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const humanSleep = (minMs = 450, maxMs = 1150) => sleep(randInt(minMs, maxMs));

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
  console.log("✅ LeadFlow AI v2.0 Engine Installed & Ready.");
  chrome.storage.local.get(["aiConfig", "humanMode"], (res) => {
    if (!res.aiConfig) {
      chrome.storage.local.set({
        aiConfig: {
          enabled: false,
          apiKey: "",
          provider: "auto",
          model: "",
          serviceNiche: "",
          uniquePerTab: true
        },
        humanMode: "safe"
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

function detectAiProvider(apiKey = "") {
  const key = apiKey.trim();
  if (!key) return { provider: "none", defaultModel: "" };
  if (key.startsWith("AIza")) return { provider: "gemini", name: "Google Gemini", defaultModel: "gemini-2.5-flash" };
  if (key.startsWith("gsk_")) return { provider: "groq", name: "Groq Cloud", defaultModel: "llama-3.3-70b-versatile" };
  if (key.startsWith("sk-or-")) return { provider: "openrouter", name: "OpenRouter", defaultModel: "openai/gpt-4o-mini" };
  if (key.startsWith("nvapi-")) return { provider: "nvidia", name: "NVIDIA NIM", defaultModel: "meta/llama-3.1-70b-instruct" };
  if (key.startsWith("sk-")) return { provider: "openai", name: "OpenAI", defaultModel: "gpt-4o-mini" };
  return { provider: "openrouter", name: "Custom / OpenRouter", defaultModel: "openai/gpt-4o-mini" };
}

async function generateAiListingVariation({ baseTitle, baseDescription, niche, city, tabIndex }) {
  const { aiConfig } = await chrome.storage.local.get("aiConfig");
  if (!aiConfig?.enabled || !aiConfig?.apiKey) {
    return { title: baseTitle, description: baseDescription, aiUsed: false };
  }

  const detected = detectAiProvider(aiConfig.apiKey);
  const provider = (aiConfig.provider && aiConfig.provider !== "auto") ? aiConfig.provider : detected.provider;
  const model = aiConfig.model?.trim() || detected.defaultModel;
  const apiKey = aiConfig.apiKey.trim();

  const prompt = `You are an expert US local home-services copywriter for Facebook Marketplace.
Create a unique, natural, high-converting listing Title and Description so Facebook's duplicate detector sees it as 100% original.
Service/Niche: ${niche || baseTitle || "Home Repair Service"}
Target City: ${city || "Local Area"}
Base Title Reference: ${baseTitle || ""}
Base Description Reference: ${baseDescription || ""}
Variation Seed: #${tabIndex + 1}-${randInt(100, 999)}

Rules:
1. Title must be under 65 characters, natural, local-sounding, no spammy ALL CAPS.
2. Description must be 3 to 5 short, friendly sentences encouraging the customer to message now for a fast quote/call.
3. Return ONLY valid JSON in this exact format: {"title": "...", "description": "..."}`;

  try {
    let rawText = "";
    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.85 }
        })
      });
      const data = await res.json();
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      const endpoints = {
        openai: "https://api.openai.com/v1/chat/completions",
        groq: "https://api.groq.com/openai/v1/chat/completions",
        openrouter: "https://openrouter.ai/api/v1/chat/completions",
        nvidia: "https://integrate.api.nvidia.com/v1/chat/completions"
      };
      const endpoint = endpoints[provider] || endpoints.openrouter;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.85
        })
      });
      const data = await res.json();
      rawText = data?.choices?.[0]?.message?.content || "";
    }

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.description) {
        return {
          title: String(parsed.title).trim(),
          description: String(parsed.description).trim(),
          aiUsed: true
        };
      }
    }
  } catch (err) {
    reportErrorTelemetry("generateAiListingVariation", err);
  }

  return { title: baseTitle, description: baseDescription, aiUsed: false };
}

async function getTimingProfile() {
  const { humanMode } = await chrome.storage.local.get("humanMode");
  if (humanMode === "turbo") return { tabOpenMin: 180, tabOpenMax: 320, stepMin: 250, stepMax: 500 };
  if (humanMode === "balanced") return { tabOpenMin: 450, tabOpenMax: 900, stepMin: 500, stepMax: 1100 };
  return { tabOpenMin: 850, tabOpenMax: 1650, stepMin: 900, stepMax: 1800 };
}

function waitTabComplete(tabId, timeoutMs = 25000, stopEpoch = null) {
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
    }, 250);
  });
}

let activeOpenListingAutofillJob = null;
let openListingAutofillJobSequence = 0;

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

function cancelOpenListingAutofillJob(job, reason = "Cancelled") {
  if (!job) return;
  job.cancelled = true;
  job.cancelReason = reason;
  job.running = false;
  if (activeOpenListingAutofillJob === job) activeOpenListingAutofillJob = null;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  const job = activeOpenListingAutofillJob;
  if (!job || !job.running || !job.tabIds.includes(tabId)) return;
  job.closedTabIds.add(tabId);
  if (job.tabIds.length && job.tabIds.every((id) => job.closedTabIds.has(id))) {
    cancelOpenListingAutofillJob(job, "All Open Listing tabs were closed.");
  }
});

async function activateTabAndWaitVisible(tabId, timeoutMs = 9000, stopEpoch = null) {
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
    await sleep(150);
  }
  return false;
}

function waitAutofillDone(tabId, timeoutMs = 14000, stopEpoch = null) {
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
    }, 100);
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

  for (let i = 0; i < 25; i++) {
    if (stopEpoch !== null && isStopRequested(stopEpoch)) return false;
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.readyState !== "loading" && document.visibilityState === "visible"
      });
      if (res?.result === true) return true;
    } catch (e) {}
    await sleep(200);
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
    await activateTabAndWaitVisible(tabId, 10000, stopEpoch);
    throwIfStopped(stopEpoch);
    await Promise.race([waitTabComplete(tabId, 9000, stopEpoch), sleep(1800)]);
    throwIfStopped(stopEpoch);
    await ensureAutofillContentReady(tabId, stopEpoch);
    throwIfStopped(stopEpoch);
    await humanSleep(500, 950);
    throwIfStopped(stopEpoch);

    const doneWait = waitAutofillDone(tabId, attempt === 1 ? 10000 : 7500, stopEpoch);
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
const MASTER_STEP_LABELS = {
  autofill: "Autofill",
  saveDraft: "Save Draft",
  draftOpener: "Draft Opener",
  locations: "Locations",
  publish: "Publish"
};

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
    url: [
      "*://www.facebook.com/marketplace/*",
      "*://facebook.com/marketplace/*",
      "*://web.facebook.com/marketplace/*",
      "*://m.facebook.com/marketplace/*"
    ]
  });
  const eligible = (tabs || []).filter((t) => {
    const url = (t.url || "").toLowerCase();
    if (!url.includes("/marketplace/")) return false;
    if (url.includes("/marketplace/you/") || url.includes("/marketplace/search") || url.includes("/marketplace/browse")) return false;
    return url.includes("/marketplace/create/item") || url.includes("/marketplace/item/") || (url.includes("/marketplace/edit/") && url.includes("listing_id="));
  });
  return uniqueSortedTabIds(eligible);
}

async function queryOpenDraftEditTabs() {
  const tabs = await chrome.tabs.query({
    url: [
      "*://www.facebook.com/marketplace/*",
      "*://facebook.com/marketplace/*",
      "*://web.facebook.com/marketplace/*",
      "*://m.facebook.com/marketplace/*"
    ]
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

  await humanSleep(700, 1200);
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
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);

    try {
      if (stopEpoch !== null) await setTabStopEpoch(tabId, stopEpoch);
      await activateTabAndWaitVisible(tabId, 9000, stopEpoch);
      await Promise.race([waitTabComplete(tabId, 9000, stopEpoch), sleep(650)]);
      await humanSleep(600, 1100);

      const [saveResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: saveDraftFast
      });
      const result = saveResult?.result || {};
      if (result.ok) return { ok: true, result };
    } catch (error) {
      if (stopEpoch !== null && isStopRequested(stopEpoch)) throw error;
    }
    await humanSleep(800, 1300);
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
    await humanSleep(350, 750);
  }

  await humanSleep(500, 900);
  for (const tabId of savedTabIds) {
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    try { await chrome.tabs.remove(tabId); } catch (e) {}
  }
  return { savedTabIds };
}

async function openDraftEditTabsFromSelling(tabCount, stopEpoch = null) {
  if (stopEpoch !== null) throwIfStopped(stopEpoch);
  const timing = await getTimingProfile();
  const managerTab = await chrome.tabs.create({ url: "https://www.facebook.com/marketplace/you/selling", active: true });

  if (stopEpoch !== null) await setTabStopEpoch(managerTab.id, stopEpoch);
  await waitTabComplete(managerTab.id, 15000, stopEpoch);
  await humanSleep(500, 900);

  await chrome.scripting.executeScript({
    target: { tabId: managerTab.id },
    args: [tabCount, stopEpoch],
    func: async (expectedCount, expectedStopEpoch) => {
      const ownStopEpoch = Number(expectedStopEpoch ?? window.__MP_EXT_STOP_EPOCH__ ?? 0);
      const stopped = () => Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== ownStopEpoch;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      const getScrollEl = () => {
        const candidates = [
          document.scrollingElement,
          document.documentElement,
          document.body,
          ...Array.from(document.querySelectorAll('div[role="main"], div[style*="overflow"], div'))
        ].filter(Boolean);
        return candidates.find((el) => {
          try { return el.scrollHeight > el.clientHeight + 200; } catch (e) { return false; }
        }) || document.scrollingElement || document.documentElement || document.body;
      };

      const getDraftLinks = () => {
        const elements = Array.from(document.querySelectorAll("span, div, a, button"));
        return [...new Set(elements
          .filter((el) => {
            const text = (el.textContent || "").trim().toLowerCase();
            return text === "continue" || text === "continue listing" || text.includes("continue draft");
          })
          .map((btn) => btn.closest("a")?.href)
          .filter(Boolean))];
      };

      let stableRounds = 0;
      let lastLinkCount = -1;
      const started = Date.now();
      const hardLimitMs = Math.max(45000, (Number(expectedCount) || 0) * 1800);

      for (let pass = 0; pass < 75 && Date.now() - started < hardLimitMs; pass++) {
        if (stopped()) return;
        const sc = getScrollEl();
        try { sc.scrollBy(0, Math.max(1100, window.innerHeight * 1.8)); } catch (e) {}
        window.scrollBy(0, Math.max(1100, window.innerHeight * 1.8));
        await sleep(850);

        const count = getDraftLinks().length;
        if (Number(expectedCount) > 0 && count >= Number(expectedCount)) {
          stableRounds++;
          if (stableRounds >= 2) break;
        } else if (count === lastLinkCount) {
          stableRounds++;
          if (stableRounds >= 6) break;
        } else {
          stableRounds = 0;
        }
        lastLinkCount = count;
      }
    }
  });

  await humanSleep(400, 750);
  const targetedDrafts = await new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId: managerTab.id },
      func: () => {
        const elements = Array.from(document.querySelectorAll("span, div, a"));
        const buttons = elements.filter((el) => {
          const text = (el.textContent || "").trim().toLowerCase();
          return text === "continue" || text === "continue listing" || text.includes("continue draft");
        });
        return [...new Set(buttons.map((btn) => btn.closest("a")?.href).filter(Boolean))];
      }
    }, (results) => resolve(results?.[0]?.result || []));
  });

  const editTabIds = [];
  for (const url of targetedDrafts.slice(0, tabCount || targetedDrafts.length)) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    const t = await chrome.tabs.create({ url, active: false });
    if (t?.id) editTabIds.push(t.id);
    await humanSleep(timing.tabOpenMin, timing.tabOpenMax);
  }

  try { await chrome.tabs.remove(managerTab.id); } catch (e) {}
  return editTabIds;
}

async function pasteLocationsIntoTabs(editTabIds = [], inputLocations = [], stopEpoch = null) {
  if (!inputLocations.length) throw new Error("No locations found for Locations step.");
  let targetTabIds = Array.isArray(editTabIds) && editTabIds.length ? editTabIds : await queryOpenDraftEditTabs();
  if (!targetTabIds.length) throw new Error("No opened draft/edit tabs found for Locations step.");

  await chrome.storage.local.set({ locations: inputLocations });

  for (let i = 0; i < targetTabIds.length; i++) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    const tabId = targetTabIds[i];
    try {
      if (stopEpoch !== null) await setTabStopEpoch(tabId, stopEpoch);
      await activateTabAndWaitVisible(tabId, 10000, stopEpoch);
      await waitTabComplete(tabId, 25000, stopEpoch);
      await humanSleep(400, 800);

      try { await chrome.scripting.executeScript({ target: { tabId }, files: ["auto/content-locations.js"] }); } catch (e) {}

      let locResult = await chrome.tabs.sendMessage(tabId, { action: "updateLocation", index: i, stopEpoch });
      if (!locResult?.ok) {
        await humanSleep(500, 900);
        locResult = await chrome.tabs.sendMessage(tabId, { action: "updateLocation", index: i, stopEpoch });
      }
      await humanSleep(650, 1250);
    } catch (e) {}
  }
  return targetTabIds;
}

async function publishTabs(editTabIds = [], stopEpoch = null) {
  let targetTabIds = Array.isArray(editTabIds) && editTabIds.length ? editTabIds : await queryOpenDraftEditTabs();
  if (!targetTabIds.length) throw new Error("No opened draft/edit tabs found for Publish step.");

  for (const tabId of targetTabIds) {
    if (!isAutomationRunning) throw new Error("Stopped by user");
    if (stopEpoch !== null) throwIfStopped(stopEpoch);
    try {
      if (stopEpoch !== null) await setTabStopEpoch(tabId, stopEpoch);
      await activateTabAndWaitVisible(tabId, 8000, stopEpoch);
      await waitTabComplete(tabId, 20000, stopEpoch);
      await humanSleep(450, 950);
      await chrome.scripting.executeScript({ target: { tabId }, func: clickNextAndPublishFast });
      await humanSleep(750, 1450);
    } catch (e) {}
  }
  return targetTabIds.length;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === "DETECT_AI_KEY") {
    sendResponse({ ok: true, ...detectAiProvider(request.apiKey || "") });
    return true;
  }

  if (request?.type === "TEST_AI_CONNECTION") {
    (async () => {
      try {
        const sample = await generateAiListingVariation({
          baseTitle: "24/7 Local Emergency Plumber",
          baseDescription: "Fast & affordable plumbing repair in your area. Message us now!",
          niche: request.niche || "Plumbing & Drain Cleaning",
          city: "Dallas, TX",
          tabIndex: 0
        });
        sendResponse({ ok: true, sample });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }

  if (request?.type === "STOP_MASTER_AUTOMATION") {
    stopAllExtensionWork().then((stopEpoch) => {
      sendResponse({ ok: true, status: "Stopped", stopEpoch });
    }).catch(() => sendResponse({ ok: true, status: "Stopped" }));
    return true;
  }

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
            await humanSleep(400, 800);
            await chrome.scripting.executeScript({ target: { tabId: t.id }, func: clickNextAndPublishFast });
            await humanSleep(650, 1200);
          }
        }
      })().catch((e) => {});
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

    case "OPEN_DRAFT_LINKS_BG": {
      const links = Array.isArray(request.links) ? request.links : [];
      const stopEpoch = startStopAwareWork();
      let i = 0;
      const openNext = () => {
        if (isStopRequested(stopEpoch) || i >= links.length) return;
        chrome.tabs.create({ url: links[i], active: false }, () => {
          if (isStopRequested(stopEpoch)) return;
          i++;
          setTimeout(openNext, randInt(550, 1100));
        });
      };
      openNext();
      break;
    }

    case "saveDraftHandler":
      (async () => {
        try {
          const tabIds = await queryCreateListingTabs();
          if (!tabIds.length) {
            sendResponse({ ok: false, error: "No open Create Listing tabs found." });
            return;
          }
          const stopEpoch = startStopAwareWork();
          let savedTabs = 0;
          for (const tabId of tabIds) {
            throwIfStopped(stopEpoch);
            await setTabStopEpoch(tabId, stopEpoch);
            await activateTabAndWaitVisible(tabId, 3500, stopEpoch);
            await humanSleep(450, 850);
            const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: saveDraftFast });
            if (result?.result?.ok) savedTabs += 1;
            await humanSleep(350, 700);
          }
          sendResponse({ ok: true, savedTabs, totalTabs: tabIds.length });
        } catch (error) {
          sendResponse({ ok: false, error: String(error?.message || error) });
        }
      })();
      return true;

    case "saveLocationsFocusHandler":
      (async () => {
        try {
          const locations = Array.isArray(request.locations) ? request.locations : [];
          if (!locations.length) {
            sendResponse({ ok: false, error: "No locations found" });
            return;
          }
          await chrome.storage.local.set({ locations });
          const targetTabIds = await queryLocationReadyTabs();
          if (!targetTabIds.length) {
            sendResponse({ ok: false, error: "No open Marketplace edit listing tabs found." });
            return;
          }

          const stopEpoch = startStopAwareWork();
          let pastedTabs = 0;
          for (let i = 0; i < targetTabIds.length; i++) {
            const tabId = targetTabIds[i];
            throwIfStopped(stopEpoch);
            await setTabStopEpoch(tabId, stopEpoch);
            await activateTabAndWaitVisible(tabId, 3500, stopEpoch);
            await humanSleep(350, 700);

            try {
              await chrome.scripting.executeScript({ target: { tabId }, files: ["auto/content-locations.js"] });
            } catch (e) {}

            let locResult = await chrome.tabs.sendMessage(tabId, { action: "updateLocation", index: i, stopEpoch });
            if (!locResult?.ok) {
              await humanSleep(400, 750);
              locResult = await chrome.tabs.sendMessage(tabId, { action: "updateLocation", index: i, stopEpoch });
            }
            if (locResult?.ok) pastedTabs += 1;
            await humanSleep(450, 900);
          }
          sendResponse({ ok: true, pastedTabs });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
      })();
      return true;
  }
});

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
      const t = norm(el.innerText || el.textContent || el.getAttribute("aria-label"));
      return isVisible(el) && (t === "save draft" || t.includes("save draft"));
    });
  };

  let btn = null;
  for (let i = 0; i < 90; i++) {
    if (stopped()) return { ok: false, error: "Stopped by user" };
    btn = findSaveBtn();
    if (btn && !isDisabled(btn)) break;
    await sleep(160);
  }
  if (!btn || isDisabled(btn)) return { ok: false, error: "Save Draft button not enabled" };

  const startUrl = location.href;
  btn.scrollIntoView({ block: "center", inline: "center" });
  await sleep(120);
  btn.click();

  for (let i = 0; i < 90; i++) {
    if (stopped()) return { ok: false, error: "Stopped by user" };
    await sleep(160);
    const current = findSaveBtn();
    const body = norm(document.body?.innerText || "");
    if (location.href !== startUrl) return { ok: true, saved: "url_changed" };
    if (!current) return { ok: true, saved: "button_gone" };
    if (body.includes("draft saved") || body.includes("saved as draft")) return { ok: true, saved: "saved_text" };
  }
  return { ok: false, error: "Save Draft click was not confirmed" };
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
      .find((el) => ((el.innerText || el.textContent || "").trim().toLowerCase() === wanted) ||
                    ((el.getAttribute("aria-label") || "").trim().toLowerCase() === wanted));
  };
  const strongClick = (el) => {
    if (!el) return false;
    el.scrollIntoView({ block: "center", inline: "center" });
    el.click();
    return true;
  };
  (async () => {
    if (stopped()) return;
    const next = findBtn("Next");
    if (next) {
      strongClick(next);
      for (let i = 0; i < 28; i++) {
        if (stopped()) return;
        await sleep(220);
        const publish = findBtn("Publish");
        if (publish) {
          await sleep(180);
          strongClick(publish);
          return;
        }
      }
    }
    if (stopped()) return;
    const publish = findBtn("Publish");
    if (publish) strongClick(publish);
  })();
}

function openDrafts() {
  const elements = Array.from(document.querySelectorAll("span, div, a"));
  const buttons = elements.filter((el) => {
    const text = (el.textContent || "").trim().toLowerCase();
    return text === "continue" || text === "continue listing" || text.includes("continue draft");
  });
  const links = [...new Set(buttons.map((btn) => btn.closest("a")?.href).filter(Boolean))];
  chrome.runtime.sendMessage({ action: "OPEN_DRAFT_LINKS_BG", links });
}