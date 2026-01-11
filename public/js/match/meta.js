import { serverTeamFromServerField } from "../stats.js";

function formatLocalDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDatetimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeMatchCost(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatMatchCost(value) {
  const num = normalizeMatchCost(value);
  if (num === null) return "";
  return `\u20ac${num.toFixed(2)}`;
}

function normalizeMatchLevel(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed || null;
}

function ensureSelectHasValue(selectEl, value, label) {
  if (!selectEl || !value) return;
  const exists = Array.from(selectEl.options).some((opt) => opt.value === value);
  if (exists) return;
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label || value;
  selectEl.appendChild(opt);
}

function getMetaButtonLabel(state) {
  const hasMeta =
    Boolean(state.matchNote && state.matchNote.trim()) ||
    Boolean(state.matchType) ||
    Boolean(state.matchLocation) ||
    Boolean(state.scheduledAt) ||
    Boolean(state.matchLevel) ||
    state.matchCost !== null;
  return hasMeta ? "Edit match info" : "Add match info";
}

export function createMetaHandlers({ state, dom, setStatus, setError, clearError }) {
  function updateMatchMeta(meta = {}) {
    if (Object.prototype.hasOwnProperty.call(meta, "note")) {
      state.matchNote = typeof meta.note === "string" ? meta.note : "";
    }
    if (Object.prototype.hasOwnProperty.call(meta, "matchType")) {
      state.matchType = meta.matchType ? { ...meta.matchType } : null;
    }
    if (Object.prototype.hasOwnProperty.call(meta, "matchLocation")) {
      state.matchLocation = meta.matchLocation ? { ...meta.matchLocation } : null;
    }
    if (Array.isArray(meta.matchTypeOptions)) {
      state.matchTypeOptions = meta.matchTypeOptions.map((opt) => ({
        id: opt.id,
        name: opt.name,
        iconUrl: opt.iconUrl || null
      }));
    }
    if (Array.isArray(meta.matchLocationOptions)) {
      state.matchLocationOptions = meta.matchLocationOptions.map((opt) => ({
        id: opt.id,
        name: opt.name,
        logoUrl: opt.logoUrl || null
      }));
    }
    if (Object.prototype.hasOwnProperty.call(meta, "status")) {
      state.matchStatus = meta.status || null;
    }
    if (Object.prototype.hasOwnProperty.call(meta, "winnerTeam")) {
      const winner = Number(meta.winnerTeam);
      state.winnerTeam = Number.isFinite(winner) ? winner : null;
    }
    if (Object.prototype.hasOwnProperty.call(meta, "finishedAt")) {
      state.finishedAt = meta.finishedAt || null;
    }
    if (Object.prototype.hasOwnProperty.call(meta, "scheduledAt")) {
      state.scheduledAt = meta.scheduledAt || null;
    }
    if (Object.prototype.hasOwnProperty.call(meta, "matchLevel")) {
      state.matchLevel = normalizeMatchLevel(meta.matchLevel);
    }
    if (Object.prototype.hasOwnProperty.call(meta, "matchCost")) {
      const normalizedCost = normalizeMatchCost(meta.matchCost);
      state.matchCost = normalizedCost;
    }

    state.isMatchFinished = state.matchStatus === "finished";

    syncMatchMetaDisplay();
    if (dom.matchMetaForm?.style.display === "block") {
      syncMatchMetaForm();
    }
  }

  function syncMatchMetaDisplay() {
    if (dom.noteDisplay) {
      dom.noteDisplay.textContent = state.matchNote || "-";
    }
    if (dom.matchTypeDisplay) {
      dom.matchTypeDisplay.textContent = state.matchType?.name || "-";
    }
    if (dom.matchLocationDisplay) {
      dom.matchLocationDisplay.textContent = state.matchLocation?.name || "-";
    }
    if (dom.scheduledAtDisplay) {
      const formatted = formatLocalDateTime(state.scheduledAt);
      dom.scheduledAtDisplay.textContent = formatted || "-";
    }
    if (dom.matchLevelDisplay) {
      dom.matchLevelDisplay.textContent = state.matchLevel || "-";
    }
    if (dom.matchCostDisplay) {
      const costLabel = formatMatchCost(state.matchCost);
      dom.matchCostDisplay.textContent = costLabel || "-";
    }

    if (dom.matchTypeIcon) {
      if (state.matchType?.iconUrl) {
        dom.matchTypeIcon.src = state.matchType.iconUrl;
        dom.matchTypeIcon.style.display = "inline-block";
      } else {
        dom.matchTypeIcon.removeAttribute("src");
        dom.matchTypeIcon.style.display = "none";
      }
    }

    if (dom.matchLocationLogo) {
      if (state.matchLocation?.logoUrl) {
        dom.matchLocationLogo.src = state.matchLocation.logoUrl;
        dom.matchLocationLogo.style.display = "inline-block";
      } else {
        dom.matchLocationLogo.removeAttribute("src");
        dom.matchLocationLogo.style.display = "none";
      }
    }

    if (dom.editMetaBtn && dom.matchMetaForm?.style.display !== "block") {
      dom.editMetaBtn.textContent = getMetaButtonLabel(state);
    }
  }

  function populateMetaSelect(selectEl, options, currentId, emptyLabel) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = emptyLabel;
    selectEl.appendChild(defaultOpt);

    options.forEach((opt) => {
      const optionEl = document.createElement("option");
      optionEl.value = String(opt.id);
      optionEl.textContent = opt.name;
      selectEl.appendChild(optionEl);
    });

    const newOpt = document.createElement("option");
    newOpt.value = "__new__";
    newOpt.textContent = "Add new...";
    selectEl.appendChild(newOpt);

    if (currentId) {
      selectEl.value = String(currentId);
    } else {
      selectEl.value = "";
    }
  }

  function handleMetaSelectChange(kind) {
    const select = kind === "type" ? dom.matchTypeSelect : dom.matchLocationSelect;
    const input = kind === "type" ? dom.matchTypeNewInput : dom.matchLocationNewInput;
    if (!select || !input) return;
    const isNew = select.value === "__new__";
    input.style.display = isNew ? "block" : "none";
    if (!isNew) input.value = "";
    if (isNew) {
      input.focus();
    }
  }

  function syncMatchMetaForm() {
    if (dom.matchTypeSelect) {
      populateMetaSelect(
        dom.matchTypeSelect,
        state.matchTypeOptions,
        state.matchType?.id || null,
        "No match type"
      );
    }
    if (dom.matchLocationSelect) {
      populateMetaSelect(
        dom.matchLocationSelect,
        state.matchLocationOptions,
        state.matchLocation?.id || null,
        "No location"
      );
    }
    if (dom.scheduledAtInput) {
      dom.scheduledAtInput.value = formatDatetimeLocalValue(state.scheduledAt);
    }
    if (dom.matchLevelSelect) {
      if (state.matchLevel) {
        ensureSelectHasValue(dom.matchLevelSelect, state.matchLevel, state.matchLevel);
      }
      dom.matchLevelSelect.value = state.matchLevel || "";
    }
    if (dom.matchCostInput) {
      dom.matchCostInput.value =
        state.matchCost === null || state.matchCost === undefined ? "" : String(state.matchCost);
    }
    if (dom.noteInput) {
      dom.noteInput.value = state.matchNote || "";
    }
    handleMetaSelectChange("type");
    handleMetaSelectChange("location");
  }

  function toggleMatchMetaForm(force) {
    if (!dom.matchMetaForm) return;
    const isOpen = dom.matchMetaForm.style.display === "block";
    const show = typeof force === "boolean" ? force : !isOpen;
    dom.matchMetaForm.style.display = show ? "block" : "none";
    if (dom.editMetaBtn) {
      dom.editMetaBtn.textContent = show ? "Close match info editor" : getMetaButtonLabel(state);
    }
    if (show) {
      syncMatchMetaForm();
    } else {
      if (dom.matchTypeNewInput) dom.matchTypeNewInput.value = "";
      if (dom.matchLocationNewInput) dom.matchLocationNewInput.value = "";
    }
  }

  async function handleSaveMatchMeta(options = {}) {
    if (!state.currentMatchId) return null;
    const applyToAll = Boolean(options.applyToAll);
    clearError?.();

    const payload = {
      note: dom.noteInput?.value ?? ""
    };
    if (applyToAll) {
      payload.applyToAllMissing = true;
    }

    if (dom.matchTypeSelect) {
      const selection = dom.matchTypeSelect.value;
      if (selection === "__new__") {
        const newName = (dom.matchTypeNewInput?.value || "").trim();
        if (!newName) {
          setError?.("Enter a match type name.");
          return;
        }
        payload.matchTypeName = newName;
        payload.matchTypeId = null;
      } else if (selection === "") {
        payload.matchTypeId = null;
      } else {
        const parsed = Number(selection);
        if (!Number.isFinite(parsed)) {
          setError?.("Invalid match type selected.");
          return;
        }
        payload.matchTypeId = parsed;
      }
    }

    if (dom.matchLocationSelect) {
      const selection = dom.matchLocationSelect.value;
      if (selection === "__new__") {
        const newName = (dom.matchLocationNewInput?.value || "").trim();
        if (!newName) {
          setError?.("Enter a location name.");
          return;
        }
        payload.matchLocationName = newName;
        payload.matchLocationId = null;
      } else if (selection === "") {
        payload.matchLocationId = null;
      } else {
        const parsed = Number(selection);
        if (!Number.isFinite(parsed)) {
          setError?.("Invalid location selected.");
          return;
        }
        payload.matchLocationId = parsed;
      }
    }

    if (dom.scheduledAtInput) {
      const raw = (dom.scheduledAtInput.value || "").trim();
      if (raw) {
        const parsedDate = new Date(raw);
        if (Number.isNaN(parsedDate.getTime())) {
          setError?.("Enter a valid scheduled date and time.");
          return;
        }
        payload.scheduledAt = parsedDate.toISOString();
      } else {
        payload.scheduledAt = null;
      }
    }

    if (dom.matchLevelSelect) {
      const levelValue = dom.matchLevelSelect.value;
      payload.matchLevel = levelValue ? normalizeMatchLevel(levelValue) : null;
    }

    if (dom.matchCostInput) {
      const rawCost = (dom.matchCostInput.value || "").trim();
      if (rawCost === "") {
        payload.matchCost = null;
      } else {
        const parsedCost = Number(rawCost);
        if (!Number.isFinite(parsedCost)) {
          setError?.("Enter a valid match cost.");
          return;
        }
        payload.matchCost = Math.round(parsedCost * 100) / 100;
      }
    }

    try {
      const res = await fetch(`/api/match/${state.currentMatchId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      updateMatchMeta({
        note: data.note ?? payload.note,
        matchType: data.matchType ?? null,
        matchLocation: data.matchLocation ?? null,
        matchTypeOptions: data.matchTypeOptions || state.matchTypeOptions,
        matchLocationOptions: data.matchLocationOptions || state.matchLocationOptions,
        status: data.status ?? state.matchStatus,
        winnerTeam: data.winnerTeam ?? state.winnerTeam,
        finishedAt: data.finishedAt ?? state.finishedAt,
        scheduledAt: data.scheduledAt ?? payload.scheduledAt ?? state.scheduledAt,
        matchLevel: data.matchLevel ?? payload.matchLevel ?? state.matchLevel,
        matchCost: data.matchCost ?? payload.matchCost ?? state.matchCost
      });
      toggleMatchMetaForm(false);
      const appliedToMissingCount = Number(data.appliedToMissingCount || 0);
      const missingMetaCount =
        typeof data.missingMetaCount === "number"
          ? data.missingMetaCount
          : state.missingMetaCount ?? 0;
      state.missingMetaCount = missingMetaCount;
      if (applyToAll) {
        const suffix =
          appliedToMissingCount > 0
            ? `Applied to ${appliedToMissingCount} other match${
                appliedToMissingCount === 1 ? "" : "es"
              }.`
            : "No other infoless matches found.";
        setStatus?.(`Match info saved. ${suffix}`);
      } else {
        setStatus?.("Match info saved.");
      }
      return { appliedToMissingCount, missingMetaCount };
    } catch (err) {
      console.error("Failed to save match info:", err);
      setError?.(`Failed to save match info: ${err.message}`);
      return null;
    }
  }

  return {
    updateMatchMeta,
    syncMatchMetaDisplay,
    populateMetaSelect,
    handleMetaSelectChange,
    syncMatchMetaForm,
    toggleMatchMetaForm,
    handleSaveMatchMeta,
    getMetaButtonLabel: () => getMetaButtonLabel(state),
    formatMatchCost,
    formatLocalDateTime,
    formatDatetimeLocalValue,
    serverTeamFromServerField
  };
}
