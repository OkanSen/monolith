import React, { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface InstalledApp {
  name: string;
  path: string;
}

interface RecentAppItem {
  name: string;
  path: string;
  icon?: string;
  badgeBg?: string;
}

const RECENT_KEY = 'monolith_recent_apps_v2';

interface LauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getAppBadgeColor = (name: string): string => {
  const hues = [
    'rgba(56, 189, 248, 0.18)',
    'rgba(168, 85, 247, 0.18)',
    'rgba(244, 63, 94, 0.18)',
    'rgba(234, 179, 8, 0.18)',
    'rgba(34, 197, 94, 0.18)',
    'rgba(99, 102, 241, 0.18)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hues[Math.abs(hash) % hues.length];
};

const getAppIcon = (name: string): string | null => {
  const lower = name.toLowerCase();
  if (lower.includes('terminal') || lower.includes('powershell')) return '⚡';
  if (lower.includes('cmd') || lower.includes('command')) return '💻';
  if (lower.includes('explorer') || lower.includes('files')) return '📁';
  if (lower.includes('task') || lower.includes('monitor')) return '📊';
  if (lower.includes('note') || lower.includes('word') || lower.includes('doc')) return '📓';
  if (lower.includes('calc')) return '🧮';
  if (lower.includes('code') || lower.includes('studio') || lower.includes('dev')) return '⌨️';
  if (lower.includes('fl studio') || lower.includes('ableton') || lower.includes('music')) return '🎹';
  if (lower.includes('figma') || lower.includes('photoshop') || lower.includes('paint')) return '🎨';
  if (lower.includes('chrome') || lower.includes('firefox') || lower.includes('edge') || lower.includes('browser')) return '🌐';
  if (lower.includes('steam') || lower.includes('game')) return '🎮';
  return null;
};

export const LauncherModal: React.FC<LauncherModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [recentApps, setRecentApps] = useState<RecentAppItem[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);

      invoke<InstalledApp[]>('get_installed_apps')
        .then((apps) => setInstalledApps(apps))
        .catch((err) => console.error('Failed to index system apps:', err));
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return installedApps
      .filter((app) => app.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aLower = a.name.toLowerCase();
        const bLower = b.name.toLowerCase();
        const aStarts = aLower.startsWith(q);
        const bStarts = bLower.startsWith(q);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return aLower.localeCompare(bLower);
      })
      .slice(0, 10);
  }, [query, installedApps]);

  const recordRecentLaunch = (name: string, path: string) => {
    const icon = getAppIcon(name) || name.slice(0, 2).toUpperCase();
    const badgeBg = getAppBadgeColor(name);

    const item: RecentAppItem = {
      name,
      path,
      icon,
      badgeBg,
    };

    setRecentApps((prev) => {
      const filteredPrev = prev.filter(
        (p) => p.path.toLowerCase() !== path.toLowerCase()
      );
      const updated = [item, ...filteredPrev].slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const executeLaunch = async (name: string, targetPath: string) => {
    if (!targetPath.trim()) return;
    try {
      await invoke('launch_command', { target: targetPath });
      recordRecentLaunch(name, targetPath);
    } catch (err) {
      console.error('Launch failure:', err);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0 && selectedIndex < filtered.length) {
        executeLaunch(filtered[selectedIndex].name, filtered[selectedIndex].path);
      } else if (query.trim()) {
        executeLaunch(query.trim().toUpperCase(), query.trim());
      }
    }
  };

  const handlePowerAction = async (action: 'shutdown' | 'restart' | 'lock') => {
    try {
      await invoke('system_power_action', { action });
    } catch (err) {
      console.error('Power action failure:', err);
    }
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className={`monolith-modal-overlay ${isOpen ? 'open' : ''}`}
      style={{
        backgroundColor: 'var(--bg-modal-overlay, rgba(5, 6, 8, 0.76))',
        backdropFilter: 'blur(16px)',
        zIndex: 50,
        position: 'fixed',
        inset: 0,
      }}
    >
      {/* 1. LEFT SCREEN EDGE: RECENT SIGNALS */}
      {recentApps.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '32px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 60,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: '8.5px',
              color: 'var(--text-fossil)',
              letterSpacing: '0.14em',
              marginBottom: '4px',
              paddingLeft: '4px',
            }}
          >
            // RECENT SIGNALS
          </div>
          {recentApps.map((app) => (
            <div
              key={app.path}
              onClick={() => executeLaunch(app.name, app.path)}
              className="glass-panel"
              title={`Launch ${app.name}`}
              style={{
                width: '185px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                border: '1px solid var(--line-weathered)',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--glow-core)';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--line-weathered)';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: app.badgeBg || 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--line-weathered)',
                  fontSize: app.icon && app.icon.length > 2 ? '13px' : '9px',
                  fontWeight: 700,
                  color: 'var(--glow-core)',
                  flexShrink: 0,
                }}
              >
                {app.icon || app.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--glow-core)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {app.name}
                </span>
                <span className="mono" style={{ fontSize: '8px', color: 'var(--text-ash)' }}>
                  RECENT
                </span>
              </div>
              <span className="mono" style={{ fontSize: '9px', color: 'var(--text-fossil)' }}>
                ⏵
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 2. CENTER: DYNAMIC SPOTLIGHT SEARCH */}
      <div
        className="monolith-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '560px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 55,
        }}
      >
        <div
          className="glass-panel"
          style={{
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 30px 70px rgba(0,0,0,0.96)',
            border: '1px solid var(--line-eroded)',
          }}
        >
          {/* Search Input Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: query.trim() ? '14px' : '0' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder={`Search ${installedApps.length > 0 ? installedApps.length + ' indexed apps' : 'installed programs'} or type command...`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="mono"
              style={{
                flex: 1,
                background: 'var(--bg-slot, rgba(0, 0, 0, 0.55))',
                border: '1px solid var(--line-eroded)',
                color: 'var(--glow-core)',
                padding: '12px 14px',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          {/* Results Dropdown */}
          {query.trim().length > 0 && (
            <div className="custom-scrollbar" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div
                  onClick={() => executeLaunch(query.trim().toUpperCase(), query.trim())}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--glow-core)',
                  }}
                >
                  <span style={{ fontSize: '15px', marginRight: '10px' }}>⚡</span>
                  <span style={{ flex: 1, fontSize: '12px', color: 'var(--glow-core)' }} className="mono">
                    EXECUTE DIRECT: &quot;{query}&quot;
                  </span>
                  <span className="mono" style={{ fontSize: '9px', color: 'var(--text-ash)' }}>
                    [ENTER]
                  </span>
                </div>
              ) : (
                filtered.map((app, idx) => {
                  const isSelected = idx === selectedIndex;
                  const glyph = getAppIcon(app.name);
                  const badgeColor = getAppBadgeColor(app.name);

                  return (
                    <div
                      key={app.path}
                      onClick={() => executeLaunch(app.name, app.path)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        marginBottom: '2px',
                        background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        borderLeft: isSelected ? '2px solid var(--glow-core)' : '2px solid transparent',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: '12px',
                          background: badgeColor,
                          border: '1px solid var(--line-weathered)',
                          fontSize: glyph ? '14px' : '9.5px',
                          fontWeight: 700,
                          color: 'var(--glow-core)',
                          flexShrink: 0,
                        }}
                      >
                        {glyph || app.name.slice(0, 2).toUpperCase()}
                      </div>

                      <span
                        style={{
                          flex: 1,
                          fontSize: '12px',
                          color: isSelected ? '#ffffff' : 'var(--glow-core)',
                          fontWeight: 500,
                        }}
                      >
                        {app.name}
                      </span>
                      <span style={{ fontSize: '9px', color: 'var(--text-ash)' }} className="mono">
                        APP
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Navigation Hint Footer */}
          <div
            className="mono"
            style={{
              marginTop: query.trim() ? '14px' : '10px',
              paddingTop: '8px',
              borderTop: '1px solid var(--line-weathered)',
              fontSize: '9px',
              color: 'var(--text-ash)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{query.trim() ? '↑/↓ NAVIGATE // ENTER EXECUTE' : 'TYPE APP NAME TO QUERY SYSTEM'}</span>
            <span>ESC DISMISS</span>
          </div>
        </div>
      </div>

      {/* 3. RIGHT SCREEN EDGE: LARGE ROUND POWER CONTROLS */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          right: '64px',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          alignItems: 'center',
          zIndex: 60,
        }}
      >
        {/* LOCK BUTTON */}
        <button
          onClick={() => handlePowerAction('lock')}
          title="Lock Workstation"
          className="monolith-btn"
          style={{
            width: '128px',
            height: '128px',
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            background: 'var(--stone-plate, rgba(14, 18, 23, 0.85))',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.95), inset 0 0 24px rgba(0,0,0,0.8)',
            border: '2px solid var(--line-eroded)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--glow-aura, rgba(203, 213, 225, 0.9))';
            e.currentTarget.style.boxShadow = '0 0 25px var(--glow-aura, rgba(203, 213, 225, 0.35))';
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--line-eroded)';
            e.currentTarget.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.95), inset 0 0 24px rgba(0,0,0,0.8)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <span>⇥</span>
          <span style={{ fontSize: '10px', marginTop: '6px', letterSpacing: '0.14em', color: 'var(--text-ash)' }}>
            LOCK
          </span>
        </button>

        {/* RESTART BUTTON */}
        <button
          onClick={() => handlePowerAction('restart')}
          title="Restart System"
          className="monolith-btn"
          style={{
            width: '128px',
            height: '128px',
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            background: 'var(--stone-plate, rgba(14, 18, 23, 0.85))',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.95), inset 0 0 24px rgba(0,0,0,0.8)',
            border: '2px solid var(--line-eroded)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-cyan, #38bdf8)';
            e.currentTarget.style.boxShadow = '0 0 25px rgba(56, 189, 248, 0.45)';
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--line-eroded)';
            e.currentTarget.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.95), inset 0 0 24px rgba(0,0,0,0.8)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <span>↻</span>
          <span style={{ fontSize: '10px', marginTop: '6px', letterSpacing: '0.14em', color: 'var(--text-ash)' }}>
            RESTART
          </span>
        </button>

        {/* SHUTDOWN BUTTON */}
        <button
          onClick={() => handlePowerAction('shutdown')}
          title="Shutdown System"
          className="monolith-btn"
          style={{
            width: '128px',
            height: '128px',
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            background: 'var(--stone-plate, rgba(14, 18, 23, 0.85))',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.95), inset 0 0 24px rgba(0,0,0,0.8)',
            border: '2px solid var(--line-eroded)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-alert, #ff4d4d)';
            e.currentTarget.style.color = 'var(--accent-alert, #ff4d4d)';
            e.currentTarget.style.boxShadow = '0 0 30px rgba(255, 77, 77, 0.5)';
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--line-eroded)';
            e.currentTarget.style.color = 'var(--text-ash)';
            e.currentTarget.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.95), inset 0 0 24px rgba(0,0,0,0.8)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <span>⏻</span>
          <span style={{ fontSize: '10px', marginTop: '6px', letterSpacing: '0.14em' }}>
            POWER
          </span>
        </button>
      </div>
    </div>
  );
};