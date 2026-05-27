export const DISPLAY_TOGGLE_STORAGE_KEY = 'bridge_task_locate_display_toggles';
export const MASK_UI_STORAGE_KEY = 'bridge_task_locate_mask_ui';

export const loadDisplayTogglePrefs = () => {
  try {
    const raw = localStorage.getItem(DISPLAY_TOGGLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    return {
      showBridgeRange: !!parsed.showBridgeRange,
      showCenterline: !!parsed.showCenterline,
      showLightDirection: !!parsed.showLightDirection,
      showImpactRange: !!parsed.showImpactRange,
      showMask: !!parsed.showMask,
    };
  } catch {
    return null;
  }
};

export const loadMaskUiPrefs = () => {
  try {
    const raw = localStorage.getItem(MASK_UI_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const clampValue = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const opacityRaw = typeof parsed.maskOpacity === 'number' ? parsed.maskOpacity : Number(parsed.maskOpacity);
    const brushRaw = typeof parsed.brushSize === 'number' ? parsed.brushSize : Number(parsed.brushSize);
    const toolbarRaw = typeof parsed.toolbarWidth === 'number' ? parsed.toolbarWidth : Number(parsed.toolbarWidth);
    return {
      maskOpacity: Number.isFinite(opacityRaw) ? clampValue(opacityRaw, 0, 1) : 0.5,
      brushSize: Number.isFinite(brushRaw) ? clampValue(brushRaw, 2, 80) : 24,
      toolbarWidth: Number.isFinite(toolbarRaw) ? clampValue(toolbarRaw, 160, 360) : 220,
    };
  } catch {
    return null;
  }
};