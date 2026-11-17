import React, { useRef, useState, useEffect } from 'react';
import { PanelBounds } from '../../hooks/useLayoutManager';

interface DeckPanelProps {
  bounds: PanelBounds;
  isMaximized: boolean;
  isAnyPanelMaximized: boolean;
  title: string;
  onBringToFront: (id: string) => void;
  onUpdateBounds: (id: string, bounds: Partial<Pick<PanelBounds, 'x' | 'y' | 'width' | 'height'>>) => void;
  onToggleMaximize: (id: string) => void;
  onClose: (id: string) => void;
  children: React.ReactNode;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const DeckPanel: React.FC<DeckPanelProps> = ({
  bounds,
  isMaximized,
  isAnyPanelMaximized,
  title,
  onBringToFront,
  onUpdateBounds,
  onToggleMaximize,
  onClose,
  children,
}) => {
  // SAFETY GUARD: Prevent undefined crash if layout key is missing
  if (!bounds) return null;
  
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeResizeDir, setActiveResizeDir] = useState<ResizeDirection | null>(null);

  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizeOriginRef = useRef({ startX: 0, startY: 0, startXPos: 0, startYPos: 0, startW: 0, startH: 0 });

  // Handle Dragging via Title Bar
  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    if ((e.target as HTMLElement).closest('.panel-action-btn')) return;

    onBringToFront(bounds.id);
    setIsDragging(true);
    dragOffsetRef.current = {
      x: e.clientX - bounds.x,
      y: e.clientY - bounds.y,
    };
  };

  // Handle Multi-Edge Resizing
  const handleResizeMouseDown = (dir: ResizeDirection, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMaximized) return;

    onBringToFront(bounds.id);
    setActiveResizeDir(dir);
    resizeOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startXPos: bounds.x,
      startYPos: bounds.y,
      startW: bounds.width,
      startH: bounds.height,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const nextX = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - dragOffsetRef.current.x));
        const nextY = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffsetRef.current.y));
        onUpdateBounds(bounds.id, { x: nextX, y: nextY });
      } else if (activeResizeDir) {
        const deltaX = e.clientX - resizeOriginRef.current.startX;
        const deltaY = e.clientY - resizeOriginRef.current.startY;
        const { startXPos, startYPos, startW, startH } = resizeOriginRef.current;

        let nextX = startXPos;
        let nextY = startYPos;
        let nextW = startW;
        let nextH = startH;

        if (activeResizeDir.includes('e')) {
          nextW = Math.max(bounds.minW, startW + deltaX);
        }
        if (activeResizeDir.includes('s')) {
          nextH = Math.max(bounds.minH, startH + deltaY);
        }
        if (activeResizeDir.includes('w')) {
          const potentialW = startW - deltaX;
          if (potentialW >= bounds.minW) {
            nextW = potentialW;
            nextX = startXPos + deltaX;
          }
        }
        if (activeResizeDir.includes('n')) {
          const potentialH = startH - deltaY;
          if (potentialH >= bounds.minH) {
            nextH = potentialH;
            nextY = startYPos + deltaY;
          }
        }

        onUpdateBounds(bounds.id, { x: nextX, y: nextY, width: nextW, height: nextH });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setActiveResizeDir(null);
    };

    if (isDragging || activeResizeDir) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, activeResizeDir, bounds, onUpdateBounds]);

  // When ANY panel is maximized, hide all other panels cleanly
  const isVisible = isMaximized || (bounds.visible && !isAnyPanelMaximized);

  // Exact sub-header alignment: top matches 46px header, no outer gaps
  const containerStyle: React.CSSProperties = isMaximized
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: 'calc(100vh - 46px)',
        zIndex: 500,
        margin: 0,
        borderRadius: 0,
        transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }
    : {
        position: 'absolute',
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        zIndex: bounds.zIndex,
      };

  return (
    <div
      ref={panelRef}
      onMouseDown={() => onBringToFront(bounds.id)}
      className="glass-panel"
      style={{
        ...containerStyle,
        display: isVisible ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: isDragging || activeResizeDir ? 'none' : 'auto',
      }}
    >
      {/* Top Drag Handle & Action Ribbon */}
      <div
        onMouseDown={handleTitleMouseDown}
        style={{
          height: '28px',
          padding: '0 8px 0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: isMaximized ? 'default' : 'grab',
          background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.35))',
          borderBottom: '1px solid var(--line-weathered, rgba(255, 255, 255, 0.05))',
          flexShrink: 0,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: 'var(--text-ash, #64748b)',
            fontWeight: 700,
          }}
        >
          {title}
        </span>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Maximize / Restore */}
          <button
            className="monolith-btn panel-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMaximize(bounds.id);
            }}
            title={isMaximized ? 'Restore View' : 'Maximize Panel'}
            style={{ padding: '1px 6px', fontSize: '10px', minWidth: 'auto', lineHeight: '1.2' }}
          >
            {isMaximized ? '🗗' : '⤢'}
          </button>

          {/* Close / Stow */}
          <button
            className="monolith-btn panel-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose(bounds.id);
            }}
            title="Stow Panel"
            style={{ padding: '1px 6px', fontSize: '10px', minWidth: 'auto', lineHeight: '1.2' }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Internal Component Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>

      {/* 8-Directional Resizing Handles (Hidden when maximized) */}
      {!isMaximized && (
        <>
          {/* Edges */}
          <div onMouseDown={(e) => handleResizeMouseDown('n', e)} style={{ position: 'absolute', top: 0, left: 6, right: 6, height: 5, cursor: 'n-resize', zIndex: 10 }} />
          <div onMouseDown={(e) => handleResizeMouseDown('s', e)} style={{ position: 'absolute', bottom: 0, left: 6, right: 6, height: 5, cursor: 's-resize', zIndex: 10 }} />
          <div onMouseDown={(e) => handleResizeMouseDown('w', e)} style={{ position: 'absolute', top: 6, bottom: 6, left: 0, width: 5, cursor: 'w-resize', zIndex: 10 }} />
          <div onMouseDown={(e) => handleResizeMouseDown('e', e)} style={{ position: 'absolute', top: 6, bottom: 6, right: 0, width: 5, cursor: 'e-resize', zIndex: 10 }} />

          {/* Corners */}
          <div onMouseDown={(e) => handleResizeMouseDown('nw', e)} style={{ position: 'absolute', top: 0, left: 0, width: 8, height: 8, cursor: 'nw-resize', zIndex: 11 }} />
          <div onMouseDown={(e) => handleResizeMouseDown('ne', e)} style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, cursor: 'ne-resize', zIndex: 11 }} />
          <div onMouseDown={(e) => handleResizeMouseDown('sw', e)} style={{ position: 'absolute', bottom: 0, left: 0, width: 8, height: 8, cursor: 'sw-resize', zIndex: 11 }} />
          <div onMouseDown={(e) => handleResizeMouseDown('se', e)} style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, cursor: 'se-resize', zIndex: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.45 }}>
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
              <path d="M5 1L1 5M5 3L3 5M5 5H5" stroke="var(--glow-core, #e2e8f0)" strokeWidth="1.2" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
};