(() => {
// Merge mode isolation marker
window.__MERGE_MODE = 'auto';
const __MERGE_SCRIPT_MODE = 'auto';
// content-locations.js (REDECLARE-SAFE) - FAST LOCATION SETTER + RESPONSE ACK

if (!window.__MM_LOCATION_TOOL__) {
  window.__MM_LOCATION_TOOL__ = {
    runStopEpoch: Number(window.__MP_EXT_STOP_EPOCH__ || 0),
    stopRequested: false,
    isStopped() {
      return this.stopRequested || Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== Number(this.runStopEpoch || 0);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),

    isVisible(el) {
      return !!el && el instanceof HTMLElement && (el.offsetParent !== null || el.getClientRects().length > 0);
    },

    mouse(el, type, props = {}) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, ...props }));
    },

    dispatchInputEvents(el) {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: el.value || "" }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },

    setNativeValue(el, value) {
      const valueSetter = Object.getOwnPropertyDescriptor(el, "value")?.set;
      const proto = Object.getPrototypeOf(el);
      const protoSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (protoSetter && valueSetter !== protoSetter) protoSetter.call(el, value);
      else if (valueSetter) valueSetter.call(el, value);
      else el.value = value;
    },

    findLocationInput() {
      return (
        document.querySelector('input[aria-label="Location"][role="combobox"]') ||
        document.querySelector('input[aria-label="Location"]') ||
        document.querySelector('input[placeholder="Location"]')
      );
    },

    async waitForLocationInput(timeoutMs = 3500) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (this.isStopped()) return null;
        const input = this.findLocationInput();
        if (input) return input;
        await this.sleep(120);
      }
      return null;
    },

    async commitFirstSuggestion(timeoutMs = 1800) {
      const input = this.findLocationInput();
      if (!input) return false;

      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (this.isStopped()) return false;
        const listId = input.getAttribute("aria-controls");
        const root = listId ? document.getElementById(listId) : document;
        const opt = [...root.querySelectorAll('div[role="option"], li[role="option"], [role="listbox"] [role="option"]')]
          .find((el) => this.isVisible(el));

        if (opt) {
          const inner = opt.querySelector('div[aria-disabled="false"], div[tabindex="0"], span') || opt;
          inner.scrollIntoView({ block: "center", inline: "center" });
          this.mouse(inner, "mousedown", { button: 0, buttons: 1 });
          await this.sleep(15);
          this.mouse(inner, "mouseup", { button: 0, buttons: 0 });
          inner.click();
          await this.sleep(80);
          input.blur();

          // Wait until Facebook/React accepts the selected suggestion.
          const commitStart = Date.now();
          while (Date.now() - commitStart < 1600) {
            if (this.isStopped()) return false;
            const invalid = input.getAttribute("aria-invalid") === "true";
            const busy = input.getAttribute("aria-busy") === "true";
            const valueOk = (input.value || "").trim().length > 0;
            if (!invalid && !busy && valueOk) {
              await this.sleep(120); // short React commit buffer before background switches tab
              return true;
            }
            await this.sleep(120);
          }
          return input.getAttribute("aria-invalid") !== "true";
        }
        await this.sleep(100);
      }
      return false;
    },

    async setLocationWithRetry(input, originalLocation, currentIndex, allLocations, maxAttempts = 3) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (this.isStopped()) return { ok: false, error: "Stopped by user" };
        const nextIndex = attempt >= 3 ? (currentIndex + 1) % allLocations.length : currentIndex;
        const city = attempt >= 3 ? allLocations[nextIndex] : originalLocation;
        console.log(`📍 Fast location attempt ${attempt}: ${city}`);

        input.focus();
        this.setNativeValue(input, "");
        this.dispatchInputEvents(input);
        await this.sleep(35);

        this.setNativeValue(input, city);
        this.dispatchInputEvents(input);
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown", code: "ArrowDown" }));
        await this.sleep(220);

        if (await this.commitFirstSuggestion(1800)) {
          console.log("✅ Location selected quickly");
          return { ok: true, location: city, attempt };
        }
        await this.sleep(140);
      }
      return { ok: false, error: "Location suggestion not selected" };
    },

    async waitUntilActive(timeoutMs = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (this.isStopped()) return false;
        if (document.visibilityState === "visible") return true;
        await this.sleep(120);
      }
      return false;
    },

    async setLocationByIndex(index) {
      if (this.isStopped()) return { ok: false, error: "Stopped by user" };
      const active = await this.waitUntilActive(3500);
      if (!active) return { ok: false, error: "Tab not active yet - location fill skipped" };
      const data = await chrome.storage.local.get("locations");
      const locations = data.locations;
      if (!locations || !Array.isArray(locations) || locations.length === 0) {
        return { ok: false, error: "No locations saved" };
      }

      const location = locations[index] || locations[locations.length - 1];
      const input = await this.waitForLocationInput(3500);
      if (!input) return { ok: false, error: "Location input not found" };
      return this.setLocationWithRetry(input, location, index, locations, 3);
    }
  };

  console.log("✅ Fast MM Location tool loaded.");
}

if (!window.__MM_LOCATION_TOOL_LISTENER__) {
  window.__MM_LOCATION_TOOL_LISTENER__ = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (window.__MERGE_MODE !== __MERGE_SCRIPT_MODE) return false;
    const tool = window.__MM_LOCATION_TOOL__;
    if (!tool) return;

    if (message?.type === "STOP_EXTENSION_WORK") {
      tool.stopRequested = true;
      window.__MP_EXT_STOP_EPOCH__ = Number(message.stopEpoch ?? window.__MP_EXT_STOP_EPOCH__ ?? 0);
      sendResponse?.({ ok: true, stopped: true });
      return;
    }

    if (message.action === "updateLocation" && typeof message.index !== "undefined") {
      tool.runStopEpoch = Number(message.stopEpoch ?? window.__MP_EXT_STOP_EPOCH__ ?? 0);
      tool.stopRequested = false;
      window.__MP_EXT_STOP_EPOCH__ = tool.runStopEpoch;
      tool.setLocationByIndex(message.index).then(sendResponse).catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
      return true;
    }

    if (message.action === "clickFirstOption") {
      tool.commitFirstSuggestion().then((ok) => sendResponse({ ok })).catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
      return true;
    }
  });
}
})();
