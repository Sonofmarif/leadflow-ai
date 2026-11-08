document.addEventListener("DOMContentLoaded", function () {
  function requestParentResize() {
    try { window.parent.postMessage({ type: "SHARED_IFRAME_RESIZE" }, "*"); } catch (e) {}
  }
  requestParentResize();
  setTimeout(requestParentResize, 80);
  setTimeout(requestParentResize, 250);

  const imageInput = document.getElementById("imageInput");
  const pickFilesBtn = document.getElementById("pickFilesBtn");
  const fileName = document.getElementById("fileName");
  const imageModeToggle = document.getElementById("imageModeToggle");
  const singleModeLabel = document.getElementById("singleModeLabel");
  const multipleModeLabel = document.getElementById("multipleModeLabel");
  const categorySelect = document.getElementById("category");
  const conditionSelect = document.getElementById("condition");
  const aiWriteBtn = document.getElementById("aiWriteBtn");

  const CATEGORY_VALUES = new Set(["auto_parts", "furniture", "household", "appliances", "tools"]);
  const CONDITION_VALUES = new Set(["new", "used_like_new", "used_good", "used_fair"]);

  let savedImageDataList = [];
  let savedImageFileNames = [];
  let imageMode = "single";

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
    if (!count) return "No files chosen";

    const names = Array.isArray(nameList) ? nameList.filter(Boolean) : [];
    if (imageMode === "single") return names[0] || "1 saved image";
    if (count === 1) return names[0] || "1 saved image";
    return `${count} saved images`;
  }

  function applyImageMode(mode, persist = false) {
    imageMode = mode === "multiple" ? "multiple" : "single";
    const isMultiple = imageMode === "multiple";

    if (imageModeToggle) imageModeToggle.checked = isMultiple;
    if (imageInput) imageInput.multiple = isMultiple;
    singleModeLabel?.classList.toggle("active", !isMultiple);
    multipleModeLabel?.classList.toggle("active", isMultiple);

    const text = pickFilesBtn?.querySelector(".btn-text");
    if (text) text.textContent = isMultiple ? "Choose Images" : "Choose Image";

    updateFileStatus();
    requestParentResize();

    if (persist) {
      chrome.storage.local.set({ imageMode }, () => {
        if (chrome.runtime.lastError) {
          console.log("image mode storage.set lastError:", chrome.runtime.lastError.message);
        }
      });
    }
  }

  function updateFileStatus(dataList = savedImageDataList, nameList = savedImageFileNames) {
    const hasSavedImages = Array.isArray(dataList) && dataList.length > 0;
    if (fileName) fileName.textContent = getSavedImageLabel(dataList, nameList);
    setFileBtnState(hasSavedImages);
  }

  // =========================================================
  // Canvas Image Optimizer — compressAndDeHashImage
  // Resizes to max 1600px, JPEG 0.92 quality, adds 1-pixel
  // alpha variation so FB duplicate-hash detector is bypassed.
  // =========================================================
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

          // Apply subtle 1-pixel alpha variation so FB image hash detector
          // sees each upload as a unique image even if the source is the same.
          const pixel = ctx.getImageData(width - 1, height - 1, 1, 1);
          pixel.data[3] = 254 - (Math.floor(Math.random() * 3)); // 251-254 alpha jitter
          ctx.putImageData(pixel, width - 1, height - 1);

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
        imageFileNames.push(item.name || "saved image");
      });

      done(imageDataList, imageFileNames);
    }

    list.forEach((file, index) => {
      compressAndDeHashImage(file).then((blob) => {
        if (!blob) {
          // Fallback to raw FileReader if canvas fails
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e?.target?.result;
            if (result) {
              // Timestamped unique filename to further bypass hash detection
              const ts = Date.now() + index;
              const ext = (file.name || "img").split(".").pop() || "jpg";
              orderedResults[index] = { data: result, name: `listing_${ts}.${ext}` };
            }
            finishOne();
          };
          reader.onerror = finishOne;
          reader.readAsDataURL(file);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e?.target?.result;
          if (result) {
            const ts = Date.now() + index;
            const ext = (file.name || "img").split(".").pop() || "jpg";
            orderedResults[index] = { data: result, name: `listing_${ts}.${ext}` };
          }
          finishOne();
        };
        reader.onerror = finishOne;
        reader.readAsDataURL(blob);
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
          console.log("image storage.set lastError:", chrome.runtime.lastError.message);
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

  if (pickFilesBtn && imageInput && fileName) {
    updateFileStatus();

    pickFilesBtn.addEventListener("click", () => imageInput.click());

    imageInput.addEventListener("change", () => {
      const files = Array.from(imageInput.files || []);
      if (!files.length) {
        updateFileStatus();
        return;
      }

      fileName.textContent = files.length === 1 ? files[0].name : `${files.length} files selected`;
      setFileBtnState(true);
      saveSelectedImages(files);
    });
  }

  function setBtnState(btnId, text, disabled) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const span = btn.querySelector(".btn-text");
    if (span) span.textContent = text;
    else btn.textContent = text;

    btn.disabled = !!disabled;
  }

  function restoreButton(btnId, text, ms = 1500) {
    setTimeout(() => setBtnState(btnId, text, false), ms);
  }

  function safeSelectValue(select, value, allowedValues) {
    if (!select) return;
    select.value = allowedValues.has(value) ? value : "";
    updateDropdownPlaceholder(select);
  }

  function saveCurrentData(callback) {
    const title = document.getElementById("title").value.trim();
    const price = document.getElementById("price").value.trim();
    const category = CATEGORY_VALUES.has(categorySelect?.value) ? categorySelect.value : "";
    const condition = CONDITION_VALUES.has(conditionSelect?.value) ? conditionSelect.value : "";
    const availabilityMode = document.getElementById("availabilityMode").value || "default";
    const description = document.getElementById("description").value.trim();
    const fileInput = document.getElementById("imageInput");

    function saveAllData(imageDataList, imageFileNames) {
      savedImageDataList = Array.isArray(imageDataList) ? imageDataList : [];
      savedImageFileNames = Array.isArray(imageFileNames) ? imageFileNames : [];

      chrome.storage.local.set(
        {
          title,
          price,
          category,
          condition,
          availabilityMode,
          description,
          imageMode,
          imageDataList: savedImageDataList,
          imageFileNames: savedImageFileNames
        },
        function () {
          if (chrome.runtime.lastError) {
            console.log("storage.set lastError:", chrome.runtime.lastError.message);
            callback && callback(false, chrome.runtime.lastError.message);
            return;
          }

          updateFileStatus();
          callback && callback(true);
        }
      );
    }

    // File inputs reset when the popup closes; preserve previously saved images.
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      readSelectedImages(fileInput.files, saveAllData);
    } else {
      saveAllData(savedImageDataList, savedImageFileNames);
    }
  }

  chrome.storage.local.get(
    ["title", "price", "category", "condition", "availabilityMode", "description", "imageMode", "imageDataList", "imageFileNames"],
    function (data) {
      if (chrome.runtime.lastError) {
        console.log("storage.get lastError:", chrome.runtime.lastError.message);
        return;
      }

      if (data.title) document.getElementById("title").value = data.title;
      if (data.price) document.getElementById("price").value = data.price;
      if (data.description) document.getElementById("description").value = data.description;

      safeSelectValue(categorySelect, data.category || "", CATEGORY_VALUES);
      safeSelectValue(conditionSelect, data.condition || "", CONDITION_VALUES);

      const availabilitySelect = document.getElementById("availabilityMode");
      if (availabilitySelect) availabilitySelect.value = data.availabilityMode || "default";

      savedImageDataList = Array.isArray(data.imageDataList) ? data.imageDataList : [];
      savedImageFileNames = Array.isArray(data.imageFileNames) ? data.imageFileNames : [];
      applyImageMode(data.imageMode || "single", false);
      updateFileStatus();

      if (!data.availabilityMode) chrome.storage.local.set({ availabilityMode: "default" });
      if (!data.imageMode) chrome.storage.local.set({ imageMode: "single" });
      requestParentResize();
    }
  );

  // 💾 Save Data button
  const saveDataBtn = document.getElementById("saveData");
  if (saveDataBtn) {
    saveDataBtn.addEventListener("click", function () {
      setBtnState("saveData", "Saving...", true);
      saveCurrentData(function (ok) {
        if (!ok) {
          setBtnState("saveData", "Error ❌", true);
          restoreButton("saveData", "💾 Save Data", 1700);
          return;
        }
        setBtnState("saveData", "Saved ✅", true);
        restoreButton("saveData", "💾 Save Data", 1500);
      });
    });
  }

  // ✨ AI Write button — calls background to generate AI listing
  if (aiWriteBtn) {
    aiWriteBtn.addEventListener("click", function () {
      setBtnState("aiWriteBtn", "⏳ Writing...", true);

      chrome.runtime.sendMessage({ type: "AI_WRITE_LISTING" }, function (res) {
        if (chrome.runtime.lastError || !res) {
          setBtnState("aiWriteBtn", "❌ AI Error", true);
          restoreButton("aiWriteBtn", "✨ AI Write", 2000);
          return;
        }
        if (!res.ok) {
          console.warn("AI Write failed:", res.error);
          setBtnState("aiWriteBtn", "❌ " + (res.error?.slice(0, 22) || "No Key"), true);
          restoreButton("aiWriteBtn", "✨ AI Write", 2200);
          return;
        }

        const titleEl = document.getElementById("title");
        const descEl = document.getElementById("description");

        if (res.title && titleEl) titleEl.value = res.title;
        if (res.description && descEl) descEl.value = res.description;

        setBtnState("aiWriteBtn", "✅ AI Done!", true);
        restoreButton("aiWriteBtn", "✨ AI Write", 1800);
      });
    });
  }
});
