(() => {
// Merge mode isolation marker
window.__MERGE_MODE = 'auto';
const __MERGE_SCRIPT_MODE = 'auto';
console.log("✅ content.js injected on:", location.href);

if (location.pathname.startsWith("/marketplace/edit/")) {
  console.log("⏭️ Autofill skipped on edit page:", location.href);
} else {
  // Prevent duplicate initialization when a tab receives more than one injection.
  if (window.__AF_AUTOFILL_INIT_AUTO__) {
    console.log("⏭️ Autofill already initialized. Skipping re-init.");
  } else {
    window.__AF_AUTOFILL_INIT_AUTO__ = true;

    let RUNNING = false;
    let OBS = null;
    let DATA = null;
    let DONE_NOTIFIED = false;
    let RUN_STOP_EPOCH = Number(window.__MP_EXT_STOP_EPOCH__ || 0);
    let RUN_IMAGE_INDEX = Math.max(0, Number(window.__AF_RUN_IMAGE_INDEX__) || 0);
    let RUN_IMAGE_MODE = window.__AF_RUN_IMAGE_MODE__ === "multiple" ? "multiple" : "single";
    let STOP_REQUESTED = false;

    function stopRequested() {
      return STOP_REQUESTED || Number(window.__MP_EXT_STOP_EPOCH__ || 0) !== RUN_STOP_EPOCH;
    }

    // Execution order: Image → Title → Price → Category → Condition → Availability → Description.
    const DONE = {
      image: false,
      title: false,
      price: false,
      category: false,
      condition: false,
      availability: false,
      description: false
    };

    const CATEGORY_LABELS = {
      auto_parts: "Auto parts",
      furniture: "Furniture",
      household: "Household",
      appliances: "Appliances",
      tools: "Tools"
    };

    const CONDITION_LABELS = {
      new: "New",
      used_like_new: "Used - Like New",
      used_good: "Used - Good",
      used_fair: "Used - Fair"
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // Human jitter delays between field fills (anti-detect)
    const humanSleep = (minMs = 120, maxMs = 400) => sleep(Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs);
    const norm = (value) => (value || "").replace(/\s+/g, " ").trim();
    const normLower = (value) => norm(value).toLowerCase();
    const vis = (el) => !!el && el.offsetParent !== null;

    function isActiveVisibleTab() {
      return document.visibilityState === "visible" && !document.hidden && document.hasFocus();
    }

    function resetDoneFlags() {
      for (const key of Object.keys(DONE)) DONE[key] = false;
      DONE_NOTIFIED = false;
    }

    const xp1 = (xpath) =>
      document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        .singleNodeValue;

    const click = (el) => {
      if (!el) return false;
      try { el.scrollIntoView({ block: "center", inline: "center" }); } catch (e) {}
      try { el.click(); return true; } catch (e) { return false; }
    };

    function setFieldValue(el, value) {
      if (!el) return false;

      const tag = el.tagName?.toLowerCase();
      el.focus();

      if (tag === "input" || tag === "textarea") {
        const proto = Object.getPrototypeOf(el);
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (descriptor?.set) descriptor.set.call(el, value);
        else el.value = value;

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      el.textContent = value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    function findTitleField() {
      return xp1("//input[contains(@type, 'text')]");
    }

    function findPriceField() {
      return xp1("(//input[@type='text'])[2]");
    }

    function findDescriptionField() {
      const textarea = document.querySelector("textarea");
      if (textarea) return textarea;

      const label = [...document.querySelectorAll("span,div,label")]
        .find((el) => norm(el.innerText) === "Description");

      if (label) {
        const root = label.closest("div");
        const nestedTextarea = root?.querySelector("textarea");
        if (nestedTextarea) return nestedTextarea;

        const input = root?.querySelector("input[type='text'], input:not([type])");
        if (input) return input;

        const editable = root?.querySelector('[contenteditable="true"]');
        if (editable) return editable;
      }
      return null;
    }

    function findUploadInput() {
      return document.querySelector("input[type='file']");
    }

    function findFacebookCombobox(labelText) {
      const expected = normLower(labelText);
      const candidates = [...document.querySelectorAll('label[role="combobox"], [role="combobox"]')]
        .filter(vis);

      return candidates.find((combo) => {
        const labelSpans = [...combo.querySelectorAll("span")];
        return labelSpans.some((span) => normLower(span.textContent) === expected);
      }) || null;
    }

    function getValueLabel(rawValue, map) {
      const raw = String(rawValue || "").trim();
      if (!raw) return "";
      const normalized = raw.toLowerCase().replace(/\s+/g, "_");
      return map[raw] || map[normalized] || "";
    }

    async function waitForVisibleOption(value, timeoutMs = 1800) {
      const wanted = normLower(value);
      const started = Date.now();

      while (Date.now() - started < timeoutMs) {
        if (stopRequested()) return null;
        const items = [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="button"]')]
          .filter(vis);

        const match = items.find((item) => {
          const text = normLower(item.innerText || item.textContent);
          return text === wanted || text.startsWith(`${wanted} `);
        });

        if (match) return match;
        await sleep(90);
      }
      return null;
    }

    async function selectMarketplaceDropdown(labelText, optionText) {
      if (stopRequested()) return false;
      const combo = findFacebookCombobox(labelText);
      if (!combo) return false;

      click(combo);
      await sleep(120);
      if (stopRequested()) return false;

      const option = await waitForVisibleOption(optionText);
      if (!option) {
        console.log(`⚠️ ${labelText} option not found: ${optionText}`);
        return false;
      }

      if (stopRequested()) return false;
      click(option);
      await sleep(120);
      return !stopRequested();
    }

    function getSelectedImage() {
      const images = Array.isArray(DATA?.imageDataList) ? DATA.imageDataList : [];
      if (!images.length) return { data: "", index: 0, total: 0 };

      // RUN_IMAGE_INDEX is already resolved by background.js according to the selected
      // Single/Multiple mode. Do not re-check storage mode here, otherwise a stale mode
      // can force every tab back to image 1.
      const index = ((Number(RUN_IMAGE_INDEX) || 0) % images.length + images.length) % images.length;

      return { data: images[index] || "", index, total: images.length };
    }

    function getImageSignature() {
      const selected = getSelectedImage();
      return selected.data ? `${selected.index}:${selected.data.length}:${selected.data.slice(0, 60)}` : "none";
    }

    async function stepImage() {
      if (stopRequested() || DONE.image) return;

      const uploadInput = findUploadInput();
      if (!uploadInput) return;

      if (!DATA?.imageDataList?.length) {
        console.log("ℹ️ No images in storage, skipping upload");
        DONE.image = true;
        return;
      }

      const selectedImage = getSelectedImage();
      const signature = getImageSignature();

      if (window.__AF_IMAGE_UPLOAD_DONE_SIG__ === signature || uploadInput.files?.length > 0 || hasImagePreview()) {
        console.log("⏭️ Image already present/uploaded on this tab, skipping duplicate upload");
        window.__AF_IMAGE_UPLOAD_DONE_SIG__ = signature;
        DONE.image = true;
        return;
      }

      if (window.__AF_IMAGE_UPLOAD_IN_PROGRESS__ === signature) return;

      try {
        window.__AF_IMAGE_UPLOAD_IN_PROGRESS__ = signature;
        const dt = new DataTransfer();
        const response = await fetch(selectedImage.data);
        if (stopRequested()) return;
        if (!response.ok) throw new Error("Image fetch failed");
        const blob = await response.blob();
        const originalName = Array.isArray(DATA?.imageFileNames) ? DATA.imageFileNames[selectedImage.index] : "";
        // Use timestamped unique filename so FB sees each upload as a fresh file
        const ts = Date.now();
        const ext = (originalName || "jpg").split(".").pop() || "jpg";
        const fileName = `listing_${ts}_${selectedImage.index + 1}.${ext}`;
        const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
        dt.items.add(file);

        uploadInput.files = dt.files;
        uploadInput.dispatchEvent(new Event("input", { bubbles: true }));
        uploadInput.dispatchEvent(new Event("change", { bubbles: true }));

        console.log(RUN_IMAGE_MODE === "multiple" ? `✅ Image uploaded (${selectedImage.index + 1}/${selectedImage.total})` : "✅ Image uploaded");
        window.__AF_IMAGE_UPLOAD_DONE_SIG__ = signature;
        DONE.image = true;
      } catch (error) {
        console.log("❌ Image upload failed:", error);
      } finally {
        window.__AF_IMAGE_UPLOAD_IN_PROGRESS__ = null;
      }
    }

    function stepTitle() {
      if (stopRequested() || DONE.title) return;
      if (!DATA?.title) { DONE.title = true; return; }

      const field = findTitleField();
      if (!field) return;

      if (setFieldValue(field, DATA.title)) {
        console.log("✅ Title filled");
        DONE.title = true;
      }
    }

    function stepPrice() {
      if (stopRequested() || DONE.price) return;
      if (!DATA?.price) { DONE.price = true; return; }

      const field = findPriceField();
      if (!field) return;

      if (setFieldValue(field, DATA.price)) {
        console.log("✅ Price filled");
        DONE.price = true;
      }
    }

    async function stepCategory() {
      if (stopRequested() || DONE.category) return;
      const selectedLabel = getValueLabel(DATA?.category, CATEGORY_LABELS);
      if (!selectedLabel) { DONE.category = true; return; }

      if (await selectMarketplaceDropdown("Category", selectedLabel)) {
        console.log(`✅ Category selected: ${selectedLabel}`);
        DONE.category = true;
      }
    }

    async function stepCondition() {
      if (stopRequested() || DONE.condition) return;
      const selectedLabel = getValueLabel(DATA?.condition, CONDITION_LABELS);
      if (!selectedLabel) { DONE.condition = true; return; }

      if (await selectMarketplaceDropdown("Condition", selectedLabel)) {
        console.log(`✅ Condition selected: ${selectedLabel}`);
        DONE.condition = true;
      }
    }

    async function stepAvailability() {
      if (stopRequested() || DONE.availability) return;
      const mode = String(DATA?.availabilityMode || "default").toLowerCase();

      // Preserve the existing Default behaviour: do not touch Facebook's Availability field.
      if (mode !== "in_stock") {
        DONE.availability = true;
        return;
      }

      if (await selectMarketplaceDropdown("Availability", "List as In Stock")) {
        console.log("✅ Availability selected: List as In Stock");
        DONE.availability = true;
      }
    }

    function stepDescription() {
      if (stopRequested() || DONE.description) return;
      if (!DATA?.description) { DONE.description = true; return; }

      const field = findDescriptionField();
      if (!field) return;

      if (setFieldValue(field, DATA.description)) {
        console.log("✅ Description filled");
        DONE.description = true;
      }
    }

    function allDone() {
      return Object.values(DONE).every(Boolean);
    }

    function hasImagePreview() {
      if (!DATA?.imageDataList?.length) return true;
      const input = findUploadInput();
      if (input?.files?.length) return true;
      const images = Array.from(document.querySelectorAll("img"));
      return images.some((image) => (image.src || "").startsWith("blob:") || (image.src || "").startsWith("data:"));
    }

    async function waitAutofillReallyStable(timeoutMs = 1200) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (stopRequested()) return false;
        const titleOk = !DATA?.title || (findTitleField()?.value || "").trim() === String(DATA.title).trim();
        const priceOk = !DATA?.price || (findPriceField()?.value || "").trim() === String(DATA.price).trim();
        const descriptionField = findDescriptionField();
        const descriptionValue = descriptionField ? (descriptionField.value ?? descriptionField.textContent ?? "").trim() : "";
        const descriptionOk = !DATA?.description || descriptionValue === String(DATA.description).trim();
        const imageOk = hasImagePreview();

        if (titleOk && priceOk && descriptionOk && imageOk) {
          await sleep(250);
          return true;
        }
        await sleep(120);
      }
      return true;
    }

    async function tick() {
      if (RUNNING || !DATA || stopRequested()) return;

      RUNNING = true;
      try {
        await stepImage();
        if (stopRequested()) return;
        await humanSleep(120, 350);
        stepTitle();
        if (stopRequested()) return;
        await humanSleep(80, 220);
        stepPrice();
        if (stopRequested()) return;
        await humanSleep(100, 280);
        await stepCategory();
        if (stopRequested()) return;
        await humanSleep(100, 300);
        await stepCondition();
        if (stopRequested()) return;
        await humanSleep(80, 200);
        await stepAvailability();
        if (stopRequested()) return;
        await humanSleep(120, 320);
        stepDescription();

        if (!stopRequested() && allDone()) {
          console.log("🛑 All steps done. Verifying final field commit before tab switch...");
          if (!DONE_NOTIFIED) {
            DONE_NOTIFIED = true;
            const stable = await waitAutofillReallyStable();
            if (!stable || stopRequested()) return;
            try { chrome.runtime.sendMessage({ type: "AF_FILL_DONE", url: location.href, stopEpoch: RUN_STOP_EPOCH }); } catch (e) {}
          }
          if (OBS) OBS.disconnect();
        }
      } catch (error) {
        console.log("❌ tick error:", error);
      } finally {
        RUNNING = false;
      }
    }

    // The background sequence activates each listing tab and explicitly starts autofill
    // with AF_RUN_NOW. Do not auto-run on injection, storage changes, focus, or visibility:
    // those events were causing two overlapping fills and a false “background tab paused” state.
    function loadDataAndTick() {
      if (stopRequested()) return;
      chrome.storage.local.get(
        ["title", "price", "category", "condition", "availabilityMode", "description", "imageMode", "imageDataList", "imageFileNames"],
        (data) => {
          DATA = data;
          // Apply AI overrides if set by background via AF_RUN_NOW message
          if (window.__AF_OVERRIDE_TITLE__)       { DATA.title       = window.__AF_OVERRIDE_TITLE__;       }
          if (window.__AF_OVERRIDE_DESCRIPTION__) { DATA.description = window.__AF_OVERRIDE_DESCRIPTION__; }
          resetDoneFlags();
          console.log("✅ Data loaded for requested autofill:", DATA);
          tick();
        }
      );
    }

    console.log("✅ Autofill engine ready — waiting for background command.");

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "STOP_EXTENSION_WORK") {
        STOP_REQUESTED = true;
        RUNNING = false;
        if (OBS) OBS.disconnect();
        return;
      }
      if (message?.type === "AF_RUN_NOW") {
        RUN_STOP_EPOCH = Number(message.stopEpoch ?? window.__MP_EXT_STOP_EPOCH__ ?? 0);
        RUN_IMAGE_INDEX = Math.max(0, Number(message.imageIndex ?? window.__AF_RUN_IMAGE_INDEX__) || 0);
        RUN_IMAGE_MODE = message.imageMode === "multiple" || window.__AF_RUN_IMAGE_MODE__ === "multiple"
          ? "multiple"
          : "single";
        window.__AF_RUN_IMAGE_INDEX__ = RUN_IMAGE_INDEX;
        window.__AF_RUN_IMAGE_MODE__ = RUN_IMAGE_MODE;
        STOP_REQUESTED = false;
        window.__MP_EXT_STOP_EPOCH__ = RUN_STOP_EPOCH;
        // Store AI overrides on window so loadDataAndTick can apply them
        if (message.overrideTitle)       window.__AF_OVERRIDE_TITLE__       = message.overrideTitle;
        if (message.overrideDescription) window.__AF_OVERRIDE_DESCRIPTION__ = message.overrideDescription;
        console.log(
          RUN_IMAGE_MODE === "multiple"
            ? `🖼️ Assigned image slot ${RUN_IMAGE_INDEX + 1}${message.imageCount ? `/${message.imageCount}` : ""}`
            : "🖼️ Assigned single image slot 1"
        );
        loadDataAndTick();
      }
    });

    let lastTick = 0;
    OBS = new MutationObserver(() => {
      // Before AF_RUN_NOW arrives, this content script must remain idle.
      if (!DATA || DONE_NOTIFIED || stopRequested()) return;
      const now = Date.now();
      if (now - lastTick < 300) return;
      lastTick = now;
      tick();
    });

    OBS.observe(document.documentElement, { childList: true, subtree: true });
  }
}
})();
