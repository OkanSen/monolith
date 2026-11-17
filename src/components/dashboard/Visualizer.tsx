import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Canvas2DBars } from './visualizers/Canvas2DBars';
import { GLSLShaders, ShaderMode } from './visualizers/GLSLShaders';
import { CustomScriptVisualizer } from './visualizers/CustomScriptVisualizer';

export interface CustomVisualizerItem {
  id: string;
  name: string;
  filename: string;
  path: string;
  kind: 'shader' | 'script';
}

interface VisualizerProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  barCount?: number;
}

interface VisualizerOption {
  id: string;
  label: string;
  type: 'built_in_bars' | 'built_in_shader' | 'custom';
  shaderMode?: ShaderMode;
  customItem?: CustomVisualizerItem;
}

// 1. Baseline engines defined explicitly first
const BUILT_IN_MODES: VisualizerOption[] = [
  { id: 'BARS', label: 'BARS', type: 'built_in_bars' },
  { id: 'ASTRAL_WARP', label: 'ASTRAL WARP', type: 'built_in_shader', shaderMode: 'ASTRAL_WARP' },
  { id: 'SOLAR_VORTEX', label: 'SOLAR VORTEX', type: 'built_in_shader', shaderMode: 'SOLAR_VORTEX' },
  { id: 'HYPER_TUBE', label: 'HYPER TUBE', type: 'built_in_shader', shaderMode: 'HYPER_TUBE' },
  { id: 'MENGER_TESSERACT', label: 'MENGER TESSERACT', type: 'built_in_shader', shaderMode: 'MENGER_TESSERACT' },
];

