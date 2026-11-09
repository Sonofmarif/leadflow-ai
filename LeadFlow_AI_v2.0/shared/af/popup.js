document.addEventListener("DOMContentLoaded", function () {
  function requestParentResize() {
    try { window.parent.postMessage({ type: "SHARED_IFRAME_RESIZE" }, "*"); } catch (e) {}
  }
  requestParentResize();
  setTimeout(requestParentResize, 60);
  setTimeout(requestParentResize, 200);

  const titleInput = document.getElementById("title");
  const priceInput = document.getElementById("price");
  const categorySelect = document.getElementById("category");
  const conditionSelect = document.getElementById("condition");
  const availabilitySelect = document.getElementById("availabilityMode");
  const descTextarea = document.getElementById("description");

  const imageInput = document.getElementById("imageInput");
  const pickFilesBtn = document.getElementById("pickFilesBtn");
  const fileName = document.getElementById("fileName");
  const imageModeToggle = document.getElementById("imageModeToggle");
  const singleModeLabel = document.getElementById("singleModeLabel");
  const multipleModeLabel = document.getElementById("multipleModeLabel");

  const scrapeTabBtn = document.getElementById("scrapeTabBtn");
  const aiWriteBtn = document.getElementById("aiWriteBtn");
  const saveDataBtn = document.getElementById("saveData");
  const statusBanner = document.getElementById("afStatusBanner");
  const statusText = document.getElementById("afStatusText");
  const titleCounter = document.getElementById("titleCounter");

  const photoPreviewSection = document.getElementById("photoPreviewSection");
  const photoPreviewCount = document.getElementById("photoPreviewCount");
  const photoThumbnailStrip = document.getElementById("photoThumbnailStrip");
  const clearAllPhotosBtn = document.getElementById("clearAllPhotosBtn");

  const CATEGORY_VALUES = new Set(["auto_parts", "furniture", "household", "appliances", "tools"]);
  const CONDITION_VALUES = new Set(["new", "used_like_new", "used_good", "used_fair"]);

  let savedImageDataList = [];
  let savedImageFileNames = [];
  let imageMode = "single";

  // Notification Banner Helper
  function showStatus(text, type = "success", duration = 3500) {
    if (!statusBanner || !statusText) return;
    statusText.textContent = text;
    statusBanner.className = `af-status-banner ${type}`;
    statusBanner.classList.remove("hidden");
    requestParentResize();

    clearTimeout(statusBanner._timer);
    statusBanner._timer = setTimeout(() => {
      statusBanner.classList.add("hidden");
      requestParentResize();
    }, duration);
  }

  // Live Title Character Counter
  function updateTitleCounter() {
    if (!titleCounter || !titleInput) return;
    const len = (titleInput.value || "").length;
    titleCounter.textContent = `${len} / 65`;
    titleCounter.classList.toggle("warning", len > 65);
    titleCounter.classList.toggle("danger", len > 95);
  }

  titleInput?.addEventListener("input", updateTitleCounter);

  function setFileBtnState(hasFiles) {
    if (!pickFilesBtn) return;
    pickFilesBtn.classList.toggle("btn-danger", !hasFiles);
    pickFilesBtn.classList.toggle("btn-blue", hasFiles);
  }

  function updateDropdownPlaceholder(select) {
    if (!select) return;
    select.classList.toggle("is-placeholder", !select.value);
  }

  function bindDropdownPlaceholder(select) {
    if (!select) return;
    updateDropdownPlaceholder(select);
    select.addEventListener("change", () => updateDropdownPlaceholder(select));
  }

  bindDropdownPlaceholder(categorySelect);
  bindDropdownPlaceholder(conditionSelect);

  function getSavedImageLabel(dataList = savedImageDataList, nameList = savedImageFileNames) {
    const count = Array.isArray(dataList) ? dataList.length : 0;
    if (!count) return "No photos chosen";
    const names = Array.isArray(nameList) ? nameList.filter(Boolean) : [];
    if (imageMode === "single") return names[0] || "1 saved photo";
    if (count === 1) return names[0] || "1 saved photo";
    return `${count} photos loaded`;
  }

  function applyImageMode(mode, persist = false) {
    imageMode = mode === "multiple" ? "multiple" : "single";
    const isMultiple = imageMode === "multiple";

    if (imageModeToggle) imageModeToggle.checked = isMultiple;
    if (imageInput) imageInput.multiple = isMultiple;
    singleModeLabel?.classList.toggle("active", !isMultiple);
    multipleModeLabel?.classList.toggle("active", isMultiple);

    const text = pickFilesBtn?.querySelector(".btn-text");
    if (text) text.textContent = isMultiple ? "Choose Photos" : "Choose Photo";

    updateFileStatus();
    requestParentResize();

    if (persist) {
      chrome.storage.local.set({ imageMode }, () => {
        if (chrome.runtime.lastError) console.log("image mode storage error:", chrome.runtime.lastError.message);
      });
    }
  }

  // Render Visual Thumbnail Strip
  function renderThumbnailStrip() {
    if (!photoThumbnailStrip || !photoPreviewSection) return;
    const count = Array.isArray(savedImageDataList) ? savedImageDataList.length : 0;

    if (count === 0) {
      photoPreviewSection.classList.add("hidden");
      photoThumbnailStrip.innerHTML = "";
      requestParentResize();
      return;
    }

    photoPreviewSection.classList.remove("hidden");
    if (photoPreviewCount) {
      photoPreviewCount.textContent = `📸 ${count} Photo${count > 1 ? "s" : ""} (De-Hashed)`;
    }

    photoThumbnailStrip.innerHTML = "";
    savedImageDataList.forEach((dataUrl, idx) => {
      const thumb = document.createElement("div");
      thumb.className = "photo-thumb";

      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = `Photo ${idx + 1}`;

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "photo-thumb-del";
      delBtn.title = "Remove photo";
      delBtn.innerHTML = "×";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        savedImageDataList.splice(idx, 1);
        savedImageFileNames.splice(idx, 1);
        chrome.storage.local.set({
          imageDataList: savedImageDataList,
          imageFileNames: savedImageFileNames
        }, () => {
          updateFileStatus();
          renderThumbnailStrip();
          showStatus("Photo removed", "info", 1800);
        });
      });

      thumb.appendChild(img);
      thumb.appendChild(delBtn);
      photoThumbnailStrip.appendChild(thumb);
    });

    requestParentResize();
  }

  clearAllPhotosBtn?.addEventListener("click", () => {
    savedImageDataList = [];
    savedImageFileNames = [];
    chrome.storage.local.set({ imageDataList: [], imageFileNames: [] }, () => {
      updateFileStatus();
      renderThumbnailStrip();
      showStatus("All photos cleared", "info", 1800);
    });
  });

  function updateFileStatus(dataList = savedImageDataList, nameList = savedImageFileNames) {
    const hasSavedImages = Array.isArray(dataList) && dataList.length > 0;
    if (fileName) fileName.textContent = getSavedImageLabel(dataList, nameList);
    setFileBtnState(hasSavedImages);
    renderThumbnailStrip();
  }

  // Canvas Image Optimizer & De-Hasher
  function compressAndDeHashImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e?.target?.result;
        if (!src) { resolve(null); return; }

        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1600;
          let { width, height } = img;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width >= height) {
              height = Math.round((height / width) * MAX_DIM);
              width = MAX_DIM;
            } else {
              width = Math.round((width / height) * MAX_DIM);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // Subtle corner alpha micro-shift to bypass Facebook duplicate image hash detection
          try {
            const pixel = ctx.getImageData(width - 1, height - 1, 1, 1);
            pixel.data[3] = 254 - (Math.floor(Math.random() * 4));
            ctx.putImageData(pixel, width - 1, height - 1);
          } catch(e) {}

          canvas.toBlob((blob) => {
            resolve(blob);
          }, "image/jpeg", 0.92);
        };
        img.onerror = () => resolve(null);
        img.src = src;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function readSelectedImages(files, done) {
    const list = Array.from(files || []);
    if (!list.length) { done([], []); return; }

    const orderedResults = new Array(list.length);
    let processedCount = 0;

    function finishOne() {
      processedCount++;
      if (processedCount !== list.length) return;

      const imageDataList = [];
      const imageFileNames = [];
      const seen = new Set();

      orderedResults.forEach((item) => {
        if (!item?.data || seen.has(item.data)) return;
        seen.add(item.data);
        imageDataList.push(item.data);
        imageFileNames.push(item.name || "photo.jpg");
      });

      done(imageDataList, imageFileNames);
    }

    list.forEach((file, index) => {
      compressAndDeHashImage(file).then((blob) => {
        const targetBlob = blob || file;
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e?.target?.result;
          if (result) {
            const ts = Date.now() + index;
            const ext = (file.name || "photo").split(".").pop() || "jpg";
            orderedResults[index] = { data: result, name: `photo_${ts}.${ext}` };
          }
          finishOne();
        };
        reader.onerror = finishOne;
        reader.readAsDataURL(targetBlob);
      });
    });
  }

  function saveSelectedImages(files, callback) {
    readSelectedImages(files, function (imageDataList, imageFileNames) {
      if (!imageDataList.length) {
        callback && callback(false);
        return;
      }

      savedImageDataList = imageDataList;
      savedImageFileNames = imageFileNames;
      updateFileStatus();

      chrome.storage.local.set({ imageDataList, imageFileNames }, function () {
        if (chrome.runtime.lastError) {
          callback && callback(false, chrome.runtime.lastError.message);
          return;
        }
        callback && callback(true);
      });
    });
  }

  if (imageModeToggle) {
    imageModeToggle.addEventListener("change", () => {
      applyImageMode(imageModeToggle.checked ? "multiple" : "single", true);
    });
  }

  if (pickFilesBtn && imageInput) {
    pickFilesBtn.addEventListener("click", () => imageInput.click());

    imageInput.addEventListener("change", () => {
      const files = Array.from(imageInput.files || []);
      if (!files.length) {
        updateFileStatus();
        return;
      }
      showStatus(`Optimizing ${files.length} photo(s)...`, "info", 1500);
      saveSelectedImages(files, (ok) => {
        if (ok) showStatus(`✅ Added ${files.length} photo(s) (De-Hashed)`, "success");
      });
    });
  }

  function setBtnState(btn, text, disabled) {
    if (!btn) return;
    const span = btn.querySelector(".btn-text");
    if (span) span.textContent = text;
    else btn.textContent = text;
    btn.disabled = !!disabled;
  }

  function restoreButton(btn, text, ms = 1500) {
    setTimeout(() => setBtnState(btn, text, false), ms);
  }

  function safeSelectValue(select, value, allowedValues) {
    if (!select) return;
    select.value = allowedValues.has(value) ? value : "";
    updateDropdownPlaceholder(select);
  }

  function saveCurrentData(callback) {
    const title = titleInput?.value.trim() || "";
    const price = priceInput?.value.trim() || "";
    const category = CATEGORY_VALUES.has(categorySelect?.value) ? categorySelect.value : "";
    const condition = CONDITION_VALUES.has(conditionSelect?.value) ? conditionSelect.value : "";
    const availabilityMode = availabilitySelect?.value || "default";
    const description = descTextarea?.value.trim() || "";

    chrome.storage.local.set({
      title,
      price,
      category,
      condition,
      availabilityMode,
      description,
      imageMode,
      imageDataList: savedImageDataList,
      imageFileNames: savedImageFileNames
    }, function () {
      if (chrome.runtime.lastError) {
        callback && callback(false, chrome.runtime.lastError.message);
        return;
      }
      updateFileStatus();
      callback && callback(true);
    });
  }

  // Load existing stored data
  chrome.storage.local.get(
    ["title", "price", "category", "condition", "availabilityMode", "description", "imageMode", "imageDataList", "imageFileNames"],
    function (data) {
      if (chrome.runtime.lastError) return;

      if (titleInput && data.title) titleInput.value = data.title;
      if (priceInput && data.price) priceInput.value = data.price;
      if (descTextarea && data.description) descTextarea.value = data.description;

      safeSelectValue(categorySelect, data.category || "", CATEGORY_VALUES);
      safeSelectValue(conditionSelect, data.condition || "", CONDITION_VALUES);

      if (availabilitySelect) availabilitySelect.value = data.availabilityMode || "default";

      savedImageDataList = Array.isArray(data.imageDataList) ? data.imageDataList : [];
      savedImageFileNames = Array.isArray(data.imageFileNames) ? data.imageFileNames : [];
      applyImageMode(data.imageMode || "single", false);
      updateFileStatus();
      updateTitleCounter();
      requestParentResize();
    }
  );

  // 💾 Save Button
  if (saveDataBtn) {
    saveDataBtn.addEventListener("click", function () {
      setBtnState(saveDataBtn, "Saving...", true);
      saveCurrentData(function (ok) {
        if (!ok) {
          setBtnState(saveDataBtn, "Error ❌", true);
          restoreButton(saveDataBtn, "Save", 1700);
          showStatus("Error saving listing data", "error");
          return;
        }
        setBtnState(saveDataBtn, "Saved ✅", true);
        restoreButton(saveDataBtn, "Save", 1500);
        showStatus("✅ Listing data saved successfully!", "success");
      });
    });
  }

  // 📥 1-Click Listing & Photo Scraper
  if (scrapeTabBtn) {
    scrapeTabBtn.addEventListener("click", function () {
      setBtnState(scrapeTabBtn, "Scraping...", true);
      showStatus("🔍 Scraping active tab for listing & photos...", "info", 5000);

      chrome.runtime.sendMessage({ type: "SCRAPE_ACTIVE_LISTING" }, function (res) {
        if (chrome.runtime.lastError || !res) {
          setBtnState(scrapeTabBtn, "Error ❌", true);
          restoreButton(scrapeTabBtn, "Scrape Tab", 1800);
          showStatus("❌ Failed to scrape active tab.", "error");
          return;
        }

        if (!res.ok) {
          setBtnState(scrapeTabBtn, "Failed ❌", true);
          restoreButton(scrapeTabBtn, "Scrape Tab", 2000);
          showStatus(`❌ ${res.error || "No listing found on active tab"}`, "error", 4500);
          return;
        }

        const item = res.listing;
        if (titleInput && item.title) titleInput.value = item.title;
        if (priceInput && item.price) priceInput.value = item.price;
        if (descTextarea && item.description) descTextarea.value = item.description;

        if (Array.isArray(item.imageDataList) && item.imageDataList.length) {
          savedImageDataList = item.imageDataList;
          savedImageFileNames = item.imageFileNames || [];
        }

        updateTitleCounter();
        updateFileStatus();
        saveCurrentData(() => {});

        setBtnState(scrapeTabBtn, "Done ✅", true);
        restoreButton(scrapeTabBtn, "Scrape Tab", 1800);

        const imgCount = item.imagesScraped || 0;
        showStatus(`✅ Scraped ${imgCount} photo(s) & listing details! Ready to rewrite/post.`, "success", 4500);
      });
    });
  }

  // ✨ AI Magic Write Button
  if (aiWriteBtn) {
    aiWriteBtn.addEventListener("click", function () {
      setBtnState(aiWriteBtn, "Writing...", true);
      showStatus("✨ AI is generating high-converting copy...", "info", 6000);

      const baseTitle = titleInput?.value.trim() || "";
      const baseDesc = descTextarea?.value.trim() || "";

      chrome.runtime.sendMessage({
        type: "AI_WRITE_LISTING",
        baseTitle,
        baseDescription: baseDesc
      }, function (res) {
        if (chrome.runtime.lastError || !res) {
          setBtnState(aiWriteBtn, "AI Error ❌", true);
          restoreButton(aiWriteBtn, "AI Write", 1800);
          showStatus("❌ AI connection error.", "error");
          return;
        }

        if (!res.ok) {
          setBtnState(aiWriteBtn, "No Key ❌", true);
          restoreButton(aiWriteBtn, "AI Write", 2000);
          showStatus(`❌ ${res.error || "AI generation failed"}`, "error", 5000);
          return;
        }

        if (res.title && titleInput) titleInput.value = res.title;
        if (res.description && descTextarea) descTextarea.value = res.description;

        updateTitleCounter();
        saveCurrentData(() => {});

        setBtnState(aiWriteBtn, "Done ✅", true);
        restoreButton(aiWriteBtn, "AI Write", 1800);

        const info = res.modelUsed ? `(${res.modelUsed} • ${res.latencyMs || 0}ms)` : "";
        showStatus(`✅ AI Generated high-converting listing! ${info}`, "success", 4000);
      });
    });
  }
});
