import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface PanelBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minW: number;
  minH: number;
  visible: boolean;
  zIndex: number;
}

export interface SavedLayoutPreset {
  name: string;
  panels: Record<string, { x: number; y: number; width: number; height: number; visible: boolean }>;
}

const STORAGE_KEY = 'monolith_layout_geometry_v1';
const PRESETS_KEY = 'monolith_saved_layout_presets_v1';

// Initial default positions calibrated for standard 1080p+ decks
const createDefaultPanels = (vw: number, vh: number): Record<string, PanelBounds> => {
  const margin = 8;
  const headerOffset = 46;
  const availH = vh - headerOffset - margin * 2;
  const availW = vw - margin * 2;

  const leftColW = Math.min(380, Math.floor(availW * 0.28));
  const rightColW = Math.min(460, Math.floor(availW * 0.32));
  const centerColW = availW - leftColW - rightColW - margin * 2;

  const topRowH = Math.floor(availH * 0.46);
  const bottomRowH = availH - topRowH - margin;

  return {
    music: {
      id: 'music',
      x: margin,
      y: margin,
      width: leftColW,
      height: availH,
      minW: 300,
      minH: 260,
      visible: true,
      zIndex: 10,
    },
    visualizer: {
      id: 'visualizer',
      x: margin + leftColW + margin,
      y: margin,
      width: centerColW,
      height: topRowH,
      minW: 320,
      minH: 140,
      visible: true,
      zIndex: 10,
    },
    monitor: {
      id: 'monitor',
      x: margin + leftColW + margin,
      y: margin + topRowH + margin,
      width: centerColW,
      height: bottomRowH,
      minW: 320,
      minH: 180,
      visible: true,
      zIndex: 10,
    },
    telemetry: {
      id: 'telemetry',
      x: vw - margin - rightColW,
      y: margin,
      width: rightColW,
      height: topRowH,
      minW: 280,
      minH: 140,
      visible: true,
      zIndex: 10,
    },
    explorer: {
      id: 'explorer',
      x: vw - margin - rightColW,
      y: margin + topRowH + margin,
      width: rightColW,
      height: bottomRowH,
      minW: 320,
      minH: 220,
      visible: true,
      zIndex: 10,
    },
    remote: {
      id: 'remote',
      x: margin + leftColW + 24,
      y: margin + 30,
      width: 380,
      height: 520,
      minW: 320,
      minH: 420,
      visible: true,
      zIndex: 25,
    },
  };
};



// Helper function
export const clampPanelsToViewport = (
  currentPanels: Record<string, PanelBounds>,
  scale: number = 1.0
): Record<string, PanelBounds> => {
  const headerHeight = 46;
  const margin = 8;
  // Compute effective logical canvas bounds under the active zoom scale
  const availW = (window.innerWidth / scale) - margin;
  const availH = (window.innerHeight / scale) - margin;

  const clamped: Record<string, PanelBounds> = {};

  Object.values(currentPanels).forEach((p) => {
    let { x, y, width, height } = p;

    // Ensure width and height do not exceed available area
    width = Math.min(width, availW - margin);
    height = Math.min(height, availH - headerHeight);

    // Keep right and bottom edges within visible canvas
    if (x + width > availW) {
      x = Math.max(margin, availW - width);
    }
    if (y + height > availH) {
      y = Math.max(margin, availH - height);
    }

    clamped[p.id] = { ...p, x, y, width, height };
  });

  return clamped;
};











