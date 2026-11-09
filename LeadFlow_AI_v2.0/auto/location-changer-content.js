(() => {
  const __locationChangerGuard = "__MM_LOCATION_CHANGER_INIT_AUTO__";
  if (window[__locationChangerGuard]) {
    console.log("⏭️ Location changer already initialized. Skipping re-init.");
    return;
  }
  window[__locationChangerGuard] = true;

// Merge mode isolation marker
window.__MERGE_MODE = 'auto';
const __MERGE_SCRIPT_MODE = 'auto';
let __locationChangerStopEpoch = Number(window.__MP_EXT_STOP_EPOCH__ || 0);
let __locationChangerStopped = false;
const stopRequested = () => __locationChangerStopped || Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== __locationChangerStopEpoch;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const isVisible = (el) => !!el && el instanceof HTMLElement && el.offsetParent !== null;

function fireMouse(el, type) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
}

async function humanClick(el) {
  if (stopRequested() || !el) return false;
  el.scrollIntoView({ block: "center", inline: "center" });
  await sleep(rand(120, 240));
  if (stopRequested()) return false;
  fireMouse(el, "mouseover");
  fireMouse(el, "mousemove");
  await sleep(rand(80, 160));
  if (stopRequested()) return false;
  fireMouse(el, "mousedown");
  await sleep(rand(40, 120));
  if (stopRequested()) return false;
  fireMouse(el, "mouseup");
  await sleep(rand(30, 90));
  if (stopRequested()) return false;
  fireMouse(el, "click");
  return true;
}

function getVisibleDialog() {
  return [...document.querySelectorAll('div[role="dialog"]')].find(
    (d) => d.getAttribute("aria-hidden") !== "true" && isVisible(d)
  );
}

function setReactInputValue(input, value) {
  const proto = Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("Input value setter not found");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitFor(fn, { timeout = 8000, interval = 250, label = "waitFor" } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (stopRequested()) throw new Error("Stopped by user");
    const v = fn();
    if (v) return v;
    await sleep(interval);
  }
  throw new Error(`Timeout: ${label}`);
}

async function clickMarketplaceLocationButton() {
  if (stopRequested()) return false;
  const btn = await waitFor(
    () => document.querySelector('div[role="button"][tabindex="0"][aria-label^="Location:"]'),
    { label: "Location button", timeout: 30000, interval: 300 }
  );
  await humanClick(btn);
  await sleep(rand(600, 1200));
}

async function setCityAndPickFirstSuggestion(city) {
  if (stopRequested()) return false;
  const dialog = await waitFor(getVisibleDialog, { label: "Change location dialog", timeout: 20000 });

  const input = await waitFor(
    () => dialog.querySelector('input[aria-label="Location"][role="combobox"]'),
    { label: "Location input", timeout: 20000 }
  );

  await humanClick(input);
  await sleep(rand(80, 180));

  setReactInputValue(input, "");
  await sleep(rand(60, 140));
  setReactInputValue(input, city);

  await sleep(rand(900, 1600));

  const firstSpan = await waitFor(
    () => [...document.querySelectorAll('span[dir="auto"][id^="_r_"]')].find(isVisible),
    { label: "First suggestion span", timeout: 20000 }
  );

  let el = firstSpan;
  let clickable = null;
  for (let i = 0; i < 15 && el; i++) {
    const role = el.getAttribute?.("role");
    const tabindex = el.getAttribute?.("tabindex");
    if (el.tagName === "A" || el.tagName === "BUTTON" || role === "button" || role === "option" || tabindex === "0") {
      clickable = el;
      break;
    }
    el = el.parentElement;
  }
  if (!clickable) throw new Error("Clickable suggestion row not found");

  await humanClick(clickable);
  await sleep(rand(500, 1100));
}

async function openRadiusDropdown() {
  if (stopRequested()) return false;
  const dialog = await waitFor(getVisibleDialog, { label: "dialog (radius)", timeout: 20000 });

  const labelEl = await waitFor(
    () => {
      const els = [...dialog.querySelectorAll("span, div")].filter(isVisible);
      return els.find((el) => (el.textContent || "").trim().toLowerCase() === "radius");
    },
    { label: "Radius label", timeout: 20000 }
  );

  let el = labelEl;
  let clickable = null;
  for (let i = 0; i < 12 && el; i++) {
    const role = el.getAttribute?.("role");
    const tabindex = el.getAttribute?.("tabindex");
    if (el.tagName === "BUTTON" || el.tagName === "A" || role === "button" || tabindex === "0") {
      clickable = el;
      break;
    }
    el = el.parentElement;
  }

  clickable = clickable || labelEl.closest("div") || labelEl.parentElement;
  if (!clickable) throw new Error("Radius clickable row not found");

  await humanClick(clickable);
  await sleep(rand(500, 900));
}

async function clickLastRadiusOption() {
  if (stopRequested()) return false;
  const last = await waitFor(
    () => {
      const opts = [...document.querySelectorAll('div[role="option"]')].filter(isVisible);
      return opts.length ? opts[opts.length - 1] : null;
    },
    { label: "radius options (last)", timeout: 20000 }
  );

  await humanClick(last);
  await sleep(rand(500, 900));
}

async function clickApply() {
  if (stopRequested()) return false;
  const dialog = await waitFor(getVisibleDialog, { label: "dialog (apply)", timeout: 20000 });

  const applyBtn = await waitFor(
    () => {
      const btns = [...dialog.querySelectorAll('[role="button"], button')].filter(isVisible);
      return btns.find((b) => (b.textContent || "").trim().toLowerCase() === "apply");
    },
    { label: "Apply button", timeout: 20000 }
  );

  if (applyBtn.getAttribute("aria-disabled") === "true" || applyBtn.disabled) {
    throw new Error("Apply is disabled");
  }

  await humanClick(applyBtn);
  await sleep(rand(600, 1200));
}

async function runFlowOnce(city) {
  if (stopRequested()) return false;
  if (!location.href.includes("/marketplace")) throw new Error("Not on Marketplace page");
  await clickMarketplaceLocationButton();
  if (stopRequested()) return false;
  await setCityAndPickFirstSuggestion(city);
  if (stopRequested()) return false;
  await openRadiusDropdown();
  if (stopRequested()) return false;
  await clickLastRadiusOption();
  if (stopRequested()) return false;
  await clickApply();
  return !stopRequested();
}

const KEY = "mpRepeatState";

async function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([KEY], (res) => resolve(res[KEY] || null));
  });
}

