export function createReplayControls({ state, dom, buildFromVisible }) {
  let replayTimer = null;

  function stopReplay() {
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
  }

  function applySliderValue(rawValue) {
    if (!dom.timeSlider) return;
    const idx = Number(rawValue ?? dom.timeSlider.value) - 1;
    const max = state.snapshots.length;
    const safeIdx = Math.min(Math.max(idx, 0), Math.max(max - 1, 0));
    dom.timeSlider.value = String(safeIdx + 1);
    state.visibleSnapshots = state.snapshots.slice(0, safeIdx + 1);
    state.visibleEvents = Array.isArray(state.events)
      ? state.events.slice(0, safeIdx + 1)
      : state.visibleSnapshots.map((raw) => ({ raw, id: null }));
    if (dom.timeLabel) {
      dom.timeLabel.textContent = `Point ${safeIdx + 1} / ${max}`;
    }
    buildFromVisible();
  }

  function startReplay() {
    if (!dom.timeSlider || state.snapshots.length <= 1) return;
    stopReplay();
    applySliderValue(1);
    let current = 1;
    const max = state.snapshots.length;
    replayTimer = setInterval(() => {
      current += 1;
      if (current > max) {
        stopReplay();
        return;
      }
      applySliderValue(current);
    }, 1000);
  }

  function syncSlider() {
    if (!dom.timeSlider || !dom.sliderRow) return;

    if (state.snapshots.length > 1) {
      dom.sliderRow.style.display = "flex";
      dom.timeSlider.min = "1";
      dom.timeSlider.max = String(state.snapshots.length);
      dom.timeSlider.value = String(state.snapshots.length);
      if (dom.timeLabel) {
        dom.timeLabel.textContent = `Point ${state.snapshots.length} / ${state.snapshots.length}`;
      }
    } else {
      dom.sliderRow.style.display = "none";
      stopReplay();
    }
  }

  return {
    stopReplay,
    applySliderValue,
    startReplay,
    syncSlider
  };
}
