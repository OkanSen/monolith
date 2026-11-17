import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

interface WallpaperCarouselProps {
  isOpen: boolean;
  onSelect: (url: string) => void;
  onClose: () => void;
}

export const WallpaperCarousel: React.FC<WallpaperCarouselProps> = ({ isOpen, onSelect, onClose }) => {
  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [wallpaperDir, setWallpaperDir] = useState<string>(() => {
    return localStorage.getItem('monolith_wallpaper_dir') || '';
  });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const targetScrollRef = useRef<number>(0);
  const currentScrollRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  const loadWallpapers = useCallback(async (dirPath: string) => {
    const cleaned = dirPath.replace(/^["']|["']$/g, '').trim();
    if (!cleaned) return;

    try {
      const paths = await invoke<string[]>('scan_wallpapers_directory', { folderPath: cleaned });
      setWallpapers(paths);
      setWallpaperDir(cleaned);
      localStorage.setItem('monolith_wallpaper_dir', cleaned);

      invoke('watch_wallpapers_directory', { folderPath: cleaned }).catch((err) =>
        console.warn('Folder watch notice:', err)
      );
    } catch (err) {
      console.error('Failed to load wallpapers:', err);
    }
  }, []);

  useEffect(() => {
    const savedDir = localStorage.getItem('monolith_wallpaper_dir');
    if (savedDir) {
      loadWallpapers(savedDir);
    }
  }, [loadWallpapers]);

  useEffect(() => {
    const unlisten = listen('wallpapers-directory-changed', () => {
      const activeDir = localStorage.getItem('monolith_wallpaper_dir');
      if (activeDir) {
        loadWallpapers(activeDir);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadWallpapers]);

  useEffect(() => {
    if (!isOpen) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const animateScroll = () => {
      if (containerRef.current) {
        const diff = targetScrollRef.current - currentScrollRef.current;
        currentScrollRef.current += diff * 0.08;
        containerRef.current.scrollLeft = currentScrollRef.current;
      }
      animFrameRef.current = requestAnimationFrame(animateScroll);
    };

    animFrameRef.current = requestAnimationFrame(animateScroll);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen]);

  const handleBrowseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Wallpapers Directory',
      });

      if (selected && typeof selected === 'string') {
        loadWallpapers(selected);
      }
    } catch (err) {
      console.error('Folder picker error:', err);
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current || wallpapers.length === 0) return;
      const { clientX } = e;
      const width = window.innerWidth;

      const leftMargin = width * 0.08;
      const rightMargin = width * 0.92;
      const clampedX = Math.max(leftMargin, Math.min(rightMargin, clientX));
      const ratio = (clampedX - leftMargin) / (rightMargin - leftMargin);

      const maxScroll = containerRef.current.scrollWidth - containerRef.current.clientWidth;
      targetScrollRef.current = ratio * maxScroll;
    },
    [wallpapers.length]
  );

  return (
    <div
      onClick={onClose}
      onMouseMove={handleMouseMove}
      className={`monolith-modal-overlay ${isOpen ? 'open' : ''}`}
      style={{
        backgroundColor: 'var(--bg-modal-overlay, rgba(5, 6, 8, 0.82))',
        backdropFilter: 'blur(10px)',
        zIndex: 50,
        flexDirection: 'column',
      }}
    >
      <div
        className="monolith-modal-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}
      >
        {/* Top Control Bar */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginBottom: '20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <h2 className="font-display" style={{ fontSize: '16px', letterSpacing: '0.2em' }}>
            MONOLITH // WALLPAPER REPOSITORY
          </h2>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button onClick={handleBrowseFolder} className="monolith-btn">
              [📁 SELECT FOLDER]
            </button>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-ash)' }}>
              {wallpapers.length} PLATES FOUND {wallpaperDir ? `// ${wallpaperDir}` : ''}
            </span>
          </div>
        </div>

        {/* 3D Cover Flow Track */}
        <div
          ref={containerRef}
          onClick={(e) => e.stopPropagation()}
          className="custom-scrollbar"
          style={{
            display: 'flex',
            gap: '24px',
            alignItems: 'center',
            overflowX: 'hidden',
            width: '94vw',
            maxWidth: '1600px',
            padding: '50px 40px',
            perspective: '1200px',
          }}
        >
          {wallpapers.length === 0 ? (
            <div
              className="mono"
              style={{
                width: '100%',
                textAlign: 'center',
                color: 'var(--text-ash)',
                fontSize: '12px',
                padding: '40px 0',
              }}
            >
              NO MEDIA LOADED. CLICK [SELECT FOLDER] TO POINT TO YOUR WALLPAPER DIRECTORY.
            </div>
          ) : (
            <>
              <div style={{ width: '210px', height: '380px', flex: '0 0 210px', pointerEvents: 'none', opacity: 0 }} />
              <div style={{ width: '210px', height: '380px', flex: '0 0 210px', pointerEvents: 'none', opacity: 0 }} />

              {wallpapers.map((filePath, idx) => {
                const isHovered = hoveredIdx === idx;
                const isNeighbor = hoveredIdx !== null && Math.abs(hoveredIdx - idx) === 1;
                const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(filePath);

                let scale = 1;
                let zIndex = 1;

                if (isHovered) {
                  scale = 1.18;
                  zIndex = 10;
                } else if (isNeighbor) {
                  scale = 1.06;
                  zIndex = 5;
                }

                const assetUrl = convertFileSrc(filePath);

                return (
                  <div
                    key={filePath}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => onSelect(assetUrl)}
                    style={{
                      width: '210px',
                      height: '380px',
                      flex: '0 0 210px',
                      borderRadius: 'var(--panel-radius, 0px)',
                      border: isHovered
                        ? '1px solid var(--glow-core)'
                        : '1px solid var(--line-eroded)',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transform: `scale(${scale})`,
                      zIndex,
                      boxShadow: isHovered
                        ? '0 30px 60px rgba(0, 0, 0, 0.98), 0 0 16px var(--glow-aura)'
                        : '0 12px 28px rgba(0, 0, 0, 0.75)',
                      transition:
                        'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease, box-shadow 0.2s ease',
                      position: 'relative',
                      background: 'var(--stone-carved, #07080a)',
                    }}
                  >
                    {isVideo ? (
                      <video
                        src={assetUrl}
                        autoPlay={isHovered}
                        loop
                        muted
                        playsInline
                        preload="metadata"
                        ref={(el) => {
                          if (el) {
                            if (isHovered) {
                              el.play().catch(() => {});
                            } else {
                              el.pause();
                              el.currentTime = 0;
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          filter: isHovered
                            ? 'contrast(105%) brightness(100%)'
                            : 'brightness(70%) grayscale(25%)',
                          transition: 'filter 0.22s ease',
                        }}
                      />
                    ) : (
                      <img
                        src={assetUrl}
                        alt={`wp-${idx}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          filter: isHovered
                            ? 'contrast(105%) brightness(100%)'
                            : 'brightness(70%) grayscale(25%)',
                          transition: 'filter 0.22s ease',
                        }}
                      />
                    )}

                    {isVideo && (
                      <span
                        className="mono"
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          fontSize: '8px',
                          background: 'var(--bg-slot, rgba(0,0,0,0.75))',
                          padding: '2px 5px',
                          color: 'var(--glow-core)',
                          border: '1px solid var(--line-eroded)',
                        }}
                      >
                        VIDEO
                      </span>
                    )}

                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        border: '1px solid var(--line-weathered, rgba(255, 255, 255, 0.05))',
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                );
              })}

              <div style={{ width: '210px', height: '380px', flex: '0 0 210px', pointerEvents: 'none', opacity: 0 }} />
              <div style={{ width: '210px', height: '380px', flex: '0 0 210px', pointerEvents: 'none', opacity: 0 }} />
            </>
          )}
        </div>

        <div className="mono" style={{ marginTop: '16px', fontSize: '10px', color: 'var(--text-ash)' }}>
          PAN MOUSE HORIZONTALLY TO GLIDE // CLICK PLATE TO COMMIT // ESC TO DISMISS
        </div>
      </div>
    </div>
  );
};