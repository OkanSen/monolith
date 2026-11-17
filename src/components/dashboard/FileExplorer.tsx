import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified?: number;
}

interface ClipboardState {
  path: string;
  isCut: boolean;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetItem: FileEntry | null;
}

interface QuickAccessPaths {
  desktop: string;
  downloads: string;
  documents: string;
  pictures: string;
  root_c: string;
}

interface QuickPin {
  label: string;
  path: string;
  icon?: string;
}

type GroupFilter = 'all' | 'folders' | 'media' | 'docs' | 'exec';
type SortField = 'name' | 'modified' | 'size';
type SortOrder = 'asc' | 'desc';

const DEFAULT_PINS_KEY = 'monolith_quick_pins_v1';

export const FileExplorer: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [viewMode, setViewMode] = useState<'icons' | 'list'>('icons');
  const [filterType, setFilterType] = useState<GroupFilter>('all');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleShowInExplorer = async (targetPath: string) => {
    try {
      await invoke('show_in_explorer', { path: targetPath });
    } catch (err) {
      console.error('Show in explorer failed:', err);
    }
  };

  const [customPins, setCustomPins] = useState<QuickPin[]>(() => {
    try {
      const stored = localStorage.getItem(DEFAULT_PINS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetItem: null,
  });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleOpenWith = async (item: FileEntry) => {
    try {
      await invoke('open_item_with', { path: item.path });
    } catch (err) {
      console.error('Open with failed:', err);
    }
  };

  const savePins = (newPins: QuickPin[]) => {
    setCustomPins(newPins);
    localStorage.setItem(DEFAULT_PINS_KEY, JSON.stringify(newPins));
  };

  const addCurrentToPins = (targetPath?: string, name?: string) => {
    const pathToPin = targetPath || currentPath;
    if (!pathToPin) return;
    if (customPins.some((p) => p.path.toLowerCase() === pathToPin.toLowerCase())) return;

    const labelName = name || pathToPin.split(/[\\/]/).filter(Boolean).pop() || 'FOLDER';
    const updated = [...customPins, { label: labelName.toUpperCase(), path: pathToPin, icon: '📌' }];
    savePins(updated);
  };

  const removePin = (pinPath: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = customPins.filter((p) => p.path !== pinPath);
    savePins(updated);
  };

  const loadDirectory = useCallback(async (dir: string) => {
    try {
      const files = await invoke<FileEntry[]>('list_workspace_files', { dirPath: dir });
      setItems(files);
      setCurrentPath(dir);
      setSelectedPath(null);
      localStorage.setItem('monolith_workspace_dir', dir);
    } catch (err) {
      console.error('Directory read failed:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const stored = localStorage.getItem(DEFAULT_PINS_KEY);
      if (!stored) {
        try {
          const qp = await invoke<QuickAccessPaths>('get_quick_access_paths');
          const initialPins: QuickPin[] = [
            { label: 'DESKTOP', path: qp.desktop, icon: '🖥' },
            { label: 'DOWNLOADS', path: qp.downloads, icon: '⬇' },
            { label: 'DOCUMENTS', path: qp.documents, icon: '📑' },
            { label: 'PICTURES', path: qp.pictures, icon: '🖼' },
            { label: 'DRIVE C:', path: qp.root_c, icon: '💾' },
          ];
          savePins(initialPins);
        } catch (e) {
          console.warn('Could not load base quick paths:', e);
        }
      }

      const saved = localStorage.getItem('monolith_workspace_dir');
      if (saved) {
        loadDirectory(saved);
      } else {
        try {
          const defaultPath = await invoke<string>('get_monolith_desktop_path');
          loadDirectory(defaultPath);
        } catch (err) {
          console.error(err);
        }
      }
    };
    init();
  }, [loadDirectory]);

  useEffect(() => {
    if (renamingPath || isCreatingFolder) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [renamingPath, isCreatingFolder]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    const normalized = currentPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);

    let accumulator = '';
    return segments.map((seg, idx) => {
      if (idx === 0 && currentPath.includes(':')) {
        accumulator = `${seg}\\`;
      } else {
        accumulator = accumulator ? `${accumulator}\\${seg}` : seg;
      }
      return {
        label: seg,
        fullPath: accumulator,
      };
    });
  }, [currentPath]);

  const handleNavigateUp = () => {
    const parent =
      currentPath.substring(0, currentPath.lastIndexOf('\\')) ||
      currentPath.substring(0, currentPath.lastIndexOf('/'));
    if (parent && parent.length >= 2) {
      loadDirectory(parent);
    }
  };

  const handleOpenItem = async (item: FileEntry) => {
    if (item.is_dir) {
      loadDirectory(item.path);
    } else {
      try {
        await invoke('open_item', { path: item.path });
      } catch (err) {
        console.error('Launch error:', err);
      }
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentPath) return;
    try {
      await invoke('create_workspace_folder', {
        parentPath: currentPath,
        folderName: newFolderName.trim(),
      });
      setIsCreatingFolder(false);
      setNewFolderName('');
      loadDirectory(currentPath);
    } catch (err) {
      console.error('Create error:', err);
    }
  };

  const handleRenameSubmit = async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }
    try {
      await invoke('rename_workspace_item', {
        oldPath: renamingPath,
        newName: renameValue.trim(),
      });
      setRenamingPath(null);
      loadDirectory(currentPath);
    } catch (err) {
      console.error('Rename error:', err);
    }
  };

  const handleDelete = async (path: string) => {
    try {
      await invoke('delete_workspace_item', { path });
      if (selectedPath === path) setSelectedPath(null);
      loadDirectory(currentPath);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handlePaste = async () => {
    if (!clipboard || !currentPath) return;
    try {
      await invoke('paste_workspace_item', {
        sourcePath: clipboard.path,
        destinationFolder: currentPath,
        isCut: clipboard.isCut,
      });
      if (clipboard.isCut) setClipboard(null);
      loadDirectory(currentPath);
    } catch (err) {
      console.error('Paste error:', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, item: FileEntry | null = null) => {
    e.preventDefault();
    e.stopPropagation();

    if (item) setSelectedPath(item.path);

    const bounds = containerRef.current?.getBoundingClientRect();
    const x = bounds ? e.clientX - bounds.left : e.clientX;
    const y = bounds ? e.clientY - bounds.top : e.clientY;

    setContextMenu({
      visible: true,
      x: Math.min(x, (bounds?.width || 350) - 165),
      y: Math.min(y, (bounds?.height || 350) - 210),
      targetItem: item,
    });
  };

  const getFileExt = (item: FileEntry): string => {
    if (item.is_dir) return 'DIR';
    const parts = item.name.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || 'FILE' : 'NONE';
  };

  const getFileCategory = (item: FileEntry): GroupFilter => {
    if (item.is_dir) return 'folders';
    const ext = getFileExt(item);
    if (['mp3', 'wav', 'flac', 'ogg', 'm4a', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'mp4', 'mkv'].includes(ext)) {
      return 'media';
    }
    if (['txt', 'md', 'pdf', 'docx', 'xlsx', 'json', 'csv', 'rs', 'ts', 'tsx', 'js'].includes(ext)) {
      return 'docs';
    }
    if (['exe', 'bat', 'cmd', 'lnk'].includes(ext)) return 'exec';
    return 'docs';
  };

  const getFileIcon = (item: FileEntry) => {
    if (item.is_dir) return '📁';
    const ext = getFileExt(item);
    if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return '🎵';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return '🖼️';
    if (['txt', 'md', 'json', 'rs', 'ts', 'tsx', 'js'].includes(ext)) return '📄';
    if (['exe', 'bat', 'cmd'].includes(ext)) return '⚡';
    return '📦';
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const sortComparator = useCallback(
    (a: FileEntry, b: FileEntry) => {
      if (a.is_dir !== b.is_dir) return b.is_dir ? 1 : -1;
      let result = 0;
      if (sortBy === 'name') {
        result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortBy === 'size') {
        result = a.size - b.size;
      } else if (sortBy === 'modified') {
        result = (a.modified || 0) - (b.modified || 0);
      }
      return sortOrder === 'asc' ? result : -result;
    },
    [sortBy, sortOrder]
  );

  const groupedSections = useMemo(() => {
    const filtered = filterType === 'all' ? items : items.filter((item) => getFileCategory(item) === filterType);

    if (filterType === 'media' || filterType === 'docs') {
      const extMap: Record<string, FileEntry[]> = {};
      filtered.forEach((item) => {
        const ext = getFileExt(item).toUpperCase();
        if (!extMap[ext]) extMap[ext] = [];
        extMap[ext].push(item);
      });

      return Object.entries(extMap)
        .sort(([extA], [extB]) => extA.localeCompare(extB))
        .map(([ext, groupItems]) => ({
          header: `// EXT: ${ext}`,
          items: [...groupItems].sort(sortComparator),
        }));
    }

    return [{ header: null, items: [...filtered].sort(sortComparator) }];
  }, [items, filterType, sortComparator]);

  const totalFilteredCount = useMemo(() => {
    return groupedSections.reduce((acc, curr) => acc + curr.items.length, 0);
  }, [groupedSections]);

  const isCurrentPinned = customPins.some((p) => p.path.toLowerCase() === currentPath.toLowerCase());

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => handleContextMenu(e, null)}
      tabIndex={0}
      className="mono"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        outline: 'none',
        userSelect: 'none',
      }}
      onKeyDown={(e) => {
        if (renamingPath || isCreatingFolder) return;
        if (e.key === 'Delete' && selectedPath) handleDelete(selectedPath);
        if (e.ctrlKey && e.key.toLowerCase() === 'c' && selectedPath) setClipboard({ path: selectedPath, isCut: false });
        if (e.ctrlKey && e.key.toLowerCase() === 'x' && selectedPath) setClipboard({ path: selectedPath, isCut: true });
        if (e.ctrlKey && e.key.toLowerCase() === 'v') handlePaste();
        if (e.key === 'F2' && selectedPath) {
          const item = items.find((i) => i.path === selectedPath);
          if (item) {
            setRenamingPath(item.path);
            setRenameValue(item.name);
          }
        }
      }}
    >
      {/* Breadcrumb Top Bar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--line-weathered)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.25))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          <button
            onClick={handleNavigateUp}
            className="monolith-btn"
            style={{ padding: '2px 7px', fontSize: '9px', flexShrink: 0 }}
            title="Navigate Up"
          >
            ▲ UP
          </button>

          <div
            className="custom-scrollbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              gap: '3px',
              fontSize: '10px',
            }}
          >
            {breadcrumbs.map((b, idx) => (
              <React.Fragment key={b.fullPath}>
                <span
                  onClick={() => loadDirectory(b.fullPath)}
                  style={{
                    color: idx === breadcrumbs.length - 1 ? 'var(--glow-core)' : 'var(--text-ash)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color =
                      idx === breadcrumbs.length - 1 ? 'var(--glow-core)' : 'var(--text-ash)')
                  }
                >
                  {b.label}
                </span>
                {idx < breadcrumbs.length - 1 && (
                  <span style={{ color: 'var(--text-fossil)', fontSize: '9px' }}>/</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* View Toggle & Native Explorer Handoff */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={() => currentPath && handleShowInExplorer(currentPath)}
            className="monolith-btn"
            style={{ padding: '2px 6px', fontSize: '9px' }}
            title="Open Current Directory in Windows Explorer"
          >
            ↗ EXPLORER
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'icons' ? 'list' : 'icons')}
            className={`monolith-btn ${viewMode === 'icons' ? 'active' : ''}`}
            style={{ padding: '2px 6px', fontSize: '9px' }}
            title="Toggle View Mode"
          >
            {viewMode === 'icons' ? '⊞ ICONS' : '☰ LIST'}
          </button>
        </div>
      </div>

      {/* Filter Rail & Sort By Controller */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.4))',
          borderBottom: '1px solid var(--line-weathered)',
          fontSize: '8.5px',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'folders', 'media', 'docs', 'exec'] as GroupFilter[]).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className="monolith-btn"
              style={{
                padding: '1px 6px',
                fontSize: '8.5px',
                color: filterType === type ? 'var(--glow-core)' : 'var(--text-ash)',
                background: filterType === type ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                borderColor: filterType === type ? 'var(--glow-core)' : 'transparent',
              }}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Sort Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-fossil)', fontSize: '8px' }}>SORT:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="monolith-btn"
            style={{
              padding: '1px 4px',
              fontSize: '8px',
              background: 'var(--bg-slot, rgba(0,0,0,0.7))',
              color: 'var(--glow-core)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="name">NAME</option>
            <option value="modified">MODIFIED</option>
            <option value="size">SIZE</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="monolith-btn"
            style={{ padding: '1px 5px', fontSize: '8px', color: 'var(--glow-core)' }}
            title={`Toggle Sort Order (${sortOrder.toUpperCase()})`}
          >
            {sortOrder === 'asc' ? 'ASC ▲' : 'DESC ▼'}
          </button>
        </div>
      </div>

      {/* Inline New Folder Input Bar */}
      {isCreatingFolder && (
        <div
          style={{
            display: 'flex',
            padding: '6px 12px',
            background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.6))',
            borderBottom: '1px solid var(--line-weathered)',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '14px' }}>📁</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="New folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') setIsCreatingFolder(false);
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--glow-core)',
              color: 'var(--glow-core)',
              fontSize: '11px',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
            }}
          />
          <button onClick={handleCreateFolder} className="monolith-btn" style={{ padding: '2px 6px' }}>
            CREATE
          </button>
        </div>
      )}

      {/* Main Split: Quick Access Rail + File Canvas */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div
          style={{
            width: '105px',
            borderRight: '1px solid var(--line-weathered)',
            background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.28))',
            padding: '6px 4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '8px',
              color: 'var(--text-fossil)',
              padding: '2px 4px',
              letterSpacing: '0.08em',
            }}
          >
            <span>QUICK PINS</span>
            <button
              onClick={() => addCurrentToPins()}
              disabled={isCurrentPinned}
              title={isCurrentPinned ? 'Current folder is pinned' : 'Pin current directory'}
              className="monolith-btn"
              style={{
                padding: '0px 4px',
                fontSize: '8px',
                opacity: isCurrentPinned ? 0.35 : 1,
              }}
            >
              +PIN
            </button>
          </div>

          <div
            className="custom-scrollbar"
            style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}
          >
            {customPins.map((pin) => {
              const isActive = currentPath.toLowerCase() === pin.path.toLowerCase();
              return (
                <div
                  key={pin.path}
                  className={`explorer-row ${isActive ? 'selected' : ''}`}
                  style={{
                    padding: '4px 6px',
                    fontSize: '8.5px',
                    gap: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => loadDirectory(pin.path)}
                  title={pin.path}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: '10px' }}>{pin.icon || '📁'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pin.label}
                    </span>
                  </div>
                  <span
                    onClick={(e) => removePin(pin.path, e)}
                    style={{
                      fontSize: '8px',
                      color: 'var(--text-fossil)',
                      cursor: 'pointer',
                      padding: '0 2px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-alert, #ff6b6b)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-fossil)')}
                    title="Unpin"
                  >
                    ×
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* File Canvas */}
        <div
          className="custom-scrollbar"
          onClick={() => setSelectedPath(null)}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
            alignContent: 'start',
          }}
        >
          {totalFilteredCount === 0 ? (
            <div
              style={{
                padding: '40px 10px',
                textAlign: 'center',
                color: 'var(--text-ash)',
                fontSize: '10px',
              }}
            >
              NO MATCHING ITEMS IN THIS DIRECTORY
            </div>
          ) : (
            groupedSections.map((sec, secIdx) => (
              <div key={sec.header || `sec-${secIdx}`} style={{ marginBottom: sec.header ? '12px' : '0' }}>
                {sec.header && (
                  <div
                    style={{
                      fontSize: '8.5px',
                      color: 'var(--text-ash)',
                      letterSpacing: '0.12em',
                      padding: '4px 6px',
                      borderBottom: '1px solid var(--line-weathered)',
                      marginBottom: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{sec.header}</span>
                    <span style={{ color: 'var(--text-fossil)' }}>{sec.items.length} FILES</span>
                  </div>
                )}

                <div
                  style={{
                    display: viewMode === 'icons' ? 'grid' : 'flex',
                    gridTemplateColumns:
                      viewMode === 'icons' ? 'repeat(auto-fill, minmax(64px, 1fr))' : undefined,
                    flexDirection: viewMode === 'list' ? 'column' : undefined,
                    gap: viewMode === 'icons' ? '8px 6px' : '2px',
                  }}
                >
                  {sec.items.map((item) => {
                    const isSelected = item.path === selectedPath;
                    const isRenaming = item.path === renamingPath;

                    if (viewMode === 'icons') {
                      return (
                        <div
                          key={item.path}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPath(item.path);
                          }}
                          onDoubleClick={() => handleOpenItem(item)}
                          onContextMenu={(e) => handleContextMenu(e, item)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '8px 4px',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            border: isSelected ? '1px solid var(--glow-core)' : '1px solid transparent',
                            boxShadow: isSelected ? '0 0 10px rgba(0,0,0,0.5)' : 'none',
                            transition: 'all 0.12s ease',
                          }}
                        >
                          <span
                            className="relic-icon-filter"
                            style={{
                              fontSize: '28px',
                              marginBottom: '4px',
                              lineHeight: 1,
                              transform: isSelected ? 'scale(1.05)' : 'none',
                            }}
                          >
                            {getFileIcon(item)}
                          </span>

                          {isRenaming ? (
                            <input
                              ref={inputRef}
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit();
                                if (e.key === 'Escape') setRenamingPath(null);
                              }}
                              onBlur={handleRenameSubmit}
                              style={{
                                width: '90%',
                                textAlign: 'center',
                                background: 'var(--bg-slot, rgba(0,0,0,0.85))',
                                border: '1px solid var(--glow-core)',
                                color: '#ffffff',
                                fontSize: '10px',
                                padding: '1px 2px',
                                outline: 'none',
                                fontFamily: 'var(--font-mono)',
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                fontSize: '9.5px',
                                textAlign: 'center',
                                color: isSelected ? '#ffffff' : 'var(--glow-core)',
                                wordBreak: 'break-word',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                maxWidth: '62px',
                                lineHeight: '1.15',
                              }}
                            >
                              {item.name}
                            </span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.path}
                        className={`explorer-row ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPath(item.path);
                        }}
                        onDoubleClick={() => handleOpenItem(item)}
                        onContextMenu={(e) => handleContextMenu(e, item)}
                        style={{ gap: '8px' }}
                      >
                        <span
                          className="relic-icon-filter"
                          style={{ fontSize: '13px', width: '16px', textAlign: 'center' }}
                        >
                          {getFileIcon(item)}
                        </span>

                        {isRenaming ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSubmit();
                              if (e.key === 'Escape') setRenamingPath(null);
                            }}
                            onBlur={handleRenameSubmit}
                            style={{
                              flex: 1,
                              background: 'var(--bg-slot, rgba(0,0,0,0.8))',
                              border: '1px solid var(--glow-core)',
                              color: '#ffffff',
                              fontSize: '11px',
                              padding: '1px 4px',
                              outline: 'none',
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              flex: 1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: item.is_dir ? 'var(--glow-core)' : 'var(--text-ash)',
                            }}
                          >
                            {item.name}
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: '9px',
                            color: 'var(--text-fossil)',
                            width: '60px',
                            textAlign: 'right',
                          }}
                        >
                          {item.is_dir ? 'DIR' : formatSize(item.size)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer Info Bar */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid var(--line-weathered)',
          fontSize: '9px',
          color: 'var(--text-ash)',
          display: 'flex',
          justifyContent: 'space-between',
          background: 'var(--bg-subpanel, rgba(0,0,0,0.2))',
        }}
      >
        <span>
          {totalFilteredCount} NODES ({filterType.toUpperCase()}) // {sortBy.toUpperCase()} {sortOrder.toUpperCase()}
        </span>
        <span>{selectedPath ? '1 SELECTED' : 'R-CLICK FOR ACTIONS'}</span>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="glass-panel"
          style={{
            position: 'absolute',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 100,
            width: '165px',
            padding: '4px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.95)',
            border: '1px solid var(--line-eroded)',
            fontSize: '10px',
          }}
        >
          {contextMenu.targetItem ? (
            <>
              <div
                className="explorer-row"
                onClick={() => {
                  handleOpenItem(contextMenu.targetItem!);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                OPEN
              </div>

              {!contextMenu.targetItem.is_dir && (
                <div
                  className="explorer-row"
                  onClick={() => {
                    handleOpenWith(contextMenu.targetItem!);
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  OPEN WITH...
                </div>
              )}

              {contextMenu.targetItem.is_dir && (
                <div
                  className="explorer-row"
                  onClick={() => {
                    addCurrentToPins(contextMenu.targetItem!.path, contextMenu.targetItem!.name);
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  📌 PIN TO QUICK ACCESS
                </div>
              )}
              <div
                className="explorer-row"
                onClick={() => {
                  setRenamingPath(contextMenu.targetItem!.path);
                  setRenameValue(contextMenu.targetItem!.name);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                RENAME [F2]
              </div>
              <div
                className="explorer-row"
                onClick={() => {
                  setClipboard({ path: contextMenu.targetItem!.path, isCut: false });
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                COPY
              </div>
              <div
                className="explorer-row"
                onClick={() => {
                  setClipboard({ path: contextMenu.targetItem!.path, isCut: true });
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                CUT
              </div>
              <div
                className="explorer-row"
                style={{ color: 'var(--accent-alert, #ff6b6b)' }}
                onClick={() => {
                  handleDelete(contextMenu.targetItem!.path);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                DELETE [DEL]
              </div>

              <div
                className="explorer-row"
                onClick={() => {
                  handleShowInExplorer(contextMenu.targetItem!.path);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                ↗ REVEAL IN EXPLORER
              </div>
            </>
          ) : (
            <>
              <div
                className="explorer-row"
                onClick={() => {
                  addCurrentToPins();
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                📌 PIN CURRENT DIR
              </div>
              <div
                className="explorer-row"
                onClick={() => {
                  setIsCreatingFolder(true);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                + NEW FOLDER
              </div>
              <div
                className="explorer-row"
                onClick={() => {
                  setViewMode(viewMode === 'icons' ? 'list' : 'icons');
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                VIEW: {viewMode === 'icons' ? 'LIST' : 'ICONS'}
              </div>
              {clipboard && (
                <div
                  className="explorer-row"
                  onClick={() => {
                    handlePaste();
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  PASTE ITEM
                </div>
              )}
              <div
                className="explorer-row"
                onClick={() => {
                  loadDirectory(currentPath);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                REFRESH
              </div>

              <div
                className="explorer-row"
                onClick={() => {
                  handleShowInExplorer(currentPath);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
              >
                ↗ OPEN IN EXPLORER
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};