const TOOL_IDS = ["af", "mm", "automation", "ai"];

function getEls() {
  return {
    buttons: Array.from(document.querySelectorAll(".tool-choice")),
    wrappers: {
      af: document.getElementById("wrapper-af"),
      mm: document.getElementById("wrapper-mm"),
      automation: document.getElementById("wrapper-automation"),
      ai: document.getElementById("wrapper-ai")
    },
    frames: {
      af: document.getElementById("afFrame"),
      mm: document.getElementById("mmFrame"),
      automation: document.getElementById("automationFrame")
    }
  };
}

function loadFrame(frame) {
  if (frame && frame.dataset.src && frame.getAttribute("src") !== frame.dataset.src) {
    frame.setAttribute("src", frame.dataset.src);
  }
}

function getActiveTool() {
  const active = document.querySelector(".tool-choice.active");
  return TOOL_IDS.includes(active?.dataset.tool) ? active.dataset.tool : "af";
}

function getSharedFrameContentHeight(frame) {
  try {
    if (!frame?.contentDocument || !frame.contentWindow) return 410;
    const doc = frame.contentDocument;
    const content = doc.querySelector(".panel") || doc.querySelector(".glass-card") || doc.querySelector(".app-shell");
    if (!content) return 410;
    const rect = content.getBoundingClientRect();
    return Math.ceil(rect.height + 14) || 410;
  } catch (e) {
    return 410;
  }
}

function resizePopupToActiveFrame() {
  const activeTool = getActiveTool();
  if (activeTool === "ai") {
    document.documentElement.style.setProperty("--frame-h", "475px");
    return;
  }
  const { frames } = getEls();
  const frame = frames[activeTool];
  const height = Math.max(260, Math.min(580, getSharedFrameContentHeight(frame) + 6));
  document.documentElement.style.setProperty("--frame-h", `${height}px`);
}

function schedulePopupResize() {
  resizePopupToActiveFrame();
  requestAnimationFrame(resizePopupToActiveFrame);
  setTimeout(resizePopupToActiveFrame, 80);
}

