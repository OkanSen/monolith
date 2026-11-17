import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
//import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { clearSkin, loadSkinByPath } from '../utils/themeEngine';
import { ShortcutBinding, formatBindingString, useShortcutsManager } from '../hooks/useShortcutsManager';

interface SkinItem {
  name: string;
  filename: string;
  path: string;
  is_valid: boolean;
  error_reason?: string;
}

interface AudioOutputDevice {
  id: string;
  name: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoMuted: boolean;
  onToggleVideoMuted: (muted: boolean) => void;
  videoVolume: number;
  onVideoVolumeChange: (vol: number) => void;
  showWallpaperWeather: boolean;
  onToggleWallpaperWeather: (show: boolean) => void;
  onSetWeatherOverride?: (cond: string | null) => void;
  isFullscreen: boolean;
  onToggleFullscreen: (fullscreen: boolean) => void;
  uiScale: number;
  onSetUiScale: (scale: number) => void;
  tempUnit: 'C' | 'F';
  onToggleTempUnit: (unit: 'C' | 'F') => void;
  timeFormat: '12h' | '24h';
  onToggleTimeFormat: (fmt: '12h' | '24h') => void;
  audioVolume: number;
  onAudioVolumeChange: (vol: number) => void;
  audioDeviceId: string;
  onSetAudioDevice: (id: string) => void;
}