async function setState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [KEY]: state }, resolve);
  });
}

async function clearState() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([KEY], resolve);
  });
}

async function waitMarketplaceReady() {
  if (stopRequested()) return false;
  await waitFor(() => document.body, { label: "body", timeout: 30000 });
  await waitFor(
    () => document.querySelector('div[role="button"][tabindex="0"][aria-label^="Location:"]'),
    { label: "location button ready", timeout: 45000, interval: 400 }
  );
  await sleep(rand(1500, 3500));
}

async function continueIfNeeded() {
  if (stopRequested()) return;
  const st = await getState();
  if (!st?.running || stopRequested()) return;

  try {
    await waitMarketplaceReady();
    await runFlowOnce(st.city);

    const remaining = (st.remaining || 0) - 1;

    if (remaining > 0) {
      await setState({ ...st, remaining });
      await sleep(rand(4000, 7000));
      location.reload();
    } else {
      await clearState();
      await sleep(rand(4000, 7000));
      location.reload();
    }
  } catch (e) {
    console.error("Auto-continue failed:", e);
    await clearState();
  }
}

// Auto-continue on load
continueIfNeeded();

// Start message from popup (guarded)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "STOP_EXTENSION_WORK") {
    __locationChangerStopped = true;
    window.__MP_EXT_STOP_EPOCH__ = Number(msg.stopEpoch ?? window.__MP_EXT_STOP_EPOCH__ ?? 0);
    clearState().catch(() => {});
    return;
  }
  if (msg?.type === "START_FLOW") {
    __locationChangerStopEpoch = Number(msg.stopEpoch ?? window.__MP_EXT_STOP_EPOCH__ ?? 0);
    __locationChangerStopped = false;
    window.__MP_EXT_STOP_EPOCH__ = __locationChangerStopEpoch;
    (async () => {
      const current = await getState();
      if (current?.running) {
        console.log("⏳ Already running. Ignoring new START_FLOW.");
        return;
      }

      await setState({ running: true, remaining: 3, city: msg.city });
      await continueIfNeeded();
    })().catch(console.error);
  }
});
})();