export function useLayoutManager() {
  const [panels, setPanels] = useState<Record<string, PanelBounds>>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const defaults = createDefaultPanels(vw, vh);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Force merge: all defaults exist, and saved overrides apply where available
        const merged: Record<string, PanelBounds> = { ...defaults };
        Object.keys(parsed).forEach((k) => {
          if (merged[k]) {
            merged[k] = { ...merged[k], ...parsed[k] };
          }
        });
        return merged;
      }
    } catch (e) {
      console.warn('Failed to parse saved layout state:', e);
    }
    return defaults;
  });

  const [savedPresets, setSavedPresets] = useState<SavedLayoutPreset[]>([]);
  const [maximizedPanelId, setMaximizedPanelId] = useState<string | null>(null);
  const highestZRef = useRef(20);

  // Auto-persist live panel positions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
    } catch (e) {
      console.warn('Failed to save layout state:', e);
    }
  }, [panels]);

  // Load presets from both disk (`media/layouts/`) and localStorage fallback
  const refreshPresets = useCallback(async () => {
    let diskPresets: SavedLayoutPreset[] = [];
    try {
      const files = await invoke<string[]>('list_layout_presets');
      diskPresets = files
        .map((str) => {
          try {
            return JSON.parse(str) as SavedLayoutPreset;
          } catch {
            return null;
          }
        })
        .filter((p): p is SavedLayoutPreset => p !== null && !!p.name);
    } catch (err) {
      console.warn('Disk layout scanner error, using localStorage fallback:', err);
    }

    let localPresets: SavedLayoutPreset[] = [];
    try {
      const local = localStorage.getItem(PRESETS_KEY);
      if (local) localPresets = JSON.parse(local);
    } catch {
      localPresets = [];
    }

    // Merge disk and local presets (disk takes precedence)
    const presetMap = new Map<string, SavedLayoutPreset>();
    localPresets.forEach((p) => presetMap.set(p.name.toLowerCase(), p));
    diskPresets.forEach((p) => presetMap.set(p.name.toLowerCase(), p));

    const merged = Array.from(presetMap.values());
    setSavedPresets(merged);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(merged));
  }, []);

  useEffect(() => {
    refreshPresets();
  }, [refreshPresets]);

  const bringToFront = useCallback((panelId: string) => {
    highestZRef.current += 1;
    setPanels((prev) => {
      if (!prev[panelId] || prev[panelId].zIndex === highestZRef.current) return prev;
      return {
        ...prev,
        [panelId]: { ...prev[panelId], zIndex: highestZRef.current },
      };
    });
  }, []);

  const updatePanelBounds = useCallback(
    (panelId: string, bounds: Partial<Pick<PanelBounds, 'x' | 'y' | 'width' | 'height'>>) => {
      setPanels((prev) => {
        const p = prev[panelId];
        if (!p) return prev;
        return {
          ...prev,
          [panelId]: {
            ...p,
            x: bounds.x !== undefined ? Math.max(0, bounds.x) : p.x,
            y: bounds.y !== undefined ? Math.max(0, bounds.y) : p.y,
            width: bounds.width !== undefined ? Math.max(p.minW, bounds.width) : p.width,
            height: bounds.height !== undefined ? Math.max(p.minH, bounds.height) : p.height,
          },
        };
      });
    },
    []
  );

  const togglePanelVisibility = useCallback((panelId: string) => {
    setPanels((prev) => {
      // If missing from current state, revive using the default definition
      const p = prev[panelId] || createDefaultPanels(window.innerWidth, window.innerHeight)[panelId];
      if (!p) return prev;

      return {
        ...prev,
        [panelId]: { ...p, visible: !p.visible },
      };
    });
  }, []);

  const toggleMaximize = useCallback((panelId: string) => {
    setMaximizedPanelId((curr) => (curr === panelId ? null : panelId));
  }, []);

  const resetToDefault = useCallback(() => {
    const defaults = createDefaultPanels(window.innerWidth, window.innerHeight);
    setPanels(defaults);
    setMaximizedPanelId(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getSavedPresets = useCallback((): SavedLayoutPreset[] => {
    return savedPresets;
  }, [savedPresets]);

  const saveCurrentPreset = useCallback(
    async (presetName: string) => {
      const newPreset: SavedLayoutPreset = {
        name: presetName,
        panels: Object.fromEntries(
          Object.entries(panels).map(([k, v]) => [
            k,
            { x: v.x, y: v.y, width: v.width, height: v.height, visible: v.visible },
          ])
        ),
      };

      const jsonStr = JSON.stringify(newPreset, null, 2);

      // 1. Try to save directly to disk (media/layouts/<name>.json)
      try {
        await invoke('save_layout_preset_file', {
          name: presetName,
          jsonContent: jsonStr,
        });
      } catch (e) {
        console.warn('Failed to save preset to media/layouts/ on disk:', e);
      }

      // 2. Also keep in state and localStorage
      setSavedPresets((prev) => {
        const filtered = prev.filter((p) => p.name.toLowerCase() !== presetName.toLowerCase());
        const updated = [...filtered, newPreset];
        localStorage.setItem(PRESETS_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    [panels]
  );

  const deletePreset = useCallback(async (presetName: string) => {
    // 1. Delete from disk
    try {
      await invoke('delete_layout_preset_file', { name: presetName });
    } catch (e) {
      console.warn('Could not delete preset file from disk:', e);
    }

    // 2. Delete from state & localStorage
    setSavedPresets((prev) => {
      const updated = prev.filter((p) => p.name.toLowerCase() !== presetName.toLowerCase());
      localStorage.setItem(PRESETS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const loadPreset = useCallback((preset: SavedLayoutPreset) => {
    setPanels((prev) => {
      const next = { ...prev };
      Object.keys(preset.panels).forEach((id) => {
        if (next[id]) {
          next[id] = { ...next[id], ...preset.panels[id] };
        }
      });
      return next;
    });
    setMaximizedPanelId(null);
  }, []);

  return {
    panels,
    maximizedPanelId,
    bringToFront,
    updatePanelBounds,
    togglePanelVisibility,
    toggleMaximize,
    resetToDefault,
    getSavedPresets,
    saveCurrentPreset,
    loadPreset,
    deletePreset,
  };
}