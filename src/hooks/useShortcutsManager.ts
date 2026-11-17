import { useState, useEffect, useCallback } from 'react';

export interface ShortcutBinding {
  id: string;
  label: string;
  category: 'NAVIGATION' | 'AUDIO';
  key: string;      // Normalized key (e.g., 'd', ' ', 'w', 'q', 'F8', 'F9', 'F10', ',')
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

export const DEFAULT_SHORTCUTS: Record<string, ShortcutBinding> = {
  summonShell: {
    id: 'summonShell',
    label: 'Summon / Yield Shell (OS Global)',
    category: 'NAVIGATION',
    key: 'Space',
    ctrlKey: true,
    altKey: true,
  },
  summonLauncher: {
    id: 'summonLauncher',
    label: 'Spotlight Launcher',
    category: 'NAVIGATION',
    key: ' ',
    ctrlKey: true,
  },
  toggleDeck: {
    id: 'toggleDeck',
    label: 'Stow / Deploy Deck',
    category: 'NAVIGATION',
    key: 'd',
    altKey: true,
  },
  togglePlates: {
    id: 'togglePlates',
    label: 'Wallpaper Plates',
    category: 'NAVIGATION',
    key: 'w',
    altKey: true,
  },
  toggleWeather: {
    id: 'toggleWeather',
    label: 'Weather HUD',
    category: 'NAVIGATION',
    key: 'q',
    altKey: true,
  },
  toggleSettings: {
    id: 'toggleSettings',
    label: 'Settings Preferences',
    category: 'NAVIGATION',
    key: 'r',
    altKey: true,
  },
  audioPlayPause: {
    id: 'audioPlayPause',
    label: 'Play / Pause Track',
    category: 'AUDIO',
    key: 'F9',
  },
  audioNext: {
    id: 'audioNext',
    label: 'Next Track',
    category: 'AUDIO',
    key: 'F10',
  },
  audioPrev: {
    id: 'audioPrev',
    label: 'Previous Track',
    category: 'AUDIO',
    key: 'F8',
  },
};

const STORAGE_KEY = 'monolith_keybindings_v1';
const SYNC_EVENT = 'monolith-shortcuts-sync';

export function formatBindingString(binding?: ShortcutBinding): string {
  if (!binding) return '';
  const parts: string[] = [];
  if (binding.ctrlKey) parts.push('Ctrl');
  if (binding.altKey) parts.push('Alt');
  if (binding.shiftKey) parts.push('Shift');

  let keyLabel = binding.key;
  if (keyLabel === ' ' || keyLabel.toLowerCase() === 'space') {
    keyLabel = 'Space';
  } else if (keyLabel.startsWith('Numpad')) {
    keyLabel = `Num ${keyLabel.replace('Numpad', '')}`;
  } else if (keyLabel.length === 1) {
    keyLabel = keyLabel.toUpperCase();
  }

  parts.push(keyLabel);
  return parts.join(' + ');
}

export function matchesEvent(binding: ShortcutBinding | undefined, e: KeyboardEvent): boolean {
  if (!binding) return false;
  if (!!binding.altKey !== e.altKey) return false;
  if (!!binding.ctrlKey !== e.ctrlKey) return false;
  if (!!binding.shiftKey !== e.shiftKey) return false;

  const bindingKey = binding.key;

  // Exact code match for numpad or functional keys
  if (bindingKey.startsWith('Numpad') || bindingKey.startsWith('F')) {
    return e.code.toLowerCase() === bindingKey.toLowerCase();
  }

  if (bindingKey === ' ' || bindingKey.toLowerCase() === 'space') {
    return e.code === 'Space' || e.key === ' ';
  }

  // Top-row numbers
  if (/^[0-9]$/.test(bindingKey)) {
    return e.code === `Digit${bindingKey}` || (e.key === bindingKey && !e.code.startsWith('Numpad'));
  }

  // Standard characters
  return e.key.toLowerCase() === bindingKey.toLowerCase() || e.code.toLowerCase() === `key${bindingKey.toLowerCase()}`;
}

export function useShortcutsManager() {
  const loadShortcuts = (): Record<string, ShortcutBinding> => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to parse shortcuts from storage:', e);
    }
    return DEFAULT_SHORTCUTS;
  };

  const [shortcuts, setShortcuts] = useState<Record<string, ShortcutBinding>>(loadShortcuts);

  // Sync across separate components in real time
  useEffect(() => {
    const handleSync = () => {
      setShortcuts(loadShortcuts());
    };
    window.addEventListener(SYNC_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const updateShortcut = useCallback((id: string, newBinding: Partial<ShortcutBinding>) => {
    setShortcuts((prev) => {
      const updated = {
        ...prev,
        [id]: {
          ...prev[id],
          ...newBinding,
        },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        window.dispatchEvent(new Event(SYNC_EVENT));
      } catch (e) {
        console.warn('Failed to save shortcut bindings:', e);
      }
      return updated;
    });
  }, []);

  const resetShortcuts = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(SYNC_EVENT));
    } catch (e) {
      console.warn('Failed to reset shortcuts:', e);
    }
  }, []);

  return {
    shortcuts,
    updateShortcut,
    resetShortcuts,
    formatBinding: (id: string) => formatBindingString(shortcuts[id]),
  };
}