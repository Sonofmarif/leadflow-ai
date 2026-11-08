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
    return Math.ceil(rect.height + 10) || 410;
  } catch (e) {
    return 410;
  }
}

function resizePopupToActiveFrame() {
  const activeTool = getActiveTool();
  if (activeTool === "ai") {
    document.documentElement.style.setProperty("--frame-h", "430px");
    return;
  }
  const { frames } = getEls();
  const frame = frames[activeTool];
  const height = Math.max(240, Math.min(560, getSharedFrameContentHeight(frame) + 4));
  document.documentElement.style.setProperty("--frame-h", `${height}px`);
}

function schedulePopupResize() {
  resizePopupToActiveFrame();
  requestAnimationFrame(resizePopupToActiveFrame);
  setTimeout(resizePopupToActiveFrame, 100);
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

function initAiSettingsPanel() {
  const apiKeyEl = document.getElementById("aiApiKey");
  const providerEl = document.getElementById("aiProvider");
  const modelEl = document.getElementById("aiModel");
  const nicheEl = document.getElementById("aiServiceNiche");
  const uniqueEl = document.getElementById("aiUniquePerTab");
  const enabledEl = document.getElementById("aiEnabled");
  const badgeEl = document.getElementById("aiDetectedBadge");
  const humanModeEl = document.getElementById("humanModeSelect");
  const webhookEl = document.getElementById("telemetryWebhookUrl");
  const saveBtn = document.getElementById("saveAiConfigBtn");
  const testBtn = document.getElementById("testAiBtn");
  const statusEl = document.getElementById("aiStatusMsg");

  function updateKeyBadge(key) {
    chrome.runtime.sendMessage({ type: "DETECT_AI_KEY", apiKey: key || "" }, (res) => {
      if (!badgeEl) return;
      if (!key || !res?.provider || res.provider === "none") {
        badgeEl.textContent = "No Key";
        return;
      }
      badgeEl.textContent = `${res.name} (${res.defaultModel})`;
      if (modelEl && !modelEl.value.trim()) {
        modelEl.placeholder = res.defaultModel;
      }
    });
  }

  apiKeyEl?.addEventListener("input", () => updateKeyBadge(apiKeyEl.value));

  chrome.storage.local.get(["aiConfig", "humanMode", "telemetryWebhookUrl"], (data) => {
    const cfg = data.aiConfig || {};
    if (apiKeyEl) apiKeyEl.value = cfg.apiKey || "";
    if (providerEl) providerEl.value = cfg.provider || "auto";
    if (modelEl) modelEl.value = cfg.model || "";
    if (nicheEl) nicheEl.value = cfg.serviceNiche || "";
    if (uniqueEl) uniqueEl.checked = cfg.uniquePerTab !== false;
    if (enabledEl) enabledEl.checked = !!cfg.enabled;
    if (humanModeEl) humanModeEl.value = data.humanMode || "safe";
    if (webhookEl) webhookEl.value = data.telemetryWebhookUrl || "";
    updateKeyBadge(cfg.apiKey || "");
  });

  function saveConfig(cb) {
    const aiConfig = {
      apiKey: apiKeyEl?.value.trim() || "",
      provider: providerEl?.value || "auto",
      model: modelEl?.value.trim() || "",
      serviceNiche: nicheEl?.value.trim() || "",
      uniquePerTab: !!uniqueEl?.checked,
      enabled: !!enabledEl?.checked
    };
    chrome.storage.local.set({
      aiConfig,
      humanMode: humanModeEl?.value || "safe",
      telemetryWebhookUrl: webhookEl?.value.trim() || ""
    }, () => {
      if (statusEl) {
        statusEl.style.color = "#34d399";
        statusEl.textContent = "✅ Settings saved!";
      }
      if (cb) cb();
    });
  }

  saveBtn?.addEventListener("click", () => saveConfig());

  testBtn?.addEventListener("click", () => {
    saveConfig(() => {
      if (statusEl) {
        statusEl.style.color = "#38bdf8";
        statusEl.textContent = "⏳ Testing AI connection...";
      }
      chrome.runtime.sendMessage({
        type: "TEST_AI_CONNECTION",
        niche: nicheEl?.value.trim() || "Emergency Plumber"
      }, (res) => {
        if (!statusEl) return;
        if (res?.ok && res.sample?.aiUsed) {
          statusEl.style.color = "#34d399";
          statusEl.textContent = `✅ AI Active: "${res.sample.title.slice(0, 38)}..."`;
        } else {
          statusEl.style.color = "#f87171";
          statusEl.textContent = "❌ Check API Key or Enable AI Engine toggle.";
        }
      });
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