function setTool(tool) {
  const selectedTool = TOOL_IDS.includes(tool) ? tool : "af";
  const { buttons, wrappers, frames } = getEls();

  buttons.forEach((btn) => {
    const active = btn.dataset.tool === selectedTool;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  TOOL_IDS.forEach((id) => {
    wrappers[id]?.classList.toggle("hidden", id !== selectedTool);
  });

  if (frames[selectedTool]) loadFrame(frames[selectedTool]);
  chrome.storage.local.set({ __mainToolMode: selectedTool });
  schedulePopupResize();
}

// ============================================================================
// 🧠 AI & CONFIG SETTINGS PANEL CONTROLLER
// ============================================================================
function initAiSettingsPanel() {
  const apiKeyEl = document.getElementById("aiApiKey");
  const toggleKeyBtn = document.getElementById("toggleKeyVisibility");
  const providerEl = document.getElementById("aiProvider");
  const modelSelectEl = document.getElementById("aiModelSelect");
  const customModelEl = document.getElementById("aiModel");
  const fetchModelsBtn = document.getElementById("fetchModelsBtn");
  const nicheEl = document.getElementById("aiServiceNiche");
  const toneEl = document.getElementById("aiTone");
  const emojisEl = document.getElementById("aiEmojis");
  const uniqueEl = document.getElementById("aiUniquePerTab");
  const enabledEl = document.getElementById("aiEnabled");
  const badgeEl = document.getElementById("aiDetectedBadge");
  const humanModeEl = document.getElementById("humanModeSelect");
  const webhookEl = document.getElementById("telemetryWebhookUrl");
  const saveBtn = document.getElementById("saveAiConfigBtn");
  const testBtn = document.getElementById("testAiBtn");
  const statusEl = document.getElementById("aiStatusMsg");
  const diagnosticBox = document.getElementById("aiDiagnosticBox");
  const diagnosticTitle = document.getElementById("diagnosticTitle");
  const diagnosticLatency = document.getElementById("diagnosticLatency");
  const diagnosticPreview = document.getElementById("diagnosticPreview");
  const nicheChips = document.querySelectorAll(".niche-chip");

  let currentFetchedModels = [];

  // Toggle Password Visibility
  toggleKeyBtn?.addEventListener("click", () => {
    if (!apiKeyEl) return;
    const isPass = apiKeyEl.type === "password";
    apiKeyEl.type = isPass ? "text" : "password";
    toggleKeyBtn.textContent = isPass ? "🔒" : "👁️";
  });

  // Niche quick-pick chips
  nicheChips.forEach(chip => {
    chip.addEventListener("click", () => {
      if (nicheEl) {
        nicheEl.value = chip.dataset.niche || "";
        nicheChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      }
    });
  });

  // Populate Model Dropdown
  function populateModelDropdown(models = [], bestModel = "", currentModel = "") {
    if (!modelSelectEl) return;
    modelSelectEl.innerHTML = "";

    const autoOpt = document.createElement("option");
    autoOpt.value = "auto";
    autoOpt.textContent = bestModel ? `✨ Auto: ${bestModel}` : "✨ Auto-Detect Best";
    modelSelectEl.appendChild(autoOpt);

    const uniqueList = [...new Set(models)].filter(Boolean);
    uniqueList.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m === bestModel ? `⭐ ${m} (Recommended)` : m;
      modelSelectEl.appendChild(opt);
    });

    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "✏️ Custom Model ID...";
    modelSelectEl.appendChild(customOpt);

    if (currentModel && uniqueList.includes(currentModel)) {
      modelSelectEl.value = currentModel;
    } else if (currentModel) {
      modelSelectEl.value = "custom";
      if (customModelEl) {
        customModelEl.classList.remove("hidden");
        customModelEl.value = currentModel;
      }
    } else {
      modelSelectEl.value = "auto";
    }
  }

  modelSelectEl?.addEventListener("change", () => {
    if (modelSelectEl.value === "custom") {
      customModelEl?.classList.remove("hidden");
      customModelEl?.focus();
    } else {
      customModelEl?.classList.add("hidden");
      if (customModelEl) customModelEl.value = "";
    }
  });

  // Fetch Live Models from Provider
  function fetchLiveModels(key, provider, currentModel = "") {
    if (!key) {
      populateModelDropdown([], "", currentModel);
      return;
    }

    chrome.runtime.sendMessage({
      type: "FETCH_AI_MODELS",
      apiKey: key,
      provider: provider || "auto"
    }, (res) => {
      if (res?.ok && Array.isArray(res.models)) {
        currentFetchedModels = res.models;
        populateModelDropdown(res.models, res.bestModel, currentModel);
        if (badgeEl) {
          badgeEl.className = "ai-badge success";
          badgeEl.textContent = `${res.icon || "✨"} ${res.providerName || "AI"} (${res.bestModel})`;
        }
      } else if (res?.fallbackModels) {
        currentFetchedModels = res.fallbackModels;
        populateModelDropdown(res.fallbackModels, res.bestModel, currentModel);
      }
    });
  }

  fetchModelsBtn?.addEventListener("click", () => {
    fetchLiveModels(apiKeyEl?.value?.trim() || "", providerEl?.value || "auto", getSelectedModel());
  });

  function getSelectedModel() {
    if (modelSelectEl?.value === "custom") {
      return customModelEl?.value?.trim() || "";
    }
    if (modelSelectEl?.value && modelSelectEl.value !== "auto") {
      return modelSelectEl.value;
    }
    return "";
  }

  // Key Auto-Detection on Keystroke / Paste
  function handleKeyChange() {
    const key = apiKeyEl?.value?.trim() || "";
    const prov = providerEl?.value || "auto";

    chrome.runtime.sendMessage({
      type: "DETECT_AI_KEY",
      apiKey: key,
      forcedProvider: prov
    }, (res) => {
      if (!badgeEl) return;
      if (!key || !res?.provider || res.provider === "none") {
        badgeEl.className = "ai-badge";
        badgeEl.textContent = "No Key";
        return;
      }

      badgeEl.className = "ai-badge active";
      badgeEl.textContent = `${res.icon} ${res.name}`;

      // Auto-set provider dropdown if user hasn't locked it to a specific provider
      if (providerEl && providerEl.value === "auto" && res.provider !== "auto") {
        // keep provider dropdown on auto or update
      }

      fetchLiveModels(key, prov, getSelectedModel());
    });
  }

  let debounceTimer = null;
  apiKeyEl?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleKeyChange, 280);
  });

  providerEl?.addEventListener("change", () => {
    handleKeyChange();
  });

  // Load Saved Configuration
  chrome.storage.local.get(["aiConfig", "humanMode", "telemetryWebhookUrl"], (data) => {
    const cfg = data.aiConfig || {};
    if (apiKeyEl) apiKeyEl.value = cfg.apiKey || "";
    if (providerEl) providerEl.value = cfg.provider || "auto";
    if (nicheEl) nicheEl.value = cfg.serviceNiche || "Emergency Plumber";
    if (toneEl) toneEl.value = cfg.tone || "urgent";
    if (emojisEl) emojisEl.checked = cfg.emojis !== false;
    if (uniqueEl) uniqueEl.checked = cfg.uniquePerTab !== false;
    if (enabledEl) enabledEl.checked = !!cfg.enabled;
    if (humanModeEl) humanModeEl.value = data.humanMode || "balanced";
    if (webhookEl) webhookEl.value = data.telemetryWebhookUrl || "";

    if (cfg.apiKey) {
      handleKeyChange();
    }
  });

  // Save Settings
  function saveConfig(cb) {
    const model = getSelectedModel();
    const aiConfig = {
      apiKey: apiKeyEl?.value.trim() || "",
      provider: providerEl?.value || "auto",
      model,
      serviceNiche: nicheEl?.value.trim() || "Emergency Plumber",
      tone: toneEl?.value || "urgent",
      emojis: !!emojisEl?.checked,
      uniquePerTab: !!uniqueEl?.checked,
      enabled: !!enabledEl?.checked
    };

    chrome.storage.local.set({
      aiConfig,
      humanMode: humanModeEl?.value || "balanced",
      telemetryWebhookUrl: webhookEl?.value.trim() || ""
    }, () => {
      if (statusEl) {
        statusEl.style.color = "#34d399";
        statusEl.textContent = "✅ Settings saved successfully!";
        setTimeout(() => { if (statusEl.textContent.includes("saved")) statusEl.textContent = ""; }, 2500);
      }
      if (cb) cb();
    });
  }

  saveBtn?.addEventListener("click", () => saveConfig());

  // 🧪 Diagnostic Test AI Key Connection
  testBtn?.addEventListener("click", () => {
    const apiKey = apiKeyEl?.value.trim() || "";
    if (!apiKey) {
      if (statusEl) {
        statusEl.style.color = "#f87171";
        statusEl.textContent = "❌ Please paste your API Key first.";
      }
      return;
    }

    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = "⏳ Testing...";
    }
    if (statusEl) {
      statusEl.style.color = "#38bdf8";
      statusEl.textContent = "📡 Connecting to AI Provider...";
    }
    if (diagnosticBox) diagnosticBox.classList.add("hidden");

    const provider = providerEl?.value || "auto";
    const model = getSelectedModel();
    const niche = nicheEl?.value.trim() || "24/7 Emergency Plumber";

    chrome.runtime.sendMessage({
      type: "TEST_AI_CONNECTION",
      apiKey,
      provider,
      model,
      niche
    }, (res) => {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = "🧪 Test Connection";
      }

      if (!statusEl) return;

      if (res?.ok && res.sample) {
        statusEl.style.color = "#34d399";
        statusEl.textContent = `✅ Success! Latency: ${res.latencyMs || 0}ms • Model: ${res.modelUsed}`;

        // Show Diagnostic Box
        if (diagnosticBox && diagnosticTitle && diagnosticLatency && diagnosticPreview) {
          diagnosticTitle.textContent = `Live Output: ${res.provider.toUpperCase()} (${res.modelUsed})`;
          diagnosticLatency.textContent = `⚡ ${res.latencyMs || 0}ms`;
          diagnosticPreview.innerHTML = `
            <div class="sample-title"><b>Title:</b> ${res.sample.title}</div>
            <div class="sample-desc"><b>Description:</b> ${res.sample.description}</div>
          `;
          diagnosticBox.classList.remove("hidden");
        }

        // Auto-check "Activate AI Engine" toggle on successful test
        if (enabledEl) enabledEl.checked = true;
        saveConfig();
        schedulePopupResize();
      } else {
        statusEl.style.color = "#f87171";
        statusEl.textContent = `❌ Test Failed: ${res?.error || "Unknown error"}`;
        if (diagnosticBox && diagnosticTitle && diagnosticLatency && diagnosticPreview) {
          diagnosticTitle.textContent = "Diagnostic Error";
          diagnosticLatency.textContent = "Failed";
          diagnosticPreview.textContent = res?.error || "Check your API key, network connection, or provider limits.";
          diagnosticBox.classList.remove("hidden");
        }
        schedulePopupResize();
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const { buttons, frames } = getEls();
  Object.values(frames).forEach((frame) => frame?.addEventListener("load", schedulePopupResize));

  buttons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  initAiSettingsPanel();

  chrome.storage.local.get({ __mainToolMode: "af" }, (result) => {
    setTool(result.__mainToolMode);
  });
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event?.data?.type === "SHARED_IFRAME_RESIZE") schedulePopupResize();
});
