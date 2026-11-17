import React, { useState, useMemo, useRef } from 'react';
import { Track, RepeatMode } from '../../hooks/useAudioManager';
import { open } from '@tauri-apps/plugin-dialog';

interface MusicPlayerProps {
  tracks: Track[];
  currentTrackIdx: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  folderPath: string;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  onTogglePlay: () => void;
  onSelectTrack: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onLoadFolder: (path: string) => void;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  tracks,
  currentTrackIdx,
  isPlaying,
  currentTime,
  duration,
  volume,
  //folderPath,
  isShuffle,
  repeatMode,
  onTogglePlay,
  onSelectTrack,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onToggleShuffle,
  onCycleRepeat,
  onLoadFolder,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const currentTrack = currentTrackIdx >= 0 && currentTrackIdx < tracks.length ? tracks[currentTrackIdx] : null;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Visual-only filter: preserves original track indices so playback is unaffected
  const visibleTracks = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const mapped = tracks.map((track, originalIdx) => ({ track, originalIdx }));
    if (!q) return mapped;
    return mapped.filter(({ track }) => track.name.toLowerCase().includes(q));
  }, [tracks, filterQuery]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const handleBrowseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Folder',
      });
      if (selected && typeof selected === 'string') {
        onLoadFolder(selected);
      }
    } catch (err) {
      console.error('Directory picker error:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Top Header - Repository Navigation */}
      <div
        className="mono"
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--line-weathered, rgba(255, 255, 255, 0.05))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '10px',
        }}
      >
        <span style={{ color: 'var(--text-ash, #64748b)', letterSpacing: '0.12em' }}>FREQUENCY // ARCHIVE PIPELINE</span>
        <button
          onClick={handleBrowseFolder}
          title="Browse Directory with Windows Explorer"
          className="monolith-btn"
          style={{ padding: '3px 8px', fontSize: '9px' }}
        >
          [ DIR // BROWSE ]
        </button>
      </div>

      {/* Expanded Hero Now Playing Section */}
      <div
        style={{
          padding: '18px 16px 14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          borderBottom: '1px solid var(--line-weathered, rgba(255, 255, 255, 0.05))',
          background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.15))',
        }}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {/* Artwork Container */}
          <div
            style={{
              width: '78px',
              height: '78px',
              borderRadius: 'var(--panel-radius, 0px)',
              background: 'var(--stone-carved, rgba(4, 5, 7, 0.85))',
              border: '1px solid var(--line-eroded, rgba(180, 195, 210, 0.14))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              boxShadow: 'inset 0 0 16px rgba(0,0,0,0.9)',
            }}
          >
            {currentTrack?.cover_art ? (
              <img
                src={currentTrack.cover_art}
                alt="cover"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-ash, #64748b)" strokeWidth="1.5">
                <rect x="4" y="4" width="16" height="16" />
                <path d="M9 12l6 0" />
                <path d="M12 9l0 6" />
              </svg>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="mono"
              style={{
                fontWeight: 700,
                fontSize: '13px',
                color: 'var(--glow-core, #f1f5f9)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                letterSpacing: '0.04em',
                lineHeight: '1.2',
              }}
              title={currentTrack ? currentTrack.name : ''}
            >
              {currentTrack ? currentTrack.name : 'NO_SIGNAL // EMPTY'}
            </div>

            <div style={{ color: 'var(--text-ash, #64748b)', fontSize: '10px', marginTop: '4px' }} className="mono">
              {tracks.length > 0
                ? `TRACK ${(currentTrackIdx + 1).toString().padStart(2, '0')} // ${tracks.length} SIGNALS`
                : '0 SIGNALS INDEXED'}
            </div>

            {/* Volume Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-ash, #64748b)" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                style={{
                  width: '96px',
                  height: '3px',
                  accentColor: 'var(--glow-core, #f1f5f9)',
                  cursor: 'pointer',
                  background: 'var(--bg-slot, rgba(255, 255, 255, 0.12))',
                }}
              />
              <span className="mono" style={{ fontSize: '9px', color: 'var(--text-ash, #64748b)' }}>
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Real Progress Bar */}
        <div>
          <div
            onClick={handleProgressClick}
            className="carved-slot"
            style={{
              width: '100%',
              height: '5px',
              cursor: 'pointer',
              position: 'relative',
              borderRadius: 'var(--panel-radius, 0px)',
              background: 'var(--bg-slot, rgba(0, 0, 0, 0.85))',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: 'var(--glow-core, #f1f5f9)',
                boxShadow: '0 0 8px var(--glow-aura, rgba(203, 213, 225, 0.35))',
                transition: 'width 0.1s linear',
              }}
            />
          </div>

          {/* Timestamps */}
          <div
            className="mono"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '9.5px',
              color: 'var(--text-ash, #64748b)',
              marginTop: '5px',
              letterSpacing: '0.06em',
            }}
          >
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Uniform Controls Row */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
          {/* Shuffle Toggle */}
          <button
            onClick={onToggleShuffle}
            title={isShuffle ? 'SHUFFLE // ACTIVE' : 'SHUFFLE // OFF'}
            className={`monolith-btn ${isShuffle ? 'active' : ''}`}
            style={{
              width: '40px',
              height: '34px',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            {isShuffle && <span style={{ width: '12px', height: '1px', background: 'currentColor' }} />}
          </button>

          {/* Prev */}
          <button
            onClick={onPrev}
            className="monolith-btn"
            style={{
              width: '40px',
              height: '34px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          </button>

          {/* Play / Pause */}
          <button
            onClick={onTogglePlay}
            className={`monolith-btn ${isPlaying ? 'active' : ''}`}
            style={{
              flex: 1,
              height: '34px',
              maxWidth: '96px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '10px',
              fontWeight: 700,
            }}
          >
            {isPlaying ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                <span>HALT</span>
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>EMIT</span>
              </>
            )}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            className="monolith-btn"
            style={{
              width: '40px',
              height: '34px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </button>

          {/* Repeat Cycle */}
          <button
            onClick={onCycleRepeat}
            title={`REPEAT // ${repeatMode.toUpperCase()}`}
            className={`monolith-btn ${repeatMode !== 'off' ? 'active' : ''}`}
            style={{
              width: '44px',
              height: '34px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              fontSize: '9px',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span style={{ fontSize: '8px' }}>
              {repeatMode === 'all' ? 'ALL' : repeatMode === 'one' ? '1' : 'OFF'}
            </span>
          </button>
        </div>
      </div>

      {/* Visual Filter Bar */}
      <div
        className="music-search-wrap mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderBottom: '1px solid var(--line-weathered, rgba(255, 255, 255, 0.05))',
          background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.25))',
          fontSize: '9px',
        }}
      >
        <span style={{ color: 'var(--text-fossil, #334155)', fontSize: '10px' }}>⌕</span>
        <input
          ref={searchInputRef}
          type="text"
          className="music-search-input"
          placeholder={tracks.length > 0 ? `FILTER ${tracks.length} TRACKS...` : 'NO TRACKS INDEXED'}
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setFilterQuery('');
              searchInputRef.current?.blur();
            }
          }}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--glow-core, #f1f5f9)',
            fontSize: '9.5px',
            fontFamily: 'var(--font-mono, monospace)',
            letterSpacing: '0.04em',
          }}
        />
        {filterQuery && (
          <button
            onClick={() => {
              setFilterQuery('');
              searchInputRef.current?.focus();
            }}
            className="monolith-btn"
            style={{ padding: '1px 5px', fontSize: '8px' }}
            title="Clear Filter (Esc)"
          >
            CLEAR
          </button>
        )}
      </div>

      {/* Playlist List (Scrollable) */}
      <div
        className="custom-scrollbar"
        style={{
          flex: '1 1 0px',
          height: 0,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '4px 8px 8px 8px',
          pointerEvents: 'auto',
        }}
      >
        {visibleTracks.length === 0 ? (
          <div
            className="mono"
            style={{
              padding: '24px 10px',
              textAlign: 'center',
              fontSize: '9.5px',
              color: 'var(--text-ash, #64748b)',
            }}
          >
            NO TRACKS MATCHING &quot;{filterQuery.toUpperCase()}&quot;
          </div>
        ) : (
          visibleTracks.map(({ track, originalIdx }) => {
            const isSelected = originalIdx === currentTrackIdx;
            return (
              <div
                key={track.path}
                onClick={() => onSelectTrack(originalIdx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '7px 10px',
                  marginBottom: '1px',
                  cursor: 'pointer',
                  borderRadius: 'var(--panel-radius, 0px)',
                  background: isSelected ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                  borderLeft: isSelected
                    ? '2px solid var(--glow-core, #f1f5f9)'
                    : '2px solid transparent',
                  fontSize: '11px',
                  flexShrink: 0,
                  transition: 'all 0.12s ease',
                }}
              >
                <span
                  style={{
                    width: '28px',
                    color: isSelected
                      ? 'var(--glow-core, #f1f5f9)'
                      : 'var(--text-fossil, #334155)',
                  }}
                  className="mono"
                >
                  {(originalIdx + 1).toString().padStart(2, '0')}
                </span>
                <span
                  style={{
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: isSelected ? '#ffffff' : 'var(--text-ash, #64748b)',
                    fontWeight: isSelected ? 600 : 400,
                    letterSpacing: '0.02em',
                  }}
                >
                  {track.name}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};