export const Visualizer: React.FC<VisualizerProps> = ({ analyserRef, barCount = 44 }) => {
  const [customList, setCustomList] = useState<CustomVisualizerItem[]>([]);
  const [activeId, setActiveId] = useState<string>(() => {
    return localStorage.getItem('monolith_visualizer_mode') || 'BARS';
  });

  // Dropdown menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadVisualizers = useCallback(async () => {
    try {
      const savedDir = localStorage.getItem('monolith_custom_visualizers_dir');
      const resolvedDir = await invoke<string>('get_visualizers_directory', { customDir: savedDir || null });
      localStorage.setItem('monolith_custom_visualizers_dir', resolvedDir);

      const items = await invoke<CustomVisualizerItem[]>('list_custom_visualizers', { folderPath: resolvedDir });
      setCustomList(items);
    } catch (err) {
      console.warn('Could not scan custom visualizers:', err);
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      window.addEventListener('mousedown', handleClickOutside, true);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isMenuOpen]);

  // Unified filesystem and storage listener
  useEffect(() => {
    loadVisualizers();

    const handleCustomUpdate = () => loadVisualizers();
    const handleStorageUpdate = (e: StorageEvent) => {
      if (e.key === 'monolith_visualizer_rescan') {
        loadVisualizers();
      }
    };

    window.addEventListener('monolith-visualizers-updated', handleCustomUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    return () => {
      window.removeEventListener('monolith-visualizers-updated', handleCustomUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [loadVisualizers]);

  // Ordering: Hardcoded baseline engines come first, followed by custom scripts
  const allOptions: VisualizerOption[] = [
    ...BUILT_IN_MODES,
    ...customList.map((item) => ({
      id: item.id,
      label: item.name.toUpperCase(),
      type: 'custom' as const,
      customItem: item,
    })),
  ];

  const currentIndex = allOptions.findIndex((opt) => opt.id === activeId);
  const activeOption = currentIndex !== -1 ? allOptions[currentIndex] : allOptions[0];

  const selectOption = (id: string) => {
    setActiveId(id);
    localStorage.setItem('monolith_visualizer_mode', id);
    setIsMenuOpen(false);
  };

  const cycleMode = () => {
    const nextIdx = (currentIndex + 1) % allOptions.length;
    const nextOpt = allOptions[nextIdx];
    setActiveId(nextOpt.id);
    localStorage.setItem('monolith_visualizer_mode', nextOpt.id);
  };

  // Themed Timed Tooltip State
  const [showTooltip, setShowTooltip] = useState(false);
  const isHoveredRef = useRef(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleViewportMouseEnter = () => {
    // Only trigger if entering fresh from the outside
    if (!isHoveredRef.current) {
      isHoveredRef.current = true;
      setShowTooltip(true);

      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }

      // Auto-hide after 2.5 seconds
      tooltipTimerRef.current = setTimeout(() => {
        setShowTooltip(false);
      }, 2500);
    }
  };

  const handleViewportMouseLeave = () => {
    // Reset state so next fresh mouse entrance can re-trigger
    isHoveredRef.current = false;
    setShowTooltip(false);
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <div
        className="mono"
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--line-weathered, rgba(255, 255, 255, 0.05))',
          fontSize: '10px',
          color: 'var(--text-ash, #64748b)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
        }}
      >
        <span className="relic-glow" style={{ fontSize: '10px' }}>
          RESONANCE // HARMONIC DYNAMICS
        </span>

        {/* Dropdown Selector */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className={`monolith-btn ${isMenuOpen ? 'active' : ''}`}
            style={{
              fontSize: '9.5px',
              padding: '3px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ color: 'var(--glow-core)', fontWeight: 700 }}>
              {activeOption.label}
            </span>
            <span style={{ fontSize: '8px', opacity: 0.7 }}>▾</span>
          </button>

          {/* Brutalist Preset Matrix Popover */}
          {isMenuOpen && (
            <div
              className="glass-panel mono custom-scrollbar"
              style={{
                position: 'absolute',
                top: '28px',
                right: 0,
                width: '210px',
                maxHeight: '260px',
                background: 'var(--bg-modal-overlay, rgba(7, 9, 12, 0.98))',
                border: '1px solid var(--line-eroded, rgba(255, 255, 255, 0.15))',
                boxShadow: '0 12px 30px rgba(0, 0, 0, 0.9)',
                padding: '8px',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {/* Category 1: Baseline Engines */}
              <div style={{ fontSize: '8.5px', color: 'var(--glow-core)', fontWeight: 700, letterSpacing: '0.08em', padding: '2px 4px' }}>
                // BASELINE ENGINES
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {BUILT_IN_MODES.map((mode) => {
                  const isSelected = activeOption.id === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => selectOption(mode.id)}
                      className={`monolith-btn ${isSelected ? 'active' : ''}`}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        fontSize: '9px',
                        padding: '4px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{mode.label}</span>
                      {isSelected && <span style={{ color: 'var(--glow-core)' }}>●</span>}
                    </button>
                  );
                })}
              </div>

              {/* Category 2: Custom Scripts from Disk */}
              {customList.length > 0 && (
                <>
                  <div className="weathered-line" style={{ height: '1px', background: 'var(--line-weathered, rgba(255,255,255,0.08))', margin: '4px 0' }} />
                  <div style={{ fontSize: '8.5px', color: 'var(--text-ash)', fontWeight: 700, letterSpacing: '0.08em', padding: '2px 4px' }}>
                    // CUSTOM SCRIPTS
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {customList.map((item) => {
                      const isSelected = activeOption.id === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => selectOption(item.id)}
                          className={`monolith-btn ${isSelected ? 'active' : ''}`}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            fontSize: '9px',
                            padding: '4px 6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                          }}
                          title={item.filename}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            &gt; {item.name.toUpperCase()}
                          </span>
                          {isSelected && <span style={{ color: 'var(--glow-core)' }}>●</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="weathered-line" />

      {/* Dynamic Viewport Container */}
      <div
        onClick={cycleMode}
        onMouseEnter={handleViewportMouseEnter}
        onMouseLeave={handleViewportMouseLeave}
        style={{
          flex: 1,
          padding: 0,
          background: 'transparent',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Themed Monolith HUD Tooltip (Disappears after 2.5s) */}
        <div
          className="mono"
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            padding: '5px 10px',
            background: 'var(--bg-modal-overlay, rgba(7, 9, 12, 0.92))',
            border: '1px solid var(--line-weathered, rgba(255, 255, 255, 0.12))',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.85)',
            fontSize: '9px',
            color: 'var(--text-ash, #94a3b8)',
            letterSpacing: '0.08em',
            pointerEvents: 'none',
            zIndex: 20,
            opacity: showTooltip ? 1 : 0,
            transform: showTooltip ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <span style={{ color: 'var(--glow-core)', fontWeight: 700 }}>CLICK VIEWPORT</span> // CYCLE ENGINE
        </div>

        {activeOption.type === 'built_in_bars' && (
          <Canvas2DBars analyserRef={analyserRef} barCount={barCount} />
        )}

        {activeOption.type === 'built_in_shader' && activeOption.shaderMode && (
          <GLSLShaders key={activeOption.id} analyserRef={analyserRef} mode={activeOption.shaderMode} />
        )}

        {activeOption.type === 'custom' && activeOption.customItem && (
          <CustomScriptVisualizer
            key={activeOption.customItem.path}
            analyserRef={analyserRef}
            scriptPath={activeOption.customItem.path}
          />
        )}
      </div>
    </div>
  );
};