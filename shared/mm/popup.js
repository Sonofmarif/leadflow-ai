document.addEventListener("DOMContentLoaded", () => {
  function requestParentResize(){
    try { window.parent.postMessage({ type: "SHARED_IFRAME_RESIZE" }, "*"); } catch(e) {}
  }
  requestParentResize();
  setTimeout(requestParentResize, 80);
  setTimeout(requestParentResize, 250);


  // -----------------------------
  // Button click animation
  // -----------------------------
  const animateButton = (btn) => {
    if (!btn) return;
    btn.classList.add("clicked");
    setTimeout(() => btn.classList.remove("clicked"), 280);
  };

  document.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => animateButton(button));
  });

  // -----------------------------
  // Modal helpers
  // -----------------------------
  const saveModal = document.getElementById("saveModal");
  const saveBackdrop = document.getElementById("saveBackdrop");
  const saveClose = document.getElementById("saveClose");
  const saveOk = document.getElementById("saveOk");
  const saveTitle = document.getElementById("saveTitle");
  const saveMsg = document.getElementById("saveMsg");

  const openSaveModal = ({ title = "Notification", message = "" } = {}) => {
    if (saveTitle) saveTitle.textContent = title;
    if (saveMsg) saveMsg.textContent = message;
    if (saveModal) {
      saveModal.classList.remove("hidden");
      saveModal.setAttribute("aria-hidden", "false");
    }
  };

  const closeSaveModal = () => {
    if (saveModal) {
      saveModal.classList.add("hidden");
      saveModal.setAttribute("aria-hidden", "true");
    }
  };

  if (saveClose) saveClose.addEventListener("click", closeSaveModal);
  if (saveOk) saveOk.addEventListener("click", closeSaveModal);
  if (saveBackdrop) saveBackdrop.addEventListener("click", closeSaveModal);

  // -----------------------------
  // Load saved locations
  // -----------------------------
  const locationTextarea = document.getElementById("location");

  chrome.storage.local.get(["locations", "masterTabCount"], (data) => {
    if (chrome.runtime.lastError) return;
    if (locationTextarea && Array.isArray(data.locations)) {
      locationTextarea.value = data.locations.join("\n");
    }
    const savedTabCountInput = document.getElementById("masterTabCount");
    if (savedTabCountInput && data.masterTabCount) {
      savedTabCountInput.value = data.masterTabCount;
    }
  });

  // -----------------------------
  // Automation elements (as per popup.html)
  // -----------------------------
  const startMasterAutomationBtn = document.getElementById("startMasterAutomationBtn");
  const stopMasterAutomationBtn = document.getElementById("stopMasterAutomationBtn");
  const masterTabCountInput = document.getElementById("masterTabCount");

  const statusBox = document.getElementById("automationStatusBox");
  const statusText = document.getElementById("automationStatusText");

  // ✅ Keep MM tab counter synced globally so AF/Open Listing can use it too
  if (masterTabCountInput) {
    masterTabCountInput.addEventListener("input", () => {
      const tabCount = Number(masterTabCountInput.value);
      if (tabCount && tabCount >= 1) {
        chrome.storage.local.set({ masterTabCount: tabCount });
      }
    });
  }

  // ✅ Save Locations button ID in HTML: "SaveLocation"
  const saveLocationBtn = document.getElementById("SaveLocation");


  // -----------------------------
  // Custom Run selected stages
  // -----------------------------
  const customRunRoot = document.getElementById("customRunRoot");
  const customRunToggle = document.getElementById("customRunToggle");
  const customRunPanel = document.getElementById("customRunPanel");
  const customRunState = document.getElementById("customRunState");
  const crAll = document.getElementById("crAll");
  const customStepCheckboxes = Array.from(document.querySelectorAll(".custom-step-check"));

  const CUSTOM_RUN_LABELS = {
    autofill: "Autofill",
    saveDraft: "Save Draft",
    draftOpener: "Draft Opener",
    locations: "Locations",
    publish: "Publish"
  };

  function requestCustomResize(){
    try { requestParentResize(); } catch(e) {}
  }

  function getSelectedCustomRunSteps(){
    const steps = { autofill: false, saveDraft: false, draftOpener: false, locations: false, publish: false };
    customStepCheckboxes.forEach((box) => {
      const step = box.dataset.step;
      if (step && Object.prototype.hasOwnProperty.call(steps, step)) {
        steps[step] = !!box.checked;
      }
    });
    const any = Object.values(steps).some(Boolean);
    return any ? steps : null;
  }

  function getCustomRunNames(steps){
    if (!steps) return [];
    return Object.keys(CUSTOM_RUN_LABELS).filter((key) => steps[key]).map((key) => CUSTOM_RUN_LABELS[key]);
  }

  function saveCustomRunState(){
    const steps = getSelectedCustomRunSteps() || { autofill:false, saveDraft:false, draftOpener:false, locations:false, publish:false };
    chrome.storage.local.set({
      customRunOpen: !!(customRunPanel && !customRunPanel.classList.contains("hidden")),
      customRunSteps: steps
    });
  }

  function syncCustomRunUi(shouldSave = true){
    const total = customStepCheckboxes.length;
    const checked = customStepCheckboxes.filter((box) => box.checked).length;
    const active = checked > 0;

    if (crAll) {
      crAll.checked = total > 0 && checked === total;
      crAll.indeterminate = checked > 0 && checked < total;
    }
    if (customRunToggle) {
      customRunToggle.classList.toggle("custom-active", active);
      customRunToggle.setAttribute("aria-expanded", String(!!(customRunPanel && !customRunPanel.classList.contains("hidden"))));
    }
    if (customRunState) customRunState.textContent = active ? "ON" : "OFF";
    if (shouldSave) saveCustomRunState();
    requestCustomResize();
    setTimeout(requestCustomResize, 80);
  }

  if (customRunToggle && customRunPanel) {
    customRunToggle.addEventListener("click", () => {
      customRunPanel.classList.toggle("hidden");
      syncCustomRunUi(true);
    });
  }

  if (crAll) {
    crAll.addEventListener("change", () => {
      customStepCheckboxes.forEach((box) => { box.checked = crAll.checked; });
      syncCustomRunUi(true);
    });
  }

  customStepCheckboxes.forEach((box) => {
    box.addEventListener("change", () => syncCustomRunUi(true));
  });

  chrome.storage.local.get({ customRunOpen: false, customRunSteps: null }, (res) => {
    const savedSteps = res.customRunSteps || {};
    customStepCheckboxes.forEach((box) => {
      const step = box.dataset.step;
      box.checked = !!savedSteps[step];
    });
    if (customRunPanel) customRunPanel.classList.toggle("hidden", !res.customRunOpen);
    syncCustomRunUi(false);
  });

  // -----------------------------
  // Start Automation
  // -----------------------------
  if (startMasterAutomationBtn) {
    startMasterAutomationBtn.addEventListener("click", () => {
      const rawText = locationTextarea ? locationTextarea.value : "";
      const locs = rawText.split("\n").map(s => s.trim()).filter(Boolean);
      const tabCount = masterTabCountInput ? Number(masterTabCountInput.value) : 3;
      const customSteps = getSelectedCustomRunSteps();
      const customNames = getCustomRunNames(customSteps);
      const isCustomRun = !!customSteps;
      const needsLocations = !isCustomRun || !!customSteps.locations;

      if (needsLocations && locs.length === 0) {
        openSaveModal({
          title: "❌ Missing Locations",
          message: isCustomRun ? "Locations step selected hai. Please target locations type karo." : "Please type target locations before execution."
        });
        return;
      }

      if (!tabCount || tabCount < 1) {
        openSaveModal({
          title: "❌ Invalid Tabs",
          message: "Please enter a valid number of automation tabs (min 1)."
        });
        return;
      }

      chrome.storage.local.set({ masterTabCount: tabCount });

      // UI status
      if (statusBox) statusBox.style.display = "block";
      if (statusText) {
        statusText.textContent = isCustomRun ? `Running Custom Run: ${customNames.join(" + ")}` : "Running Hands-Free Pipeline...";
        statusText.style.color = "#3f9cff";
      }

      if (stopMasterAutomationBtn) stopMasterAutomationBtn.classList.remove("hidden");
      startMasterAutomationBtn.style.opacity = "0.5";
      startMasterAutomationBtn.disabled = true;

      const payload = {
        type: "START_FULL_AUTOMATION",
        tabCount: tabCount,
        locations: locs
      };

      if (isCustomRun) {
        payload.customRun = true;
        payload.steps = customSteps;
      }

      chrome.runtime.sendMessage(payload, (response) => {

        if (stopMasterAutomationBtn) stopMasterAutomationBtn.classList.remove("hidden");
        startMasterAutomationBtn.disabled = false;
        startMasterAutomationBtn.style.opacity = "1";

        if (statusText) {
          if (response && response.ok) {
            statusText.textContent = isCustomRun ? "🏁 Custom Run Complete!" : "🏁 Full Workflow Executed Automatically!";
            statusText.style.color = "#00ff88";
          } else {
            statusText.textContent = "❌ Interrupted: " + (response?.error || chrome.runtime.lastError?.message || "Done");
            statusText.style.color = "#ff4f4f";
          }
        }

        setTimeout(() => {
          if (statusBox) statusBox.style.display = "none";
        }, 5000);
      });
    });
  }

  // -----------------------------
  // Stop Automation
  // -----------------------------
  if (stopMasterAutomationBtn) {
    stopMasterAutomationBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "STOP_MASTER_AUTOMATION" }, () => {
        if (statusBox) statusBox.style.display = "block";
        if (statusText) {
          statusText.textContent = "🛑 Pipeline Halted Immediately.";
          statusText.style.color = "#ff4f4f";
        }

        stopMasterAutomationBtn.classList.remove("hidden");

        if (startMasterAutomationBtn) {
          startMasterAutomationBtn.disabled = false;
          startMasterAutomationBtn.style.opacity = "1";
        }

        setTimeout(() => {
          if (statusBox) statusBox.style.display = "none";
        }, 4000);
      });
    });
  }

  // -----------------------------
  // Save Locations Only
  // -----------------------------
  if (saveLocationBtn) {
    saveLocationBtn.addEventListener("click", () => {
      const lines = locationTextarea
        ? locationTextarea.value.split("\n").map(s => s.trim()).filter(Boolean)
        : [];

      if (!lines.length) {
        openSaveModal({ title: "❌ Error", message: "Locations field is empty." });
        return;
      }

      chrome.storage.local.set({ locations: lines }, () => {
        if (chrome.runtime.lastError) {
          openSaveModal({
            title: "❌ Save Failed",
            message: chrome.runtime.lastError.message || "Unknown error"
          });
          return;
        }

        chrome.runtime.sendMessage({
          action: "saveLocationsFocusHandler",
          locations: lines
        }, (response) => {
          if (chrome.runtime.lastError || !response || !response.ok) {
            openSaveModal({
              title: "⚠️ Saved, Paste Issue",
              message: (chrome.runtime.lastError?.message || response?.error || "Locations saved, but paste command could not run.")
            });
            return;
          }

          openSaveModal({
            title: "✅ Saved + Pasted",
            message: `Saved ${lines.length} location(s) and pasted into ${response.pastedTabs ?? response.tabs ?? 0} open Marketplace tab(s).`
          });
        });
      });
    });
  }


  // -----------------------------
  // Open Listing (Automation screen)
  // -----------------------------
  const openListingBtn = document.getElementById("openListing");
  if (openListingBtn) {
    openListingBtn.addEventListener("click", () => {
      const tabCount = masterTabCountInput ? Number(masterTabCountInput.value) : 0;
      if (!tabCount || tabCount < 1) {
        openSaveModal({ title: "❌ Invalid Tabs", message: "Please enter a valid number of tabs (min 1)." });
        return;
      }

      chrome.storage.local.set({ masterTabCount: tabCount });
      const initialText = openListingBtn.querySelector(".btn-text");
      if (initialText) initialText.textContent = `Opening ${tabCount}...`;
      openListingBtn.disabled = true;

      let opened = 0;
      let failed = false;
      for (let i = 0; i < tabCount; i += 1) {
        chrome.tabs.create({
          url: "https://www.facebook.com/marketplace/create/item",
          active: i === 0
        }, () => {
          if (chrome.runtime.lastError) failed = true;
          opened += 1;
          if (opened !== tabCount) return;
          if (initialText) initialText.textContent = failed ? "Open Failed ❌" : `Opened ${tabCount} ✅`;
          setTimeout(() => {
            if (initialText) initialText.textContent = "📂 Open Listing";
            openListingBtn.disabled = false;
          }, failed ? 1800 : 1500);
        });
      }
    });
  }

  // =====================================================
  // Buttons + logic imported from Only Buttons extension
  // =====================================================
  // =========================
  // MARKETPLACE TOOLS
  // =========================
  const autoPublishBtn = document.getElementById("autoPublishBtn");
  const draftOpenerBtn = document.getElementById("draftOpenerBtn");
  const relistBtn = document.getElementById("relistBtn");
  const renewBtn = document.getElementById("renewBtn");
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const markAvailableBtn = document.getElementById("markAvailableBtn");
  const markSoldBtn = document.getElementById("markSoldBtn");
  const inStockBtn = document.getElementById("inStockBtn");
  const outStockBtn = document.getElementById("outStockBtn");

  if (autoPublishBtn) autoPublishBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "autoPublishHandler" }));
  if (draftOpenerBtn) draftOpenerBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "draftOpenerHandler" }));
  if (relistBtn) relistBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "relistHandler" }));
  if (renewBtn) renewBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "renewHandler" }));
  if (saveDraftBtn) saveDraftBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "saveDraftHandler" }));
  if (markAvailableBtn) markAvailableBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "markAsAvailableHandler" }));
  if (markSoldBtn) markSoldBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "markAsSoldHandler" }));
  if (inStockBtn) inStockBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "markInStockHandler" }));
  if (outStockBtn) outStockBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "markOutOfStockHandler" }));

  // =========================
  // DELETE ADS + DELETE DRAFTS + DELETE SOLD
  // =========================
  const deleteAdsBtn = document.getElementById("deleteAdsBtn");
  const deleteDraftsBtn = document.getElementById("deleteDraftsBtn");
  const deleteSoldBtn = document.getElementById("deleteSoldBtn");

  const daModal = document.getElementById("daModal");
  const daBackdrop = document.getElementById("daBackdrop");
  const daClose = document.getElementById("daClose");
  const daCancel = document.getElementById("daCancel");
  const daYes = document.getElementById("daYes");
  const daTitle = document.getElementById("daTitle");
  const daMsg = document.getElementById("daMsg");
  let activeDeleteMode = null;

  const deleteModeCopy = {
    ads: {
      title: "Delete Ads",
      message: "Are You Sure To Delete ?",
      started: "✅ Delete started (ULTRA). Best speed when Chrome is not minimized."
    },
    drafts: {
      title: "Delete Drafts",
      message: "Delete every loaded Marketplace draft? This cannot be undone.",
      started: "✅ Delete Drafts started. The page will not refresh."
    },
    sold: {
      title: "Delete Sold",
      message: "Delete every sold listing shown with Relist this item? This cannot be undone.",
      started: "✅ Delete Sold started. The page will not refresh."
    }
  };

  const openDaModal = (mode) => {
    if (!daModal || !deleteModeCopy[mode]) return;
    activeDeleteMode = mode;
    if (daTitle) daTitle.textContent = deleteModeCopy[mode].title;
    if (daMsg) daMsg.textContent = deleteModeCopy[mode].message;
    daModal.classList.remove("hidden");
    daModal.setAttribute("aria-hidden", "false");
  };

  const closeDaModal = () => {
    if (!daModal) return;
    daModal.classList.add("hidden");
    daModal.setAttribute("aria-hidden", "true");
  };

  if (daBackdrop) daBackdrop.addEventListener("click", closeDaModal);
  if (daClose) daClose.addEventListener("click", closeDaModal);
  if (daCancel) daCancel.addEventListener("click", closeDaModal);

  // Existing Delete Ads flow restored unchanged: it opens the original
  // Marketplace activity page and runs the original delete-ads runner.
  // ✅ FIXED: Dynamic /me/ URL — works on any logged-in Facebook account
  // Previously hardcoded to a specific FB user ID which broke for all other users.
  const DELETE_ADS_URL =
    "https://www.facebook.com/me/allactivity?activity_history=false&category_key=YOURACTIVITYFBMARKETPLACESCHEMA&manage_mode=false&should_load_landing_page=false";

  function waitTabComplete(tabId, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const listener = (updatedTabId, info) => {
        if (updatedTabId !== tabId) return;

        if (info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error("Timeout waiting for tab load complete"));
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  async function runDeleteAdsFlow() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      try { chrome.power?.requestKeepAwake?.("display"); } catch (e) {}

      await chrome.tabs.update(tab.id, { url: DELETE_ADS_URL, active: true });
      await waitTabComplete(tab.id, 90000);
      await new Promise((r) => setTimeout(r, 900));

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: deleteAdsRunnerFast
      });

      openSaveModal({
        title: "Delete Ads",
        message: "✅ Delete started (ULTRA). Best speed when Chrome is not minimized."
      });
    } catch (e) {
      console.error(e);
      openSaveModal({ title: "Delete Ads", message: "❌ Failed. Please open Facebook and try again." });
    }
  }

  async function runCurrentPageDeleteFlow(mode) {
    const config = deleteModeCopy[mode];
    if (!config) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab found");

      const runner = mode === "drafts" ? deleteDraftsRunnerFast : deleteSoldRunnerFast;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runner
      });

      openSaveModal({ title: config.title, message: config.started });
    } catch (error) {
      console.error(error);
      openSaveModal({
        title: config.title,
        message: "❌ Failed. Open your Facebook Marketplace selling page and try again."
      });
    }
  }

  if (deleteAdsBtn) deleteAdsBtn.addEventListener("click", () => openDaModal("ads"));
  if (deleteDraftsBtn) deleteDraftsBtn.addEventListener("click", () => openDaModal("drafts"));
  if (deleteSoldBtn) deleteSoldBtn.addEventListener("click", () => openDaModal("sold"));

  if (daYes) {
    daYes.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const mode = activeDeleteMode;
      closeDaModal();
      activeDeleteMode = null;

      if (mode === "ads") {
        await runDeleteAdsFlow();
      } else {
        await runCurrentPageDeleteFlow(mode);
      }
    });
  }

  // =========================
  // ✅ CLEAR HISTORY (Confirm Modal + browsingData) + OPEN FACEBOOK
  // =========================
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const chModal = document.getElementById("chModal");
  const chBackdrop = document.getElementById("chBackdrop");
  const chClose = document.getElementById("chClose");
  const chCancel = document.getElementById("chCancel");
  const chYes = document.getElementById("chYes");

  const openChModal = () => {
    if (!chModal) return;
    chModal.classList.remove("hidden");
    chModal.setAttribute("aria-hidden", "false");
  };

  const closeChModal = () => {
    if (!chModal) return;
    chModal.classList.add("hidden");
    chModal.setAttribute("aria-hidden", "true");
  };

  if (chBackdrop) chBackdrop.addEventListener("click", closeChModal);
  if (chClose) chClose.addEventListener("click", closeChModal);
  if (chCancel) chCancel.addEventListener("click", closeChModal);

  async function runClearHistoryFlow() {
    try {
      const since = 0;

      // ✅ FIXED: Restrict browsingData.remove to Facebook origins ONLY.
      // Previous version used global history:true / downloads:true which wiped
      // Gmail, banking sessions, and all other browser data — CRITICAL BUG FIXED.
      const dataToRemove = {
        cookies: true,
        cache: true,
        localStorage: true,
        indexedDB: true,
        cacheStorage: true,
        serviceWorkers: true
        // history and downloads intentionally REMOVED — do not wipe global browser history
      };

      const FB_ORIGINS = [
        "https://www.facebook.com",
        "https://facebook.com",
        "https://web.facebook.com",
        "https://m.facebook.com"
      ];

      await new Promise((resolve, reject) => {
        chrome.browsingData.remove({ since, origins: FB_ORIGINS }, dataToRemove, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });

      chrome.tabs.query({ url: "*://*.facebook.com/*" }, (tabs) => {
        tabs.forEach((t) => {
          if (t?.id) chrome.tabs.remove(t.id);
        });
        chrome.tabs.create({ url: "https://www.facebook.com/", active: true });
      });

      openSaveModal({
        title: "Clear History",
        message: "✅ Browser data cleared. Opening Facebook..."
      });
    } catch (e) {
      console.error(e);
      openSaveModal({
        title: "Clear History",
        message: "❌ Failed to clear browsing data. Please reload extension and try again."
      });
    }
  }

  if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", openChModal);

  if (chYes) {
    chYes.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeChModal();
      await runClearHistoryFlow();
    });
  }

  // =========================
  // LOCATION CHANGER MODAL (unchanged)
  // =========================
  const locationChangerBtn = document.getElementById("locationChangerBtn");
  const lcModal = document.getElementById("lcModal");
  const lcBackdrop = document.getElementById("lcBackdrop");
  const lcClose = document.getElementById("lcClose");
  const lcCancel = document.getElementById("lcCancel");
  const lcStart = document.getElementById("lcStart");
  const lcCity = document.getElementById("lcCity");

  const openLcModal = () => {
    lcModal.classList.remove("hidden");
    lcModal.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      lcCity.focus();
      lcCity.select();
    }, 50);
  };

  const closeLcModal = () => {
    lcModal.classList.add("hidden");
    lcModal.setAttribute("aria-hidden", "true");
  };

  if (locationChangerBtn) locationChangerBtn.addEventListener("click", openLcModal);
  if (lcBackdrop) lcBackdrop.addEventListener("click", closeLcModal);
  if (lcClose) lcClose.addEventListener("click", closeLcModal);
  if (lcCancel) lcCancel.addEventListener("click", closeLcModal);

  let lcStarting = false;

  async function startLocationChangerFlow(city) {
    if (lcStarting) return;
    lcStarting = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      await chrome.tabs.reload(tab.id);

      await new Promise((resolve) => {
        const listener = (updatedTabId, info) => {
          if (updatedTabId === tab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      await new Promise((r) => setTimeout(r, 800));
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["auto/location-changer-content.js"] });
      } catch (injectErr) {}

      // Old working flow: content script continues the location change itself.
      // Do not wait for a response here, because the old stable script does not sendResponse.
      await chrome.tabs.sendMessage(tab.id, { type: "START_FLOW", city });
      openSaveModal({ title: "Location Changer", message: `✅ Location changer started for ${city}` });
    } catch (e) {
      openSaveModal({ title: "Location Changer", message: "❌ Please open Facebook Marketplace tab first, then try again. " + (e?.message || "") });
    } finally {
      setTimeout(() => (lcStarting = false), 1200);
    }
  }

  if (lcStart) {
    lcStart.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const city = (lcCity.value || "").trim() || "Reno, Nevada";
      closeLcModal();
      await startLocationChangerFlow(city);
    });
  }

  if (lcCity) {
    lcCity.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeLcModal();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const city = (lcCity.value || "").trim() || "Reno, Nevada";
        closeLcModal();
        await startLocationChangerFlow(city);
      }
    });
  }

  // =====================================================
  // Injected into FB page: ULTRA FAST Delete Ads runner
  // =====================================================
  function deleteAdsRunnerFast() {
    (async () => {
      const ownStopEpoch = Number(window.__MP_EXT_STOP_EPOCH__ || 0);
      const stopped = () => Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== ownStopEpoch;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const vis = (el) => !!el && el.getClientRects().length > 0 && el.offsetParent !== null;

      const THREE_DOTS_D =
        'M5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0z';

      const MAX_ITEMS = 50000;
      const WAIT_MENU_MS = 500;
      const WAIT_DIALOG_MS = 650;
      const TICK_SLEEP = 10;
      const STEP_DELAY = 12;

      function pressEsc() {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }

      function getScrollContainer() {
        return document.querySelector('div[role="main"]') || document.scrollingElement || document.documentElement;
      }

      async function fastScroll() {
        if (stopped()) return { atEnd: true };
        const sc = getScrollContainer();
        const before = sc.scrollTop || 0;

        sc.scrollBy(0, Math.max(1400, Math.floor(window.innerHeight * 2.0)));
        await sleep(70);

        const after = sc.scrollTop || 0;
        return { atEnd: after <= before + 2 };
      }

      function findDotBtn() {
        const p = document.querySelector(`svg path[d="${THREE_DOTS_D}"]`);
        if (!p) return null;

        const btn =
          p.closest('button, div[role="button"], [role="menuitem"]') ||
          p.parentElement?.closest('button, div[role="button"], [role="menuitem"]') ||
          null;

        return btn && vis(btn) ? btn : null;
      }

      function menuDeleteBtn() {
        const menus = Array.from(document.querySelectorAll('div[role="menu"]')).filter(vis);
        const menu = menus[menus.length - 1];
        if (!menu) return null;

        const s = Array.from(menu.querySelectorAll("span")).find((sp) => {
          const t = (sp.textContent || "").trim().toLowerCase();
          return t === "delete" && vis(sp);
        });

        return s ? (s.closest('[role="menuitem"],[role="button"],div[tabindex]') || s) : null;
      }

      function dialogDeleteBtn() {
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(vis);
        const d = dialogs[dialogs.length - 1];
        if (!d) return null;

        const s = Array.from(d.querySelectorAll("span")).find((sp) => {
          const t = (sp.textContent || "").trim().toLowerCase();
          return t === "delete" && vis(sp);
        });

        return s ? (s.closest('[role="button"],button') || s) : null;
      }

      async function waitFor(fn, ms) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          if (stopped()) return null;
          const v = fn();
          if (v) return v;
          await sleep(TICK_SLEEP);
        }
        return null;
      }

      let processed = 0;
      let noDot = 0;

      console.log("⚡⚡ ULTRA FAST Delete Ads started...");

      while (processed < MAX_ITEMS) {
        if (stopped()) { console.log("🛑 Delete Ads stopped by user."); break; }
        const btn = findDotBtn();

        if (!btn) {
          noDot++;
          const { atEnd } = await fastScroll();

          if (atEnd && noDot > 6) break;
          if (noDot > 60) break;
          continue;
        }

        noDot = 0;

        try { btn.scrollIntoView({ block: "center" }); } catch (e) {}
        btn.click();

        const md = await waitFor(menuDeleteBtn, WAIT_MENU_MS);
        if (!md) { pressEsc(); continue; }
        md.click();

        const fd = await waitFor(dialogDeleteBtn, WAIT_DIALOG_MS);
        if (!fd) { pressEsc(); continue; }
        fd.click();

        processed++;

        if (processed % 40 === 0) {
          console.log("ULTRA progress:", processed);
          await sleep(250);
        } else {
          // ✅ Randomized human delay (550ms–1150ms) to prevent bot velocity detection
          await sleep(Math.floor(Math.random() * 601) + 550);
        }
      }

      console.log("✅ ULTRA finished. Total:", processed);

      try { setTimeout(() => chrome?.power?.releaseKeepAwake?.(), 60_000); } catch (e) {}
    })();
  }

  // =====================================================
  // Injected into Facebook: shared no-refresh delete engine
  // =====================================================
  function deleteDraftsRunnerFast() {
    (async () => {
      const ownStopEpoch = Number(window.__MP_EXT_STOP_EPOCH__ || 0);
      const stopped = () => Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== ownStopEpoch;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const norm = (value) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const isVisible = (element) => {
        if (!element || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      };
      const isEnabled = (element) =>
        element &&
        element.getAttribute("aria-disabled") !== "true" &&
        element.getAttribute("aria-hidden") !== "true" &&
        !element.disabled;
      const click = (element) => {
        if (!element) return;
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        element.click();
      };
      const pressEscape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const waitFor = async (getter, timeout = 1700, interval = 18) => {
        const endsAt = Date.now() + timeout;
        while (Date.now() < endsAt) {
          if (stopped()) return null;
          const value = getter();
          if (value) return value;
          await sleep(interval);
        }
        return null;
      };

      function getScrollTarget() {
        const candidates = [
          document.scrollingElement,
          document.documentElement,
          document.body,
          ...document.querySelectorAll('div[role="main"], div[style*="overflow"]')
        ].filter(Boolean);

        const scrollable = candidates
          .filter((element) => element.scrollHeight > element.clientHeight + 60)
          .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));

        return scrollable[0] || document.scrollingElement || document.documentElement;
      }

      const getTop = (target) => target === document.scrollingElement || target === document.documentElement || target === document.body
        ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
        : target.scrollTop;
      const getMaxTop = (target) => Math.max(0, target.scrollHeight - target.clientHeight);
      const scrollTo = (target, top) => {
        if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
          window.scrollTo({ top, behavior: "auto" });
        } else {
          target.scrollTo({ top, behavior: "auto" });
        }
      };

      async function preloadEverything() {
        let stableAtEnd = 0;
        let lastHeight = -1;
        let lastCount = -1;

        for (let step = 0; step < 140; step += 1) {
          if (stopped()) return;
          const target = getScrollTarget();
          const height = target.scrollHeight;
          const maxTop = getMaxTop(target);
          const before = getTop(target);
          const count = document.querySelectorAll('[role="button"][aria-label^="Delete draft"]').length;

          scrollTo(target, Math.min(maxTop, before + Math.max(window.innerHeight * 2.2, 1500)));
          await sleep(145);

          const after = getTop(target);
          const newHeight = target.scrollHeight;
          const newCount = document.querySelectorAll('[role="button"][aria-label^="Delete draft"]').length;
          const reachedEnd = after >= Math.max(0, getMaxTop(target) - 4);
          const unchanged = newHeight === lastHeight && newCount === lastCount && Math.abs(after - before) < 5;

          if (reachedEnd && (unchanged || (newHeight === height && newCount === count))) {
            stableAtEnd += 1;
          } else {
            stableAtEnd = 0;
          }

          lastHeight = newHeight;
          lastCount = newCount;
          if (stableAtEnd >= 4) break;
        }

        const target = getScrollTarget();
        scrollTo(target, 0);
        await sleep(180);
      }

      function visibleDraftDeleteButton() {
        return [...document.querySelectorAll('[role="button"][aria-label^="Delete draft"]')]
          .find((element) => isVisible(element) && isEnabled(element));
      }

      function finalDeleteButton() {
        return [...document.querySelectorAll('[role="dialog"] [role="button"][aria-label="Delete"], [role="dialog"] button[aria-label="Delete"]')]
          .find((element) => isVisible(element) && isEnabled(element) && element.getAttribute("tabindex") !== "-1");
      }

      console.log("Delete Drafts: preloading every draft card...");
      await preloadEverything();
      if (stopped()) return;

      let deleted = 0;
      let emptyPasses = 0;
      const maxItems = 5000;

      while (deleted < maxItems) {
        if (stopped()) { console.log("🛑 Delete Drafts stopped by user."); break; }
        const draftButton = visibleDraftDeleteButton();
        if (!draftButton) {
          const target = getScrollTarget();
          const before = getTop(target);
          const maxTop = getMaxTop(target);

          if (before >= maxTop - 4) {
            emptyPasses += 1;
            if (emptyPasses >= 3) break;
            scrollTo(target, 0);
          } else {
            scrollTo(target, Math.min(maxTop, before + Math.max(window.innerHeight * 1.3, 900)));
          }

          await sleep(100);
          continue;
        }

        emptyPasses = 0;
        draftButton.scrollIntoView({ block: "center", behavior: "auto" });
        await sleep(24);
        click(draftButton);

        const confirmButton = await waitFor(finalDeleteButton, 1400, 16);
        if (!confirmButton) {
          pressEscape();
          await sleep(55);
          continue;
        }

        click(confirmButton);
        deleted += 1;

        await waitFor(() => !draftButton.isConnected || !isVisible(draftButton), 2200, 20);
        // ✅ Randomized human delay (550ms–1150ms) between draft deletes
        await sleep(Math.floor(Math.random() * 601) + 550);
      }

      console.log(`Delete Drafts complete. Deleted: ${deleted}`);
    })();
  }

  function deleteSoldRunnerFast() {
    (async () => {
      const ownStopEpoch = Number(window.__MP_EXT_STOP_EPOCH__ || 0);
      const stopped = () => Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== ownStopEpoch;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const norm = (value) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const isVisible = (element) => {
        if (!element || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      };
      const isEnabled = (element) =>
        element &&
        element.getAttribute("aria-disabled") !== "true" &&
        element.getAttribute("aria-hidden") !== "true" &&
        !element.disabled;
      const click = (element) => {
        if (!element) return;
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        element.click();
      };
      const pressEscape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const waitFor = async (getter, timeout = 1700, interval = 18) => {
        const endsAt = Date.now() + timeout;
        while (Date.now() < endsAt) {
          if (stopped()) return null;
          const value = getter();
          if (value) return value;
          await sleep(interval);
        }
        return null;
      };

      function getScrollTarget() {
        const candidates = [
          document.scrollingElement,
          document.documentElement,
          document.body,
          ...document.querySelectorAll('div[role="main"], div[style*="overflow"]')
        ].filter(Boolean);

        const scrollable = candidates
          .filter((element) => element.scrollHeight > element.clientHeight + 60)
          .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));

        return scrollable[0] || document.scrollingElement || document.documentElement;
      }

      const getTop = (target) => target === document.scrollingElement || target === document.documentElement || target === document.body
        ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
        : target.scrollTop;
      const getMaxTop = (target) => Math.max(0, target.scrollHeight - target.clientHeight);
      const scrollTo = (target, top) => {
        if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
          window.scrollTo({ top, behavior: "auto" });
        } else {
          target.scrollTo({ top, behavior: "auto" });
        }
      };

      function soldCardCount() {
        return [...document.querySelectorAll('span, div, button')]
          .filter((element) => isVisible(element) && norm(element.textContent) === "relist this item")
          .length;
      }

      async function preloadEverything() {
        let stableAtEnd = 0;
        let lastHeight = -1;
        let lastCount = -1;

        for (let step = 0; step < 140; step += 1) {
          if (stopped()) return;
          const target = getScrollTarget();
          const height = target.scrollHeight;
          const maxTop = getMaxTop(target);
          const before = getTop(target);
          const count = soldCardCount();

          scrollTo(target, Math.min(maxTop, before + Math.max(window.innerHeight * 2.2, 1500)));
          await sleep(145);

          const after = getTop(target);
          const newHeight = target.scrollHeight;
          const newCount = soldCardCount();
          const reachedEnd = after >= Math.max(0, getMaxTop(target) - 4);
          const unchanged = newHeight === lastHeight && newCount === lastCount && Math.abs(after - before) < 5;

          if (reachedEnd && (unchanged || (newHeight === height && newCount === count))) {
            stableAtEnd += 1;
          } else {
            stableAtEnd = 0;
          }

          lastHeight = newHeight;
          lastCount = newCount;
          if (stableAtEnd >= 4) break;
        }

        const target = getScrollTarget();
        scrollTo(target, 0);
        await sleep(180);
      }

      function soldMoreOptionsButton() {
        const relistMarkers = [...document.querySelectorAll('span, div, button')]
          .filter((element) => isVisible(element) && norm(element.textContent) === "relist this item");

        for (const marker of relistMarkers) {
          let node = marker;
          for (let level = 0; node && level < 14; level += 1, node = node.parentElement) {
            const options = [...node.querySelectorAll('[role="button"][aria-haspopup="dialog"][aria-label^="More options for"]')]
              .filter((element) => isVisible(element) && isEnabled(element));
            if (options.length === 1) return options[0];
            if (options.length > 1) break;
          }
        }
        return null;
      }

      function deleteListingMenuItem() {
        return [...document.querySelectorAll('[role="menuitem"], [role="button"], [tabindex="0"]')]
          .find((element) => isVisible(element) && isEnabled(element) && norm(element.innerText || element.textContent) === "delete listing");
      }

      function finalDeleteButton() {
        return [...document.querySelectorAll('[role="dialog"] [role="button"][aria-label="Delete"], [role="dialog"] button[aria-label="Delete"]')]
          .find((element) => isVisible(element) && isEnabled(element) && element.getAttribute("tabindex") !== "-1");
      }

      console.log("Delete Sold: preloading every sold listing...");
      await preloadEverything();
      if (stopped()) return;

      let deleted = 0;
      let emptyPasses = 0;
      const maxItems = 5000;

      while (deleted < maxItems) {
        if (stopped()) { console.log("🛑 Delete Sold stopped by user."); break; }
        const moreButton = soldMoreOptionsButton();
        if (!moreButton) {
          const target = getScrollTarget();
          const before = getTop(target);
          const maxTop = getMaxTop(target);

          if (before >= maxTop - 4) {
            emptyPasses += 1;
            if (emptyPasses >= 3) break;
            scrollTo(target, 0);
          } else {
            scrollTo(target, Math.min(maxTop, before + Math.max(window.innerHeight * 1.3, 900)));
          }

          await sleep(100);
          continue;
        }

        emptyPasses = 0;
        moreButton.scrollIntoView({ block: "center", behavior: "auto" });
        await sleep(24);
        click(moreButton);

        const deleteItem = await waitFor(deleteListingMenuItem, 1200, 16);
        if (!deleteItem) {
          pressEscape();
          await sleep(55);
          continue;
        }

        click(deleteItem);
        const confirmButton = await waitFor(finalDeleteButton, 1400, 16);
        if (!confirmButton) {
          pressEscape();
          await sleep(55);
          continue;
        }

        click(confirmButton);
        deleted += 1;

        await waitFor(() => !moreButton.isConnected || !isVisible(moreButton), 2400, 20);
        // ✅ Randomized human delay (550ms–1150ms) between sold deletes
        await sleep(Math.floor(Math.random() * 601) + 550);
      }

      console.log(`Delete Sold complete. Deleted: ${deleted}`);
    })();
  }

});