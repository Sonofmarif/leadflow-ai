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

  // Location controls: top button saves only; lower button applies saved locations to open edit-listing tabs.
  const saveLocationStorageBtn = document.getElementById("saveLocationStorageBtn");
  const saveLocationBtn = document.getElementById("SaveLocation");


  // -----------------------------
  // Custom Run selected stages
  // -----------------------------
  const customRunRoot = document.getElementById("customRunRoot");
  const customRunToggle = document.getElementById("customRunToggle");
  const customRunPanel = document.getElementById("customRunPanel");
  const customRunState = document.getElementById("customRunState");
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
  // Save Locations only (UI/storage)
  // -----------------------------
  if (saveLocationStorageBtn) {
    saveLocationStorageBtn.addEventListener("click", () => {
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
            message: chrome.runtime.lastError.message || "Unable to save locations."
          });
          return;
        }

        openSaveModal({
          title: "✅ Locations Saved",
          message: `${lines.length} location(s) saved. No listing tabs were changed.`
        });
      });
    });
  }

  // -----------------------------
  // Apply saved locations to already-open Marketplace edit listing tabs
  // -----------------------------
  if (saveLocationBtn) {
    saveLocationBtn.addEventListener("click", () => {
      const label = saveLocationBtn.querySelector(".btn-text");
      const originalLabel = label?.textContent || "📍 Apply Locations";
      saveLocationBtn.disabled = true;
      if (label) label.textContent = "📍 Applying...";

      chrome.storage.local.get(["locations"], (data) => {
        if (chrome.runtime.lastError) {
          saveLocationBtn.disabled = false;
          if (label) label.textContent = originalLabel;
          openSaveModal({
            title: "❌ Location Apply Failed",
            message: chrome.runtime.lastError.message || "Unable to read saved locations."
          });
          return;
        }

        const lines = Array.isArray(data.locations)
          ? data.locations.map(s => String(s).trim()).filter(Boolean)
          : [];

        if (!lines.length) {
          saveLocationBtn.disabled = false;
          if (label) label.textContent = originalLabel;
          openSaveModal({
            title: "❌ No Saved Locations",
            message: "Save the Target Location List first, then click Apply Locations."
          });
          return;
        }

        chrome.runtime.sendMessage({
          action: "saveLocationsFocusHandler",
          locations: lines
        }, (response) => {
          // Chrome may close the popup as soon as the first listing tab becomes active.
          // This callback still restores the button if the popup remains open.
          saveLocationBtn.disabled = false;
          if (label) label.textContent = originalLabel;

          if (chrome.runtime.lastError) {
            openSaveModal({
              title: "❌ Location Apply Failed",
              message: chrome.runtime.lastError.message || "Unable to start location apply."
            });
            return;
          }

          if (!response?.ok) {
            openSaveModal({
              title: "❌ Location Apply Failed",
              message: response?.error || "No eligible Marketplace edit listing tabs found."
            });
            return;
          }

          openSaveModal({
            title: "✅ Locations Applied",
            message: `${lines.length} saved location(s) applied to ${response.pastedTabs || 0} open edit listing tab(s).`
          });
        });
      });
    });
  }


  // -----------------------------
  // Open Listing + Autofill (Automation screen)
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
      const label = openListingBtn.querySelector(".btn-text");
      const originalLabel = label?.textContent || "📂 Open Listing";
      openListingBtn.disabled = true;
      if (label) label.textContent = `Opening + Filling ${tabCount}...`;

      chrome.runtime.sendMessage({
        action: "openListingAndAutofillHandler",
        tabCount
      }, (response) => {
        // The popup may close when the first listing tab becomes active. The background task continues.
        if (chrome.runtime.lastError) {
          openListingBtn.disabled = false;
          if (label) label.textContent = originalLabel;
          openSaveModal({
            title: "❌ Open Listing Failed",
            message: chrome.runtime.lastError.message || "Unable to start listing autofill."
          });
          return;
        }

        openListingBtn.disabled = false;
        if (!response?.ok) {
          if (label) label.textContent = "Open Failed ❌";
          openSaveModal({
            title: "❌ Open Listing Failed",
            message: response?.error || "Unable to open and autofill listing tabs."
          });
          setTimeout(() => { if (label) label.textContent = originalLabel; }, 1800);
          return;
        }

        if (label) label.textContent = `Filled ${response.filledTabs || 0}/${response.openedTabs || tabCount} ✅`;
        setTimeout(() => {
          if (label) label.textContent = originalLabel;
        }, 1700);
      });
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
  // ✅ DELETE ADS (Confirm Modal + then run)
  // =========================
  const deleteAdsBtn = document.getElementById("deleteAdsBtn");

  const daModal = document.getElementById("daModal");
  const daBackdrop = document.getElementById("daBackdrop");
  const daClose = document.getElementById("daClose");
  const daCancel = document.getElementById("daCancel");
  const daYes = document.getElementById("daYes");

  const openDaModal = () => {
    if (!daModal) return;
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

      // keep awake if permission exists
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

  if (deleteAdsBtn) deleteAdsBtn.addEventListener("click", openDaModal);

  if (daYes) {
    daYes.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDaModal();
      await runDeleteAdsFlow();
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
});