type SettingsCategory = 'display' | 'startup' | 'audio' | 'shortcuts' | 'atmosphere' | 'media' | 'system';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  videoMuted,
  onToggleVideoMuted,
  videoVolume,
  onVideoVolumeChange,
  showWallpaperWeather,
  onToggleWallpaperWeather,
  onSetWeatherOverride,
  isFullscreen,
  onToggleFullscreen,
  uiScale,
  onSetUiScale,
  tempUnit,
  onToggleTempUnit,
  timeFormat,
  onToggleTimeFormat,
  audioVolume,
  onAudioVolumeChange,
  //audioDeviceId,
  //onSetAudioDevice,
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('display');
  const [autostart, setAutostart] = useState(false);


  // Keybinding Manager Hook & Recording State
  const { shortcuts, updateShortcut, resetShortcuts } = useShortcutsManager();
  const [recordingId, setRecordingId] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingId) return;

    const handleRecord = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore standalone modifier presses
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      if (e.key === 'Escape') {
        setRecordingId(null);
        return;
      }

      // Preserve numpad keys, function keys, and special codes
      let key = e.code;
      if (e.code.startsWith('Digit')) {
        key = e.code.replace('Digit', ''); // Top row numbers: "0"-"9"
      } else if (e.code.startsWith('Key')) {
        key = e.code.replace('Key', '').toLowerCase(); // Letters: "a"-"z"
      } else if (e.code === 'Space') {
        key = 'Space';
      }
      // Numpad keys stay as "Numpad0", "Numpad1", "NumpadAdd", etc.

      updateShortcut(recordingId, {
        key,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
      setRecordingId(null);
    };

    window.addEventListener('keydown', handleRecord, true);
    return () => window.removeEventListener('keydown', handleRecord, true);
  }, [recordingId, updateShortcut]);


  // autoplay music player on boot
  const [autoPlayOnBoot, setAutoPlayOnBoot] = useState(() => {
    return localStorage.getItem('monolith_autoplay_on_boot') !== 'false';
  });

  const toggleAutoPlayOnBoot = () => {
    const next = !autoPlayOnBoot;
    setAutoPlayOnBoot(next);
    localStorage.setItem('monolith_autoplay_on_boot', next ? 'true' : 'false');
  };



  // Splash & Sound Preferences
  const [splashAudioEnabled, setSplashAudioEnabled] = useState(() => {
    return localStorage.getItem('monolith_splash_screen') !== 'false';
  });

  const toggleSplashAudio = () => {
    const next = !splashAudioEnabled;
    setSplashAudioEnabled(next);
    localStorage.setItem('monolith_splash_screen', next ? 'true' : 'false');
    localStorage.setItem('monolith_boot_sound', next ? 'true' : 'false');
  };

  const [customBootSoundPath, setCustomBootSoundPath] = useState<string>(() => {
    return localStorage.getItem('monolith_custom_boot_sound') || '';
  });

  // Display Mode (Fullscreen vs Windowed)
  /*const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return localStorage.getItem('monolith_display_mode') !== 'windowed';
  });*/
  

  // Skin Management State
  const [skinsDir, setSkinsDir] = useState<string>(() => {
    return localStorage.getItem('monolith_skins_dir') || '';
  });
  const [availableSkins, setAvailableSkins] = useState<SkinItem[]>([]);
  const [selectedSkinPath, setSelectedSkinPath] = useState<string>(() => {
    return localStorage.getItem('monolith_active_skin_path') || 'default';
  });
  const [skinLoadNotice, setSkinLoadNotice] = useState<string | null>(null);

  // Load skins list from Rust
  const fetchSkins = useCallback(async (dirToUse?: string) => {
    try {
      const resolvedDir = await invoke<string>('get_skins_directory', { customDir: dirToUse || skinsDir || null });
      setSkinsDir(resolvedDir);
      localStorage.setItem('monolith_skins_dir', resolvedDir);

      const list = await invoke<SkinItem[]>('list_available_skins', { folderPath: resolvedDir });
      setAvailableSkins(list);
    } catch (err) {
      console.error('Failed to enumerate skins folder:', err);
    }
  }, [skinsDir]);

  useEffect(() => {
    if (isOpen) {
      invoke<boolean>('plugin:autostart|is_enabled')
        .then(setAutostart)
        .catch(() => setAutostart(false));

      fetchSkins();
    }
  }, [isOpen, fetchSkins]);

  const toggleAutostart = async () => {
    try {
      if (autostart) {
        await invoke('plugin:autostart|disable');
        setAutostart(false);
      } else {
        await invoke('plugin:autostart|enable');
        setAutostart(true);
      }
    } catch (err) {
      console.error('Failed to configure autostart:', err);
    }
  };

  const handleBrowseBootSound = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac'] }],
        title: 'Select Custom Startup Chime',
      });
      if (selected && typeof selected === 'string') {
        setCustomBootSoundPath(selected);
        localStorage.setItem('monolith_custom_boot_sound', selected);
      }
    } catch (err) {
      console.error('Boot sound file picker error:', err);
    }
  };





  // CUSTOM VISUALIZERS PART
  const [visDir, setVisDir] = useState<string>(() => {
    return localStorage.getItem('monolith_custom_visualizers_dir') || '';
  });
  const [visCount, setVisCount] = useState<number>(0);

  const fetchVisualizers = useCallback(async (dirToUse?: string) => {
    try {
      const resolved = await invoke<string>('get_visualizers_directory', { customDir: dirToUse || visDir || null });
      setVisDir(resolved);
      localStorage.setItem('monolith_custom_visualizers_dir', resolved);

      const list = await invoke<any[]>('list_custom_visualizers', { folderPath: resolved });
      setVisCount(list.length);
      
      // Dispatch in-window event so Visualizer.tsx updates immediately without reboot
      window.dispatchEvent(new CustomEvent('monolith-visualizers-updated'));
    } catch (err) {
      console.warn('Failed to fetch custom visualizers in settings:', err);
    }
  }, [visDir]);

  useEffect(() => {
    if (isOpen) {
      fetchVisualizers();
    }
  }, [isOpen, fetchVisualizers]);

  const handleSelectVisDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Custom Visualizers Directory',
      });
      if (selected && typeof selected === 'string') {
        setVisDir(selected);
        localStorage.setItem('monolith_custom_visualizers_dir', selected);
        fetchVisualizers(selected);
      }
    } catch (err) {
      console.error('Directory selector fault:', err);
    }
  };

  const handleOpenVisFolder = async () => {
    if (!visDir) return;
    try {
      await invoke('show_in_explorer', { path: visDir });
    } catch (err) {
      console.error('Could not reveal visualizers directory:', err);
    }
  };

  const handleResetBootSound = () => {
    setCustomBootSoundPath('');
    localStorage.removeItem('monolith_custom_boot_sound');
  };

  const handleExitApp = () => {
    invoke('exit_monolith').catch(console.error);
  };

  
  const toggleDisplayMode = () => {
    onToggleFullscreen(!isFullscreen);
  };

  const handleSelectSkinDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Custom Skins Directory',
      });
      if (selected && typeof selected === 'string') {
        setSkinsDir(selected);
        localStorage.setItem('monolith_skins_dir', selected);
        fetchSkins(selected);
      }
    } catch (err) {
      console.error('Directory selector fault:', err);
    }
  };

  const handleOpenSkinsFolder = async () => {
    if (!skinsDir) return;
    try {
      await invoke('show_in_explorer', { path: skinsDir });
    } catch (err) {
      console.error('Could not reveal skins directory:', err);
    }
  };

  const handleApplySkin = async (path: string) => {
    setSelectedSkinPath(path);
    setSkinLoadNotice(null);

    if (path === 'default') {
      clearSkin();
      setSkinLoadNotice('DEFAULT OBSIDIAN RELIC RESTORED');
      return;
    }

    const skinObj = availableSkins.find((s) => s.path === path);
    if (!skinObj) return;

    if (!skinObj.is_valid) {
      setSkinLoadNotice(`WARNING: ${skinObj.error_reason || 'Skin failed validation criteria'}`);
      return;
    }

    try {
      await loadSkinByPath(skinObj.path, skinObj.name);
      setSkinLoadNotice(`APPLIED SKIN // ${skinObj.name.toUpperCase()}`);
    } catch {
      setSkinLoadNotice('ERROR: COULD NOT INJECT SKIN CSS');
    }
  };





  const [audioDevices, setAudioDevices] = useState<AudioOutputDevice[]>([]);

  const enumerateAudioDevices = useCallback(async () => {
    try {
      const rustDevices = await invoke<AudioOutputDevice[]>('get_audio_output_devices');
      setAudioDevices(rustDevices);
    } catch (err) {
      console.error('Failed to get audio output devices via Rust:', err);
    }
  }, []);

  // Poll when category opens AND listen for plug/unplug events dynamically
  useEffect(() => {
    if (!isOpen || activeCategory !== 'audio') return;

    enumerateAudioDevices();

    // Dynamically refresh whenever a Bluetooth or USB device connects/disconnects
    const handleDeviceChange = () => {
      enumerateAudioDevices();
    };

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [isOpen, activeCategory, enumerateAudioDevices]);





  const categories = [
    { id: 'display', label: 'DISPLAY & SKINS', desc: 'Skins, themes & window mode' },
    { id: 'startup', label: 'STARTUP & BOOT', desc: 'Shell init, splash, chime' },
    { id: 'audio', label: 'AUDIO & ACOUSTICS', desc: 'Output routing & gain levels' },
    { id: 'shortcuts', label: 'KEY COMBINATIONS', desc: 'Rebind navigation & audio keys' },
    { id: 'atmosphere', label: 'ATMOSPHERE', desc: 'Weather fx & live simulations' },
    { id: 'media', label: 'MEDIA & PLATES', desc: 'Video wallpaper audio' },
    { id: 'system', label: 'SYSTEM & CORE', desc: 'Telemetry & process lifecycle' },
  ] as const;

  return (
    <div
      onClick={onClose}
      className={`monolith-modal-overlay ${isOpen ? 'open' : ''}`}
      style={{
        backgroundColor: 'var(--bg-modal-overlay, rgba(5, 6, 8, 0.85))',
        backdropFilter: 'blur(16px)',
        zIndex: 55,
        position: 'fixed',
        inset: 0,
      }}
    >
      <div
        className="monolith-modal-content mono glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '1024px',
          height: '620px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 90px rgba(0,0,0,0.98)',
          border: '1px solid var(--line-eroded)',
          borderRadius: 'var(--panel-radius, 0px)',
          overflow: 'hidden',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            height: '48px',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--line-weathered)',
            background: 'var(--bg-header, rgba(0, 0, 0, 0.35))',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="font-display relic-glow" style={{ fontSize: '15px', letterSpacing: '0.15em' }}>
              MONOLITH // SYSTEM PREFERENCES
            </span>
            <span style={{ fontSize: '9px', color: 'var(--text-fossil)' }}>[REVISION 1.0]</span>
          </div>
          <span style={{ fontSize: '9.5px', color: 'var(--text-ash)' }}>ESC TO DISMISS</span>
        </div>

        {/* Dual-Pane Layout Body */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* Left Category Rail */}
          <div
            style={{
              width: '240px',
              borderRight: '1px solid var(--line-weathered)',
              background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.25))',
              display: 'flex',
              flexDirection: 'column',
              padding: '16px 10px',
              gap: '6px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: '8.5px',
                color: 'var(--text-fossil)',
                letterSpacing: '0.12em',
                marginBottom: '6px',
                paddingLeft: '8px',
              }}
            >
              // PREFERENCE CATEGORIES
            </div>

            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <div
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderRadius: 'var(--panel-radius, 0px)',
                    background: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--glow-core)' : '3px solid transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isActive ? '#ffffff' : 'var(--text-ash)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {cat.label}
                  </span>
                  <span style={{ fontSize: '8.5px', color: 'var(--text-fossil)' }}>
                    {cat.desc}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right Content Pane */}
          <div
            className="custom-scrollbar"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '28px 36px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {/* CATEGORY: DISPLAY & SKINS */}
            {activeCategory === 'display' && (
              <>
                <div>
                  <div className="font-display relic-glow" style={{ fontSize: '13px', marginBottom: '4px' }}>
                    // DISPLAY MODE & AESTHETIC SKINS
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-ash)' }}>
                    Switch display modes and customize the shell with external CSS skin stylesheets.
                  </div>
                </div>

                <div className="weathered-line" />

                {/* Fullscreen vs Windowed */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ maxWidth: '480px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                      WORKSPACE DISPLAY MODE
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                      Toggle between borderless Fullscreen (Cyberdeck Shell) and Resizable Windowed workstation mode.
                    </div>
                  </div>
                  <button
                    onClick={toggleDisplayMode}
                    className={`monolith-btn ${isFullscreen ? 'active' : ''}`}
                    style={{ padding: '6px 14px' }}
                  >
                    {isFullscreen ? 'FULLSCREEN' : 'WINDOWED'}
                  </button>
                </div>

                <div className="weathered-line" />


                {/* Clock Format Selector */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--glow-core)', fontWeight: 600 }}>
                      CHRONOMETER FORMAT
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-ash)', marginTop: '2px' }}>
                      Select 24-hour military notation or 12-hour AM/PM system clock.
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => onToggleTimeFormat('24h')}
                      className={`monolith-btn ${timeFormat === '24h' ? 'active' : ''}`}
                      style={{
                        padding: '5px 12px',
                        fontSize: '10px',
                        fontWeight: timeFormat === '24h' ? 800 : 500,
                        color: timeFormat === '24h' ? 'var(--glow-core)' : 'var(--text-ash)',
                        borderColor: timeFormat === '24h' ? 'var(--glow-core)' : 'var(--line-eroded)',
                        background: timeFormat === '24h' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                        boxShadow: timeFormat === '24h' ? '0 0 10px rgba(56, 189, 248, 0.25)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      24-HOUR (MIL)
                    </button>
                    <button
                      onClick={() => onToggleTimeFormat('12h')}
                      className={`monolith-btn ${timeFormat === '12h' ? 'active' : ''}`}
                      style={{
                        padding: '5px 12px',
                        fontSize: '10px',
                        fontWeight: timeFormat === '12h' ? 800 : 500,
                        color: timeFormat === '12h' ? 'var(--glow-core)' : 'var(--text-ash)',
                        borderColor: timeFormat === '12h' ? 'var(--glow-core)' : 'var(--line-eroded)',
                        background: timeFormat === '12h' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                        boxShadow: timeFormat === '12h' ? '0 0 10px rgba(56, 189, 248, 0.25)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      12-HOUR (AM/PM)
                    </button>
                  </div>
                </div>

                <div className="weathered-line" />

                {/* UI Scaling Selector */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--glow-core)', fontWeight: 600 }}>
                      INTERFACE SCALE (ZOOM)
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-ash)', marginTop: '2px' }}>
                      Globally scale typography, panels, and modals. Use <code className="mono">Ctrl + / -</code> to adjust quickly.
                    </div>
                  </div>

                  {/* Stepped Scale Options */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[
                      { label: '90%', value: 0.9 },
                      { label: '100%', value: 1.0 },
                      { label: '110%', value: 1.1 },
                      { label: '120%', value: 1.2 },
                      { label: '125%', value: 1.25 },
                    ].map((preset) => {
                      const isActive = Math.abs(uiScale - preset.value) < 0.02;
                      return (
                        <button
                          key={preset.value}
                          onClick={() => onSetUiScale(preset.value)}
                          className={`monolith-btn ${isActive ? 'active' : ''}`}
                          style={{
                            padding: '5px 10px',
                            fontSize: '10.5px',
                            fontWeight: isActive ? 800 : 500,
                          }}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="weathered-line" />

                {/* Skin Engine Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ maxWidth: '480px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                        ACTIVE THEME SKIN (.CSS)
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                        Choose a preloaded theme or load custom .css skins dropped into the skins repository.
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => fetchSkins()}
                        className="monolith-btn"
                        style={{ padding: '4px 8px', fontSize: '9px' }}
                        title="Rescan skin directory"
                      >
                        [ ⟳ RESCAN ]
                      </button>
                      <button
                        onClick={handleOpenSkinsFolder}
                        className="monolith-btn"
                        style={{ padding: '4px 8px', fontSize: '9px' }}
                        title="Reveal skins directory in Windows Explorer"
                      >
                        [ ↗ REVEAL DIR ]
                      </button>
                    </div>
                  </div>

                  {/* Dropdown Menu & Directory Controls */}
                  <div
                    style={{
                      background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.3))',
                      border: '1px solid var(--line-weathered)',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-fossil)', width: '80px' }}>SKIN:</span>
                      <select
                        value={selectedSkinPath}
                        onChange={(e) => handleApplySkin(e.target.value)}
                        className="monolith-btn"
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          fontSize: '11px',
                          background: 'var(--bg-slot, rgba(0,0,0,0.7))',
                          color: 'var(--glow-core)',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="default">DEFAULT // MONOLITH OBSIDIAN (BUILT-IN)</option>
                        {availableSkins.map((s) => (
                          <option key={s.path} value={s.path}>
                            {s.name.toUpperCase()} {!s.is_valid ? '[INVALID]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '8px', color: 'var(--text-fossil)' }}>SKINS ROOT FOLDER</div>
                        <div
                          style={{
                            fontSize: '9.5px',
                            color: 'var(--text-ash)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: '2px',
                          }}
                          title={skinsDir}
                        >
                          {skinsDir || 'SEARCHING ROOT /SKINS...'}
                        </div>
                      </div>

                      <button
                        onClick={handleSelectSkinDirectory}
                        className="monolith-btn"
                        style={{ padding: '4px 10px', fontSize: '9px' }}
                      >
                        CHANGE DIR...
                      </button>
                    </div>

                    {skinLoadNotice && (
                      <div
                        style={{
                          fontSize: '9.5px',
                          color: skinLoadNotice.startsWith('WARNING') || skinLoadNotice.startsWith('ERROR')
                            ? 'var(--accent-alert, #ff6b6b)'
                            : 'var(--glow-core)',
                          borderTop: '1px solid var(--line-weathered)',
                          paddingTop: '8px',
                        }}
                      >
                        &gt; {skinLoadNotice}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* CATEGORY: STARTUP & BOOT */}
            {activeCategory === 'startup' && (
              <>
                <div>
                  <div className="font-display relic-glow" style={{ fontSize: '13px', marginBottom: '4px' }}>
                    // STARTUP & BOOT ORCHESTRATION
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-ash)' }}>
                    Configure automated shell boot, emblem bloom sequences, and acoustic signals.
                  </div>
                </div>

                <div className="weathered-line" />

                {/* Autostart */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ maxWidth: '480px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                      LAUNCH ON WINDOWS STARTUP
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                      Register Monolith with Windows registry to launch seamlessly on system login.
                      (Silently initializes in the background without splash or boot audio).
                    </div>
                  </div>
                  <button
                    onClick={toggleAutostart}
                    className={`monolith-btn ${autostart ? 'active' : ''}`}
                    style={{ padding: '6px 14px' }}
                  >
                    {autostart ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="weathered-line" />

                {/* Unified Splash & Chime Sequence */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ maxWidth: '480px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                        SPLASH SCREEN & RESONANCE CHIME
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                        Play emblem bloom sequence and startup chime on manual launches.
                        Disable to render workspace instantly with zero boot delay.
                      </div>
                    </div>
                    <button
                      onClick={toggleSplashAudio}
                      className={`monolith-btn ${splashAudioEnabled ? 'active' : ''}`}
                      style={{ padding: '6px 14px' }}
                    >
                      {splashAudioEnabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  {splashAudioEnabled && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
                        border: '1px solid var(--line-weathered)',
                        padding: '10px 14px',
                        marginTop: '4px',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
                        <div style={{ fontSize: '8.5px', color: 'var(--text-fossil)' }}>STARTUP CHIME ACOUSTIC FILE</div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: customBootSoundPath ? 'var(--glow-core)' : 'var(--text-ash)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: '2px',
                          }}
                          title={customBootSoundPath || 'Default Mathematical Tone'}
                        >
                          {customBootSoundPath
                            ? customBootSoundPath.split(/[\\/]/).pop() || customBootSoundPath
                            : 'DEFAULT // PROCEDURAL SINE RESONANCE'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={handleBrowseBootSound}
                          className="monolith-btn"
                          style={{ padding: '4px 10px', fontSize: '9px' }}
                        >
                          BROWSE AUDIO...
                        </button>
                        {customBootSoundPath && (
                          <button
                            onClick={handleResetBootSound}
                            className="monolith-btn"
                            style={{ padding: '4px 10px', fontSize: '9px', color: 'var(--accent-alert, #ff6b6b)' }}
                            title="Reset to sine tone"
                          >
                            RESTORE DEFAULT
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="weathered-line" />

                {/* Startup Autoplay Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ maxWidth: '480px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                      MUSIC AUTOPLAY ON STARTUP
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                      Automatically resume background music playback when Monolith finishes booting.
                    </div>
                  </div>
                  <button
                    onClick={toggleAutoPlayOnBoot}
                    className={`monolith-btn ${autoPlayOnBoot ? 'active' : ''}`}
                    style={{ padding: '6px 14px' }}
                  >
                    {autoPlayOnBoot ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="weathered-line" />
                  </>
                )}



            {/* CATEGORY: AUDIO & ACOUSTICS */}
            {activeCategory === 'audio' && (
              <>
                <div>
                  <div className="font-display relic-glow" style={{ fontSize: '13px', marginBottom: '4px' }}>
                    // AUDIO TELEMETRY & ACOUSTICS
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-ash)' }}>
                    Hardware output monitoring and global Web Audio master gain levels.
                  </div>
                </div>

                <div className="weathered-line" />

                {/* Master Deck Gain Slider */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ maxWidth: '480px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                        MASTER DECK GAIN
                      </div>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-ash)', marginTop: '2px' }}>
                        Controls global Web Audio GainNode multiplier across the music player and visualizer pipeline.
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--glow-core)' }}>
                      {Math.round(audioVolume * 100)}%
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--line-weathered)',
                      padding: '12px 14px',
                    }}
                  >
                    <span style={{ fontSize: '9px', color: 'var(--text-ash)' }}>MIN (0%)</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={audioVolume}
                      onChange={(e) => onAudioVolumeChange(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--glow-core)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '9px', color: 'var(--text-ash)' }}>MAX (100%)</span>
                  </div>
                </div>

                <div className="weathered-line" />

                {/* Hardware Output Telemetry (Read-only list) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ maxWidth: '480px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                        HARDWARE AUDIO ENDPOINTS
                      </div>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-ash)', marginTop: '2px' }}>
                        Audio streams automatically route through Windows default output. Monolith detects {audioDevices.length} available host endpoint{audioDevices.length === 1 ? '' : 's'}.
                      </div>
                    </div>
                    <button
                      onClick={enumerateAudioDevices}
                      className="monolith-btn"
                      style={{ padding: '4px 10px', fontSize: '9px' }}
                      title="Re-query Windows MMDevice subsystem"
                    >
                      [ ↻ RE-QUERY ]
                    </button>
                  </div>

                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--line-weathered)',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ fontSize: '8.5px', color: 'var(--text-fossil)', marginBottom: '4px' }}>
                      ACTIVE HOST ROUTE: <span style={{ color: 'var(--glow-core)' }}>WINDOWS SYSTEM DEFAULT (DYNAMIC)</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {audioDevices.map((device, idx) => (
                        <div
                          key={device.id || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 8px',
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid rgba(255, 255, 255, 0.04)',
                            fontSize: '10px',
                            color: 'var(--text-ash)',
                          }}
                        >
                          <span style={{ color: 'var(--glow-core)', fontSize: '8px' }}>▸</span>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {device.name}
                          </span>
                          <span style={{ fontSize: '8px', color: 'var(--text-fossil)' }}>WASAPI READY</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}






            {/* CATEGORY: SHORTCUTS */}
            {activeCategory === 'shortcuts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div className="font-display relic-glow" style={{ fontSize: '15px', marginBottom: '6px' }}>
                    // SYSTEM SHORTCUT MATRIX
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-ash)' }}>
                    Click any key combination to rebind. Press your desired key or modifier combo to assign, or press <code className="mono">Esc</code> to cancel.
                  </div>
                </div>

                <div className="weathered-line" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--glow-core)', fontWeight: 600 }}>
                    KEY COMBINATION MATRIX
                  </div>
                  <button
                    onClick={resetShortcuts}
                    className="monolith-btn"
                    style={{ fontSize: '10px', padding: '5px 12px', color: '#ff6b6b', borderColor: 'rgba(255, 107, 107, 0.3)' }}
                    title="Reset all bindings to default factory values"
                  >
                    [ ⟲ RESET TO DEFAULTS ]
                  </button>
                </div>

                {/* Group 1: Navigation & Shell */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-fossil)', fontWeight: 700, letterSpacing: '0.1em' }}>
                    // SHELL & NAVIGATION
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {Object.values(shortcuts)
                      .filter((b) => b.category === 'NAVIGATION')
                      .map((binding: ShortcutBinding) => {
                        const isRecording = recordingId === binding.id;
                        return (
                          <div
                            key={binding.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.3))',
                              border: isRecording ? '1px solid var(--glow-core)' : '1px solid var(--line-weathered)',
                              transition: 'border-color 0.15s ease',
                            }}
                          >
                            <span className="mono" style={{ fontSize: '11.5px', fontWeight: 600, color: '#ffffff' }}>
                              {binding.label}
                            </span>
                            <button
                              onClick={() => setRecordingId(isRecording ? null : binding.id)}
                              className={`monolith-btn ${isRecording ? 'active' : ''}`}
                              style={{
                                fontSize: '11px',
                                padding: '5px 12px',
                                minWidth: '105px',
                                textAlign: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {isRecording ? 'PRESS KEY...' : formatBindingString(binding)}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Group 2: Audio & Media */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-fossil)', fontWeight: 700, letterSpacing: '0.1em' }}>
                    // AUDIO CONTROLS (GLOBAL OS HOOKS)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {Object.values(shortcuts)
                      .filter((b) => b.category === 'AUDIO')
                      .map((binding: ShortcutBinding) => {
                        const isRecording = recordingId === binding.id;
                        return (
                          <div
                            key={binding.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.3))',
                              border: isRecording ? '1px solid var(--glow-core)' : '1px solid var(--line-weathered)',
                              transition: 'border-color 0.15s ease',
                            }}
                          >
                            <span className="mono" style={{ fontSize: '11.5px', fontWeight: 600, color: '#ffffff' }}>
                              {binding.label}
                            </span>
                            <button
                              onClick={() => setRecordingId(isRecording ? null : binding.id)}
                              className={`monolith-btn ${isRecording ? 'active' : ''}`}
                              style={{
                                fontSize: '11px',
                                padding: '5px 12px',
                                minWidth: '105px',
                                textAlign: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {isRecording ? 'PRESS KEY...' : formatBindingString(binding)}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* CATEGORY: ATMOSPHERE */}
            {activeCategory === 'atmosphere' && (
              <>
                <div>
                  <div className="font-display relic-glow" style={{ fontSize: '13px', marginBottom: '4px' }}>
                    // ATMOSPHERE & WEATHER TELEMETRY
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-ash)' }}>
                    Controls for atmospheric canvas effects and simulated weather shaders.
                  </div>
                </div>

                <div className="weathered-line" />


                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                      TEMPERATURE SCALE
                    </div>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-ash)', marginTop: '2px' }}>
                      Select Celsius (°C) or Fahrenheit (°F) display across the shell.
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => onToggleTempUnit('C')}
                      className={`monolith-btn ${tempUnit === 'C' ? 'active' : ''}`}
                      style={{ padding: '4px 10px', fontSize: '10px' }}
                    >
                      CELSIUS (°C)
                    </button>
                    <button
                      onClick={() => onToggleTempUnit('F')}
                      className={`monolith-btn ${tempUnit === 'F' ? 'active' : ''}`}
                      style={{ padding: '4px 10px', fontSize: '10px' }}
                    >
                      FAHRENHEIT (°F)
                    </button>
                  </div>
                </div>

                <div className="weathered-line" />

                {/* Wallpaper Weather Overlay */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ maxWidth: '480px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                      WALLPAPER WEATHER OVERLAY
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                      Render real-time vertical rain drops and atmospheric vapor directly over your active wallpaper.
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleWallpaperWeather(!showWallpaperWeather)}
                    className={`monolith-btn ${showWallpaperWeather ? 'active' : ''}`}
                    style={{ padding: '6px 14px' }}
                  >
                    {showWallpaperWeather ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="weathered-line" />

                {/* Weather Debug Sandbox */}
                {onSetWeatherOverride && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                        ATMOSPHERIC SIMULATION SANDBOX (DEV OVERRIDES)
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                        Manually trigger weather particle pipelines across the viewport to test rendering fidelity.
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                      {['CLEAR', 'RAIN', 'STORM', 'SNOW', 'FOG'].map((w) => (
                        <button
                          key={w}
                          onClick={() => onSetWeatherOverride(w)}
                          className="monolith-btn"
                          style={{ fontSize: '9.5px', padding: '4px 12px' }}
                        >
                          FORCE: {w}
                        </button>
                      ))}
                      <button
                        onClick={() => onSetWeatherOverride(null)}
                        className="monolith-btn active"
                        style={{ fontSize: '9.5px', padding: '4px 12px' }}
                      >
                        ONLINE STATION SENSORS
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* CATEGORY: MEDIA */}
            {activeCategory === 'media' && (
              <>
                <div>
                  <div className="font-display relic-glow" style={{ fontSize: '13px', marginBottom: '4px' }}>
                    // MEDIA & BACKGROUND PLATES
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-ash)' }}>
                    Playback settings for animated background plates and audio layers.
                  </div>
                </div>

                <div className="weathered-line" />


                {/* Custom Visualizer Pipeline Settings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ maxWidth: '480px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                        CUSTOM VISUALIZER REPOSITORY
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                        Load custom 3D models (.glb/.gltf) and custom shaders (.frag) dynamically without rebuilding the app.
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => fetchVisualizers()}
                        className="monolith-btn"
                        style={{ padding: '4px 8px', fontSize: '9px' }}
                        title="Rescan visualizers folder"
                      >
                        [ ⟳ RESCAN ]
                      </button>
                      <button
                        onClick={handleOpenVisFolder}
                        className="monolith-btn"
                        style={{ padding: '4px 8px', fontSize: '9px' }}
                        title="Reveal visualizers directory in Windows Explorer"
                      >
                        [ ↗ REVEAL DIR ]
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.3))',
                      border: '1px solid var(--line-weathered)',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '8px', color: 'var(--text-fossil)' }}>
                        ACTIVE REPOSITORY [{visCount} PRESETS DETECTED]
                      </div>
                      <div
                        style={{
                          fontSize: '9.5px',
                          color: 'var(--text-ash)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: '2px',
                        }}
                        title={visDir}
                      >
                        {visDir || 'SEARCHING ROOT /CUSTOM-VISUALIZERS...'}
                      </div>
                    </div>

                    <button
                      onClick={handleSelectVisDirectory}
                      className="monolith-btn"
                      style={{ padding: '4px 10px', fontSize: '9px' }}
                    >
                      CHANGE DIR...
                    </button>
                  </div>
                </div>

                {/* Video Wallpaper Sound */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ maxWidth: '480px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--glow-core)', fontWeight: 600 }}>
                        VIDEO WALLPAPER AUDIO
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                        Enable audio channel playback on animated MP4/WebM video wallpaper plates.
                      </div>
                    </div>
                    <button
                      onClick={() => onToggleVideoMuted(!videoMuted)}
                      className={`monolith-btn ${!videoMuted ? 'active' : ''}`}
                      style={{ padding: '6px 14px' }}
                    >
                      {!videoMuted ? 'AUDIO ACTIVE' : 'MUTED'}
                    </button>
                  </div>

                  {!videoMuted && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
                        border: '1px solid var(--line-weathered)',
                        padding: '10px 14px',
                      }}
                    >
                      <span style={{ fontSize: '9.5px', color: 'var(--text-ash)' }}>VOLUME GAIN</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={videoVolume}
                        onChange={(e) => onVideoVolumeChange(parseFloat(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--glow-core)' }}
                      />
                      <span style={{ fontSize: '10px', color: 'var(--glow-core)', width: '38px', textAlign: 'right' }}>
                        {Math.round(videoVolume * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* CATEGORY: SYSTEM */}
            {activeCategory === 'system' && (
              <>
                <div>
                  <div className="font-display relic-glow" style={{ fontSize: '13px', marginBottom: '4px' }}>
                    // PROCESS & LIFECYCLE
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-ash)' }}>
                    Core telemetry and graceful process teardown.
                  </div>
                </div>

                <div className="weathered-line" />

                {/* Terminate Process */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ maxWidth: '480px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--accent-alert, #ff6b6b)', fontWeight: 600 }}>
                      TERMINATE MONOLITH RUNTIME
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '2px' }}>
                      Gracefully shutdown all background file watchers, hardware polling threads, and release memory.
                    </div>
                  </div>
                  <button
                    onClick={handleExitApp}
                    className="monolith-btn"
                    style={{ borderColor: 'var(--accent-alert, #ff6b6b)', color: 'var(--accent-alert, #ff6b6b)', padding: '6px 14px' }}
                  >
                    KILL PROCESS
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};