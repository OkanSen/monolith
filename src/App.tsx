import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Visualizer } from './components/dashboard/Visualizer';
import { MusicPlayer } from './components/dashboard/MusicPlayer';
import { SystemMonitor } from './components/dashboard/SystemMonitor';
import { FileExplorer } from './components/dashboard/FileExplorer';
import { WallpaperCarousel } from './components/WallpaperCarousel';
import { LauncherModal } from './components/LauncherModal';
import { WeatherModal, WeatherData, getWeatherGlyph, WeatherAtmosphereOverlay } from './components/WeatherModal';
import { SettingsModal } from './components/SettingsModal';
import { useAudioManager } from './hooks/useAudioManager';
import { useEdgeReveal } from './hooks/useEdgeReveal';
import { listen } from '@tauri-apps/api/event';
import { CommandConsole } from './components/CommandConsole';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useLayoutManager } from './hooks/useLayoutManager';
import { DeckPanel } from './components/common/DeckPanel';
import { matchesEvent, useShortcutsManager } from './hooks/useShortcutsManager';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { RemoteUplink } from './components/RemoteUplink';
import './styles/theme.css';

interface AppProps {
  isAutostartLaunch?: boolean;
}

export default function App({ isAutostartLaunch = false }: AppProps) {
  const hasAutoPlayedRef = useRef(false);

  const [isDashboardVisible, setIsDashboardVisible] = useState(true);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const [isWeatherOpen, setIsWeatherOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [weatherOverride, setWeatherOverride] = useState<string | null>(null);

  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  const handleOpenLayoutsFolder = async () => {
    try {
      await invoke('open_layouts_directory');
    } catch (err) {
      console.error('Failed to open layouts folder:', err);
    }
  };



  // ZOOM Levels
  const [uiScale, setUiScale] = useState<number>(() => {
    const saved = localStorage.getItem('monolith_ui_scale');
    return saved ? parseFloat(saved) : 1.0;
  });

  const handleSetUiScale = useCallback((scale: number) => {
    const clamped = Math.min(1.4, Math.max(0.85, Math.round(scale * 100) / 100));
    setUiScale(clamped);
    localStorage.setItem('monolith_ui_scale', clamped.toString());
  }, []);

  // Keyboard Zoom Shortcuts (Ctrl + Plus, Ctrl + Minus, Ctrl + 0)
  useEffect(() => {
    const handleZoomKeys = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;

      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        handleSetUiScale(uiScale + 0.05);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleSetUiScale(uiScale - 0.05);
      } else if (e.key === '0') {
        e.preventDefault();
        handleSetUiScale(1.0);
      }
    };

    window.addEventListener('keydown', handleZoomKeys);
    return () => window.removeEventListener('keydown', handleZoomKeys);
  }, [uiScale, handleSetUiScale]);





  // Get isFullScreen from SettingsModal for fullscreen header bar.
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const checkFullscreen = async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        const fs = await appWindow.isFullscreen();
        setIsFullscreen(fs);
      } catch (e) {
        console.warn('Failed to query fullscreen status:', e);
      }
    };

    checkFullscreen();

    // Listen to Tauri window resize/state changes to keep isFullscreen in sync
    const appWindow = getCurrentWebviewWindow();
    const unlisten = appWindow.onResized(async () => {
      try {
        setIsFullscreen(await appWindow.isFullscreen());
      } catch {}
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
  

  // Modular Fluid Layout Engine
  const {
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
    deletePreset
  } = useLayoutManager();


  // Click outside to close VIEW menu (Capture Phase Fix)
  const viewMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
    };
    if (isViewMenuOpen) {
      window.addEventListener('mousedown', handleClickOutside, true);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isViewMenuOpen]);

  // Settings State
  const [videoMuted, setVideoMuted] = useState<boolean>(() => {
    return localStorage.getItem('monolith_video_muted') !== 'false';
  });
  const [videoVolume, setVideoVolume] = useState<number>(() => {
    const stored = localStorage.getItem('monolith_video_volume');
    return stored ? parseFloat(stored) : 0.5;
  });

  // Wallpaper weather projection toggle (persisted)
  const [showWallpaperWeather, setShowWallpaperWeather] = useState<boolean>(() => {
    return localStorage.getItem('monolith_wallpaper_weather') === 'true';
  });
  const handleToggleWallpaperWeather = (show: boolean) => {
    setShowWallpaperWeather(show);
    localStorage.setItem('monolith_wallpaper_weather', show ? 'true' : 'false');
  };

  const [currentWallpaper, setCurrentWallpaper] = useState<string>(() => {
    return localStorage.getItem('monolith_active_wallpaper') || '';
  });
  const [time, setTime] = useState(new Date());

  // Splash & Boot states respecting autostart and user preferences
  const splashPref = localStorage.getItem('monolith_splash_screen') !== 'false';
  const shouldShowSplash = !isAutostartLaunch && splashPref;

  const [bootReady, setBootReady] = useState(!shouldShowSplash);
  const [splashFade, setSplashFade] = useState(!shouldShowSplash);
  const [splashVisible, setSplashVisible] = useState(shouldShowSplash);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Edge reveal when dashboard is stowed
  const { isRevealed: isHeaderRevealed, handleElementMouseLeave } = useEdgeReveal({
    triggerHeight: 20,
    enabled: !isDashboardVisible,
  });
  const isHeaderVisible = isDashboardVisible || isHeaderRevealed;



  // Audio Engine Hook
  const {
    audioRef,
    analyserRef,
    tracks,
    currentTrackIdx,
    isPlaying,
    currentTime,
    duration,
    volume,
    folderPath,
    isShuffle,
    activeQueue,
    repeatMode,
    toggleShuffle,
    cycleRepeatMode,
    handleTrackEnded,
    setAudioVolume,
    loadFolder,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    audioDeviceId,
    setAudioDevice,
  } = useAudioManager();

  // Coordinated Launch & Music Autoplay Handler
  useEffect(() => {
    const triggerAutoPlay = () => {
      if (hasAutoPlayedRef.current) return;
      hasAutoPlayedRef.current = true;
      
      // Check user preference for startup audio
      const autoPlayEnabled = localStorage.getItem('monolith_autoplay_on_boot') !== 'false';
      const savedMusic = localStorage.getItem('monolith_music_dir');
      
      if (savedMusic && autoPlayEnabled && !isPlaying) {
        togglePlay();
      }
    };

    if (!shouldShowSplash) {
      setBootReady(true);
      setSplashVisible(false);
      triggerAutoPlay();
      return;
    }

    const deckTimer = setTimeout(() => {
      setBootReady(true);
    }, 2200);

    const fadeTimer = setTimeout(() => {
      setSplashFade(true);
      triggerAutoPlay();
    }, 2800);

    const unmountTimer = setTimeout(() => {
      setSplashVisible(false);
    }, 3600);

    return () => {
      clearTimeout(deckTimer);
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [shouldShowSplash, tracks, isPlaying, playTrack]);

  // Restore saved display mode
  useEffect(() => {
    const savedMode = localStorage.getItem('monolith_display_mode');
    if (savedMode === 'windowed') {
      const win = getCurrentWindow();
      win.setFullscreen(false)
        .then(() => win.setResizable(true))
        .then(() => win.setSize(new LogicalSize(1280, 800)))
        .then(() => win.center())
        .catch((err) => console.warn('Could not restore windowed mode:', err));
    }
  }, []);

  // Restore saved skin on launch
  useEffect(() => {
    const savedSkinPath = localStorage.getItem('monolith_active_skin_path');
    if (savedSkinPath && savedSkinPath !== 'default') {
      invoke<string>('read_skin_css', { filePath: savedSkinPath })
        .then((css: string) => {
          let tag = document.getElementById('monolith-custom-skin') as HTMLStyleElement | null;
          if (!tag) {
            tag = document.createElement('style');
            tag.id = 'monolith-custom-skin';
            document.head.appendChild(tag);
          }
          tag.textContent = css;
        })
        .catch((err: unknown) => console.warn('Could not restore skin:', err));
    }
  }, []);

  // Sync video audio properties
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = videoMuted;
      videoRef.current.volume = videoVolume;
    }
  }, [videoMuted, videoVolume, currentWallpaper]);

  const handleToggleVideoMuted = (muted: boolean) => {
    setVideoMuted(muted);
    localStorage.setItem('monolith_video_muted', muted ? 'true' : 'false');
  };

  const handleVideoVolumeChange = (vol: number) => {
    setVideoVolume(vol);
    localStorage.setItem('monolith_video_volume', vol.toString());
  };

  const isVideoWallpaper = useMemo(() => {
    return /\.(mp4|webm|mov)(\?.*)?$/i.test(currentWallpaper);
  }, [currentWallpaper]);

  // Ambient Weather Telemetry State
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const displayWeather = useMemo(() => {
    if (!weather) return null;
    if (!weatherOverride) return weather;
    return { ...weather, condition: weatherOverride };
  }, [weather, weatherOverride]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // For changing temp display between c and f
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(() => {
    return (localStorage.getItem('monolith_temp_unit') as 'C' | 'F') || 'C';
  });

  const handleToggleTempUnit = (unit: 'C' | 'F') => {
    setTempUnit(unit);
    localStorage.setItem('monolith_temp_unit', unit);
  };


  const pollWeather = useCallback(async (force = false) => {
    if (!force) {
      const cached = localStorage.getItem('monolith_weather_cache');
      const cachedTime = localStorage.getItem('monolith_weather_time');
      if (cached && cachedTime && Date.now() - parseInt(cachedTime, 10) < 15 * 60 * 1000) {
        try {
          const parsedCache = JSON.parse(cached);
          if (parsedCache && Array.isArray(parsedCache.hourly)) {
            setWeather(parsedCache);
            return;
          }
        } catch {
          // Proceed to fetch
        }
      }
    }

    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await fetch('https://wttr.in/?format=j1');
      if (!res.ok) throw new Error('Sensor telemetry timeout');
      const data = await res.json();

      const current = data.current_condition?.[0] || {};
      const area = data.nearest_area?.[0] || {};
      const city = area.areaName?.[0]?.value || 'LOCAL REGION';

      const today = data.weather?.[0] || {};
      const tomorrow = data.weather?.[1] || {};

      const anchorPoints: Array<{ hourIndex: number; temp: number; desc: string }> = [];

      (today.hourly || []).forEach((h: any) => {
        anchorPoints.push({
          hourIndex: Math.floor(parseInt(h.time || '0', 10) / 100),
          temp: parseFloat(h.tempC || '0'),
          desc: h.weatherDesc?.[0]?.value || 'Clear',
        });
      });

      (tomorrow.hourly || []).forEach((h: any) => {
        anchorPoints.push({
          hourIndex: 24 + Math.floor(parseInt(h.time || '0', 10) / 100),
          temp: parseFloat(h.tempC || '0'),
          desc: h.weatherDesc?.[0]?.value || 'Clear',
        });
      });

      const currentHour = new Date().getHours();
      const hourlyList: Array<{ time: string; temp_C: string; icon: string; desc: string }> = [];

      for (let offset = 0; offset < 10; offset++) {
        const targetHour = currentHour + offset;
        const displayClockHour = targetHour % 24;
        const timeLabel = `${displayClockHour.toString().padStart(2, '0')}:00`;

        let prevAnchor = anchorPoints[0];
        let nextAnchor = anchorPoints[anchorPoints.length - 1];

        for (let i = 0; i < anchorPoints.length; i++) {
          if (anchorPoints[i].hourIndex <= targetHour) {
            prevAnchor = anchorPoints[i];
          }
          if (anchorPoints[i].hourIndex >= targetHour) {
            nextAnchor = anchorPoints[i];
            break;
          }
        }

        let interpolatedTemp = prevAnchor.temp;
        if (nextAnchor.hourIndex !== prevAnchor.hourIndex) {
          const ratio = (targetHour - prevAnchor.hourIndex) / (nextAnchor.hourIndex - prevAnchor.hourIndex);
          interpolatedTemp = prevAnchor.temp + ratio * (nextAnchor.temp - prevAnchor.temp);
        }

        const closestAnchor =
          Math.abs(targetHour - prevAnchor.hourIndex) <= Math.abs(targetHour - nextAnchor.hourIndex)
            ? prevAnchor
            : nextAnchor;

        hourlyList.push({
          time: timeLabel,
          temp_C: Math.round(interpolatedTemp).toString(),
          icon: getWeatherGlyph(closestAnchor.desc),
          desc: closestAnchor.desc,
        });
      }

      const parsed: WeatherData = {
        temp_C: current.temp_C || '--',
        condition: (current.weatherDesc?.[0]?.value || 'CLEAR').toUpperCase(),
        humidity: current.humidity || '0',
        windSpeed: current.windspeedKmph || '0',
        windDir: current.winddir16Point || 'N',
        pressure: current.pressure || '1013',
        location: city.toUpperCase(),
        feelsLike: current.FeelsLikeC || current.temp_C || '--',
        cloudCover: current.cloudcover || '0',
        precipChance: today.hourly?.[0]?.chanceofrain || '0',
        minTemp: today.mintempC || '--',
        maxTemp: today.maxtempC || '--',
        hourly: hourlyList,
      };

      setWeather(parsed);
      localStorage.setItem('monolith_weather_cache', JSON.stringify(parsed));
      localStorage.setItem('monolith_weather_time', Date.now().toString());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown telemetry anomaly';
      setWeatherError(msg);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    pollWeather();
    const interval = setInterval(() => pollWeather(true), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [pollWeather]);

  useEffect(() => {
    const disableContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', disableContextMenu);
    return () => window.removeEventListener('contextmenu', disableContextMenu);
  }, []);

  useEffect(() => {
    const unlisten = listen('toggle-monolith-deck', () => {
      setIsDashboardVisible((prev) => !prev);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);



  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>(() => {
    return (localStorage.getItem('monolith_time_format') as '12h' | '24h') || '24h';
  });

  const handleToggleTimeFormat = (fmt: '12h' | '24h') => {
    setTimeFormat(fmt);
    localStorage.setItem('monolith_time_format', fmt);
  };



  const { shortcuts, formatBinding } = useShortcutsManager();

  // Listen for background global triggers (hardware keyboard shortcuts) 
  // AND mobile companion web commands emitted by embedded Rust server
  // Stable refs to prevent listener teardown and stale closures
  const audioActionsRef = useRef({
    togglePlay,
    nextTrack,
    prevTrack,
    playTrack,
  });

  useEffect(() => {
    audioActionsRef.current = {
      togglePlay,
      nextTrack,
      prevTrack,
      playTrack,
    };
  });

  // Global media shortcuts + LAN Companion commands (Single Persistent Listener)
  useEffect(() => {
    let isSubscribed = true;
    let unlistenGlobal: (() => void) | undefined;
    let unlistenCompanion: (() => void) | undefined;

    const setup = async () => {
      // 1. Hardware keyboard media keys
      unlistenGlobal = await listen<string>('global-media-action', (event) => {
        if (!isSubscribed) return;
        const { togglePlay, nextTrack, prevTrack } = audioActionsRef.current;
        if (event.payload === 'togglePlay') togglePlay();
        else if (event.payload === 'nextTrack') nextTrack();
        else if (event.payload === 'prevTrack') prevTrack();
      });

      // 2. Mobile companion commands
      unlistenCompanion = await listen<string>('companion-media-command', (event) => {
        if (!isSubscribed) return;
        const { togglePlay, nextTrack, prevTrack, playTrack } = audioActionsRef.current;
        const action = event.payload;

        if (action === 'togglePlay') {
          togglePlay();
        } else if (action === 'nextTrack') {
          nextTrack();
        } else if (action === 'prevTrack') {
          prevTrack();
        } else if (action.startsWith('playIndex/')) {
          const idx = parseInt(action.replace('playIndex/', ''), 10);
          if (!isNaN(idx)) {
            playTrack(idx);
          }
        }
      });
    };

    setup();

    return () => {
      isSubscribed = false;
      if (unlistenGlobal) unlistenGlobal();
      if (unlistenCompanion) unlistenCompanion();
    };
  }, []); // 👈 Empty dependency array: attaches ONCE and stays active permanently

  // 2. Register background global shortcuts with Tauri Rust backend
  useEffect(() => {
    const isSafeForGlobalHook = (binding: any, actionName?: string): boolean => {
      if (!binding || !binding.key) return false;
      if (actionName === 'summonShell') return true; // Always allow summonShell
      
      // Has modifier keys (Ctrl, Alt, Shift) -> Always safe
      if (binding.ctrlKey || binding.altKey || binding.shiftKey) return true;
      
      const k = binding.key;
      if (k.startsWith('F') && /^F\d+$/i.test(k)) return true;
      if (k.startsWith('Numpad')) return true;
      if (['MediaTrackNext', 'MediaTrackPrevious', 'MediaPlayPause'].includes(k)) return true;

      return false;
    };

    const formatForTauri = (binding: any): string | null => {
      if (!binding || !binding.key) return null;
      const parts: string[] = [];
      if (binding.ctrlKey) parts.push('Ctrl');
      if (binding.altKey) parts.push('Alt');
      if (binding.shiftKey) parts.push('Shift');

      let k = binding.key;
      if (k === ' ' || k.toLowerCase() === 'space') {
        parts.push('Space');
      } else if (k.startsWith('Numpad')) {
        parts.push(k);
      } else if (k.length === 1) {
        parts.push(k.toUpperCase());
      } else {
        parts.push(k);
      }
      return parts.join('+');
    };

    const syncKey = async (binding: any, actionName: string) => {
      if (isSafeForGlobalHook(binding, actionName)) {
        const shortcutStr = formatForTauri(binding);
        if (!shortcutStr) return;
        try {
          await invoke('register_global_media_shortcut', {
            shortcutStr,
            action: actionName,
          });
        } catch (err) {
          console.warn(`[GlobalShortcut] Failed to register ${shortcutStr}:`, err);
        }
      } else {
        try {
          await invoke('unregister_global_media_shortcut', { action: actionName });
        } catch {}
      }
    };

    syncKey(shortcuts?.summonShell, 'summonShell');

    syncKey(shortcuts?.audioPlayPause, 'togglePlay');
    syncKey(shortcuts?.audioNext, 'nextTrack');
    syncKey(shortcuts?.audioPrev, 'prevTrack');
  }, [shortcuts]);

  // 3. Local in-app keydown listener (when window is in focus)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');

      // Dynamic Launcher (Defaults to Ctrl + Space)
      if (matchesEvent(shortcuts?.summonLauncher, e)) {
        e.preventDefault();
        setIsLauncherOpen((prev) => !prev);
        return;
      }

      if (!isTyping) {
        // Command Console
        if (e.altKey && (e.key === '"' || e.code === 'Quote')) {
          e.preventDefault();
          setIsConsoleOpen((prev) => !prev);
          return;
        }

        // Deck toggle
        if (matchesEvent(shortcuts?.toggleDeck, e)) {
          e.preventDefault();
          setIsDashboardVisible((prev) => !prev);
          return;
        }

        // Wallpaper Plates
        if (matchesEvent(shortcuts?.togglePlates, e)) {
          e.preventDefault();
          setIsCarouselOpen((prev) => !prev);
          return;
        }

        // Weather HUD
        if (matchesEvent(shortcuts?.toggleWeather, e)) {
          e.preventDefault();
          setIsWeatherOpen((prev) => !prev);
          return;
        }

        // Settings Modal
        if (matchesEvent(shortcuts?.toggleSettings, e)) {
          e.preventDefault();
          setIsSettingsOpen((prev) => !prev);
          return;
        }

        // Audio controls (when in-app)
        if (matchesEvent(shortcuts?.audioPrev, e) || e.code === 'MediaTrackPrevious') {
          e.preventDefault();
          prevTrack();
          return;
        }
        if (matchesEvent(shortcuts?.audioPlayPause, e) || e.code === 'MediaPlayPause') {
          e.preventDefault();
          togglePlay();
          return;
        }
        if (matchesEvent(shortcuts?.audioNext, e) || e.code === 'MediaTrackNext') {
          e.preventDefault();
          nextTrack();
          return;
        }
      }

      if (e.key === 'Escape') {
        setIsCarouselOpen(false);
        setIsLauncherOpen(false);
        setIsWeatherOpen(false);
        setIsSettingsOpen(false);
        setIsConsoleOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, togglePlay, nextTrack, prevTrack]);



  useEffect(() => {
    const currentTrackName = tracks[currentTrackIdx]?.name || '';
    invoke('sync_companion_state', {
      playback: {
        is_playing: isPlaying,
        current_track_idx: currentTrackIdx,
        track_name: currentTrackName,
        current_time: currentTime,
        duration: duration,
        volume: volume,
        is_shuffle: isShuffle,
        tracks: tracks.map((t) => t.name),
        queue: activeQueue, // 👈 True upcoming order
      },
    }).catch(() => {});
  }, [isPlaying, currentTrackIdx, tracks, currentTime, duration, volume, isShuffle, activeQueue]);

  
  return (
    <div
      id="monolith-root"
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        backgroundColor: 'var(--bg-desktop, #07090c)',
        backgroundImage: currentWallpaper
          ? `url(${currentWallpaper})`
          : 'radial-gradient(ellipse at 50% 30%, #151a21 0%, #0a0d12 55%, #050608 100%)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <audio ref={audioRef} crossOrigin="anonymous" onEnded={handleTrackEnded} />

      {/* Seamless Boot Splash Screen */}
      {splashVisible && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: '#07090c',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: splashFade ? 0 : 1,
            transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: 'none',
          }}
        >
          <img
            src="/monolith-logo.png"
            alt="Monolith"
            style={{
              width: '270px',
              height: 'auto',
              animation: 'splashEmblemBloom 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              userSelect: 'none',
            }}
          />

          <div
            className="mono"
            style={{
              marginTop: '36px',
              fontSize: '14.5px',
              fontWeight: 700,
              color: '#f8fafc',
              letterSpacing: '0.24em',
              textShadow: '0 0 12px rgba(255, 255, 255, 0.75), 0 0 24px rgba(248, 250, 252, 0.35)',
              animation: 'splashTextTrack 1.4s 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              opacity: 0,
            }}
          >
            M O N O L I T H // O S
          </div>
        </div>
      )}

      {/* Hardware-accelerated Video Wallpaper Layer */}
      {isVideoWallpaper && currentWallpaper && (
        <video
          ref={videoRef}
          key={currentWallpaper}
          src={currentWallpaper}
          autoPlay
          loop
          muted={videoMuted}
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            pointerEvents: 'none',
            opacity: bootReady ? 1 : 0,
            transition: 'opacity 1s ease',
          }}
        />
      )}

      {/* Optional Whole-Screen Weather Particles for Wallpaper */}
      {showWallpaperWeather && (
        <WeatherAtmosphereOverlay condition={displayWeather?.condition} />
      )}

      {/* Desktop Deck Layer */}
      <div
        className="custom-scrollbar"
        style={{
          width: `${100 / uiScale}vw`,
          height: `${100 / uiScale}vh`,
          zoom: uiScale,
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          opacity: bootReady ? 1 : 0,
          transition: 'opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowX: 'hidden',
          overflowY: 'hidden',
        }}
      >
        {/* Top Status Bar */}
        <header
          {...(!isFullscreen ? { 'data-tauri-drag-region': true } : {})}
          onMouseLeave={handleElementMouseLeave}
          style={{
            height: '46px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            zIndex: 30,
            background: 'var(--bg-header, rgba(7, 9, 12, 0.92))', //[cite: 3]
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid var(--line-eroded)', //[cite: 1, 3]
            fontSize: '11px',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)', //[cite: 1]
            transition: 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: !isFullscreen ? 'default' : 'auto',
          }}
          className="mono"
        >
          {/* Left: Brand & Primary Deck Toggle */}
          <div style={{ display: 'flex', gap: '18px', alignItems: 'center', zIndex: 2 }}>
            <span className="font-display relic-glow" style={{ fontSize: '15px', fontWeight: 800 }}>
              MONOLITH
            </span>
            <button
              onClick={() => setIsDashboardVisible(!isDashboardVisible)}
              className="monolith-btn"
            >
              {isDashboardVisible ? '⏴ STOW_DECK' : '⏵ DEPLOY_DECK'}
            </button>
          </div>

          {/* Center Clock + Weather */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              letterSpacing: '0.12em',
              color: 'var(--text-ash)',
              pointerEvents: 'auto',
            }}
          >
            <div>
              {time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
              {' // '}
              <span className="relic-glow" style={{ fontSize: '11px', fontWeight: 700 }}>
                {time.toLocaleTimeString([], {
                  hour12: timeFormat === '12h',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>

            <button
              onClick={() => setIsWeatherOpen(true)}
              className="monolith-btn"
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--glow-core)',
              }}
              title="Open Weather Telemetry (Alt+Q)"
            >
              <span>{displayWeather ? getWeatherGlyph(displayWeather.condition) : '☁'}</span>
              <span>
                {displayWeather
                  ? tempUnit === 'C'
                    ? `${displayWeather.temp_C}°C`
                    : `${displayWeather.temp_F ?? Math.round(parseFloat(displayWeather.temp_C || '0') * 1.8 + 32)}°F`
                  : '--'}
              </span>
            </button>
          </div>

          {/* Right Action Tags */}
          <div style={{ display: 'flex', gap: '8px', zIndex: 2 }}>
            <button onClick={() => setIsLauncherOpen(true)} className="monolith-btn" title="Spotlight (Ctrl+Space)">
              EXEC //
            </button>
            
            {/* VIEW / PANELS MATRIX BUTTON */}
            <div ref={viewMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setIsViewMenuOpen((prev) => !prev)}
                className={`monolith-btn ${isViewMenuOpen ? 'active' : ''}`}
                title="Viewport Matrix & Panel Manager"
              >
                VIEW //
              </button>

              {/* VIEWPORT MATRIX DROPDOWN */}
              {isViewMenuOpen && (
                <div
                  className="glass-panel mono"
                  style={{
                    position: 'absolute',
                    top: '36px',
                    right: 0,
                    width: '270px',
                    background: 'var(--bg-modal-overlay, rgba(7, 9, 12, 0.98))',
                    border: '1px solid var(--line-eroded, rgba(255, 255, 255, 0.15))',
                    boxShadow: '0 16px 36px rgba(0,0,0,0.95)',
                    padding: '12px',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    overflowX: 'hidden', // <-- FIX: Prevents container horizontal scroll
                  }}
                >
                  <div style={{ fontSize: '10px', color: 'var(--glow-core)', fontWeight: 700 }}>
                    // VIEWPORT MATRIX
                  </div>

                  {/* Panel Visibility Checkboxes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px' }}>
                    {[
                      { id: 'music', label: 'MUSIC REPOSITORY' },
                      { id: 'visualizer', label: 'SPECTRUM VISUALIZER' },
                      { id: 'monitor', label: 'SYSTEM VITALS' },
                      { id: 'telemetry', label: 'TELEMETRY & LOGS' },
                      { id: 'explorer', label: 'WORKSPACE FILES' },
                      // 👇 ADD THIS 6TH ITEM DIRECTLY TO THE ARRAY:
                      { id: 'remote', label: 'UPLINK // COMPANION' },
                    ].map((item) => (
                      <label
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          color: panels[item.id]?.visible ? 'var(--text-ash, #e2e8f0)' : 'rgba(255, 255, 255, 0.25)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!!panels[item.id]?.visible}
                          onChange={() => togglePanelVisibility(item.id)}
                          style={{ accentColor: 'var(--glow-core, #38bdf8)', cursor: 'pointer' }}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>

                  <div className="weathered-line" style={{ height: '1px', background: 'var(--line-weathered, rgba(255,255,255,0.06))' }} />

                  {/* Presets List with Fixed Scrollbar & No Horizontal Overflow */}
                  {/* Saved Workspaces Header Line */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-ash)', fontWeight: 600 }}>
                      SAVED WORKSPACES:
                    </span>
                    <button
                      onClick={handleOpenLayoutsFolder}
                      className="monolith-btn"
                      style={{ fontSize: '8.5px', padding: '1px 6px' }}
                      title="Open media/layouts folder in Explorer"
                    >
                      [ 📂 OPEN FOLDER ]
                    </button>
                  </div>
                  <div
                    className="custom-scrollbar"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      maxHeight: '120px',
                      overflowY: 'auto',
                      overflowX: 'hidden', // <-- FIX: Cleans out stuck horizontal scrollbar
                      paddingRight: '2px',
                    }}
                  >
                    {getSavedPresets().length === 0 ? (
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>NO CUSTOM PRESETS</span>
                    ) : (
                      getSavedPresets().map((preset) => (
                        <div
                          key={preset.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            width: '100%',
                            overflow: 'hidden', // <-- FIX: Prevents button row pushing width
                          }}
                        >
                          <button
                            onClick={() => loadPreset(preset)}
                            className="monolith-btn"
                            style={{
                              flex: 1,
                              minWidth: 0, // Allows text truncation to work inside flexbox
                              fontSize: '9px',
                              padding: '3px 6px',
                              textAlign: 'left',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={`Load ${preset.name}`}
                          >
                            &gt; {preset.name}
                          </button>
                          <button
                            onClick={() => deletePreset(preset.name)}
                            className="monolith-btn"
                            style={{
                              fontSize: '9px',
                              padding: '3px 6px',
                              color: '#ff6b6b',
                              borderColor: 'rgba(255, 107, 107, 0.25)',
                              flexShrink: 0,
                            }}
                            title={`Delete ${preset.name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Save Preset Input */}
                  {isSavingPreset ? (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="PRESET NAME..."
                        className="mono"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newPresetName.trim()) {
                            saveCurrentPreset(newPresetName.trim());
                            setNewPresetName('');
                            setIsSavingPreset(false);
                          } else if (e.key === 'Escape') {
                            setIsSavingPreset(false);
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: '9px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--line-weathered)',
                          color: '#fff',
                          padding: '2px 4px',
                        }}
                      />
                      <button
                        onClick={() => {
                          if (newPresetName.trim()) {
                            saveCurrentPreset(newPresetName.trim());
                            setNewPresetName('');
                            setIsSavingPreset(false);
                          }
                        }}
                        className="monolith-btn active"
                        style={{ fontSize: '9px', padding: '2px 6px', flexShrink: 0 }}
                      >
                        SAVE
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsSavingPreset(true)}
                      className="monolith-btn"
                      style={{ fontSize: '9px', padding: '3px' }}
                    >
                      [ + SAVE CURRENT VIEW ]
                    </button>
                  )}

                  <button
                    onClick={resetToDefault}
                    className="monolith-btn"
                    style={{ fontSize: '8.5px', padding: '3px', color: '#ff6b6b', borderColor: '#ff6b6b33' }}
                  >
                    [ ⟲ RESET TO DEFAULT ]
                  </button>
                </div>
              )}
            </div>
            

            <button onClick={() => setIsCarouselOpen(true)} className="monolith-btn" title="Wallpapers (Alt+W)">
              PLATES //
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="monolith-btn"
              title="System Preferences (Alt+,)"
            >
              SETTINGS //
            </button>
          </div>
        </header>

        {/* Workspace 1: Multi-Widget Deck */}
        {/* Fluid Modular Deck Canvas */}
        <main
          style={{
            position: 'absolute',
            inset: 0,
            top: '46px',
            overflow: 'hidden',
            transform: isDashboardVisible ? 'translateX(0)' : 'translateX(-105%)',
            transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: isDashboardVisible ? 'auto' : 'none',
          }}
        >
          {/* 1. MUSIC PLAYER PANEL */}
          <DeckPanel
            bounds={panels.music}
            isMaximized={maximizedPanelId === 'music'}
            isAnyPanelMaximized={maximizedPanelId !== null}
            title="AUDIO // DECK"
            onBringToFront={bringToFront}
            onUpdateBounds={updatePanelBounds}
            onToggleMaximize={toggleMaximize}
            onClose={togglePanelVisibility}
          >
            {panels.music.visible && (
              <MusicPlayer
                tracks={tracks}
                currentTrackIdx={currentTrackIdx}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                volume={volume}
                folderPath={folderPath}
                isShuffle={isShuffle}
                repeatMode={repeatMode}
                onTogglePlay={togglePlay}
                onSelectTrack={playTrack}
                onNext={nextTrack}
                onPrev={prevTrack}
                onSeek={seek}
                onVolumeChange={setAudioVolume}
                onToggleShuffle={toggleShuffle}
                onCycleRepeat={cycleRepeatMode}
                onLoadFolder={loadFolder}
              />
            )}
          </DeckPanel>

          {/* 2. AUDIO VISUALIZER PANEL */}
          <DeckPanel
            bounds={panels.visualizer}
            isMaximized={maximizedPanelId === 'visualizer'}
            isAnyPanelMaximized={maximizedPanelId !== null}
            title="SPECTRUM // FFT"
            onBringToFront={bringToFront}
            onUpdateBounds={updatePanelBounds}
            onToggleMaximize={toggleMaximize}
            onClose={togglePanelVisibility}
          >
            {panels.visualizer.visible && (
              <Visualizer analyserRef={analyserRef} barCount={46} />
            )}
          </DeckPanel>

          {/* 3. SYSTEM VITALS MONITOR PANEL */}
          <DeckPanel
            bounds={panels.monitor}
            isMaximized={maximizedPanelId === 'monitor'}
            isAnyPanelMaximized={maximizedPanelId !== null}
            title="TELEMETRY // VITALS"
            onBringToFront={bringToFront}
            onUpdateBounds={updatePanelBounds}
            onToggleMaximize={toggleMaximize}
            onClose={togglePanelVisibility}
          >
            {panels.monitor.visible && (
              <SystemMonitor />
            )}
          </DeckPanel>

          {/* 4. KERNEL TELEMETRY & SHORTCUTS PANEL */}
          <DeckPanel
            bounds={panels.telemetry}
            isMaximized={maximizedPanelId === 'telemetry'}
            isAnyPanelMaximized={maximizedPanelId !== null}
            title="KERNEL // LOGS"
            onBringToFront={bringToFront}
            onUpdateBounds={updatePanelBounds}
            onToggleMaximize={toggleMaximize}
            onClose={togglePanelVisibility}
          >
            {panels.telemetry.visible && (
              <div
                style={{
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                }}
              >
                <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  SYSTEM SITREP // CORE ONLINE
                  <br></br>
                  &gt; Background: {isVideoWallpaper ? 'Live Stream Video' : 'Static Relic Plate'}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>
                  Press <code className="mono">{formatBinding('toggleDeck')}</code> to stow deck. 
                  <br></br>
                  Launcher: <code className="mono">{formatBinding('summonLauncher')}</code> | 
                  <br></br>
                  Plates: <code className="mono">{formatBinding('togglePlates')}</code> | 
                  <br></br>
                  Weather: <code className="mono">{formatBinding('toggleWeather')}</code>
                  <br></br>
                  Settings: <code className="mono">{formatBinding('toggleSettings')}</code>
                  <br></br>
                  Drag panel headers to arrange; drag bottom-right corner to resize.
                </div>
              </div>
            )}
          </DeckPanel>

          {/* 5. WORKSPACE FILE EXPLORER PANEL */}
          <DeckPanel
            bounds={panels.explorer}
            isMaximized={maximizedPanelId === 'explorer'}
            isAnyPanelMaximized={maximizedPanelId !== null}
            title="WORKSPACE"
            onBringToFront={bringToFront}
            onUpdateBounds={updatePanelBounds}
            onToggleMaximize={toggleMaximize}
            onClose={togglePanelVisibility}
          >
            {panels.explorer.visible && (
              <FileExplorer />
            )}
          </DeckPanel>

          {/* 6. LAN COMPANION / REMOTE UPLINK PANEL */}
          {panels.remote && (
            <DeckPanel
              bounds={panels.remote}
              isMaximized={maximizedPanelId === 'remote'}
              isAnyPanelMaximized={maximizedPanelId !== null}
              title="UPLINK // COMPANION"
              onBringToFront={bringToFront}
              onUpdateBounds={updatePanelBounds}
              onToggleMaximize={toggleMaximize}
              onClose={togglePanelVisibility}
            >
              {panels.remote.visible && <RemoteUplink />}
            </DeckPanel>
          )}
        </main> 
      

        {/* Modals */}
        <WeatherModal
          isOpen={isWeatherOpen}
          onClose={() => setIsWeatherOpen(false)}
          weather={displayWeather}
          loading={weatherLoading}
          error={weatherError}
          onRefresh={() => pollWeather(true)}
          tempUnit={tempUnit}
          onToggleTempUnit={handleToggleTempUnit}
        />

        {/* Wallpaper Cover Flow Modal */}
        {isCarouselOpen && (
          <WallpaperCarousel
            isOpen={isCarouselOpen}
            onSelect={(url) => {
              setCurrentWallpaper(url);
              localStorage.setItem('monolith_active_wallpaper', url);
              setIsCarouselOpen(false);
            }}
            onClose={() => setIsCarouselOpen(false)}
          />
        )}

        <LauncherModal isOpen={isLauncherOpen} onClose={() => setIsLauncherOpen(false)} />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          videoMuted={videoMuted}
          onToggleVideoMuted={handleToggleVideoMuted}
          videoVolume={videoVolume}
          onVideoVolumeChange={handleVideoVolumeChange}
          showWallpaperWeather={showWallpaperWeather}
          onToggleWallpaperWeather={handleToggleWallpaperWeather}
          onSetWeatherOverride={setWeatherOverride}
          isFullscreen={isFullscreen}
          onToggleFullscreen={(val) => {
            const appWindow = getCurrentWebviewWindow();
            appWindow.setFullscreen(val);
            setIsFullscreen(val);
          }}
          uiScale={uiScale}
          onSetUiScale={handleSetUiScale}
          tempUnit={tempUnit}
          onToggleTempUnit={handleToggleTempUnit}
          timeFormat={timeFormat}
          onToggleTimeFormat={handleToggleTimeFormat}
          audioVolume={volume}
          onAudioVolumeChange={setAudioVolume}
          audioDeviceId={audioDeviceId}
          onSetAudioDevice={setAudioDevice}
        />

        <CommandConsole
          isOpen={isConsoleOpen}
          onClose={() => setIsConsoleOpen(false)}
          onSetWeatherOverride={setWeatherOverride}
          onPollWeather={pollWeather}
          onToggleDeck={() => setIsDashboardVisible((prev) => !prev)}
        />
      </div>
    </div>
  );
}