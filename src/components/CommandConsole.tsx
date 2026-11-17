import React, { useState, useEffect, useRef } from 'react';

interface LogEntry {
  id: string;
  type: 'in' | 'out' | 'err';
  text: string;
}

interface CommandConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  onSetWeatherOverride: (condition: string | null) => void;
  onPollWeather: (force: boolean) => void;
  onToggleDeck?: () => void;
  onToggleFiles?: () => void;
}

export const CommandConsole: React.FC<CommandConsoleProps> = ({
  isOpen,
  onClose,
  onSetWeatherOverride,
  onPollWeather,
  onToggleDeck,
  onToggleFiles,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', type: 'out', text: 'MONOLITH ADMIN CONSOLE // CORE v1.0 INITIALIZED' },
    { id: '2', type: 'out', text: 'Type "help" for a list of diagnostic and dev commands.' },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (text: string, type: 'in' | 'out' | 'err' = 'out') => {
    setLogs((prev) => [...prev, { id: Math.random().toString(), type, text }]);
  };

  const handleCommand = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    addLog(`> ${trimmed}`, 'in');
    setHistory((prev) => [trimmed, ...prev]);
    setHistoryIdx(-1);

    const parts = trimmed.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        addLog('AVAILABLE COMMANDS:');
        addLog('  weather <clear|rain|storm|snow|fog|reset>  - Override atmosphere');
        addLog('  poll                                       - Force atmospheric telemetry refresh');
        addLog('  deck                                       - Toggle multi-widget deck');
        addLog('  files                                      - Toggle expanded file explorer');
        addLog('  clear                                      - Flush console log history');
        addLog('  exit / close                               - Dismiss dev console');
        break;

      case 'clear':
        setLogs([]);
        break;

      case 'exit':
      case 'close':
        onClose();
        break;

      case 'deck':
        if (onToggleDeck) {
          onToggleDeck();
          addLog('DECK // TOGGLE SIGNAL SENT');
        }
        break;

      case 'files':
        if (onToggleFiles) {
          onToggleFiles();
          addLog('FILE_EXPLORER // EXPAND TOGGLE SENT');
        }
        break;

      case 'poll':
        onPollWeather(true);
        addLog('WEATHER SENSORS // TELEMETRY RE-POLLED');
        break;

      case 'weather':
        if (args.length === 0) {
          addLog('USAGE: weather <clear|rain|storm|snow|fog|reset>', 'err');
          break;
        }
        const state = args[0].toLowerCase();
        if (state === 'reset') {
          onSetWeatherOverride(null);
          addLog('ATMOSPHERE // SIMULATION OVERRIDE CLEARED (STATION SENSORS ACTIVE)');
        } else if (['clear', 'rain', 'storm', 'snow', 'fog'].includes(state)) {
          onSetWeatherOverride(state.toUpperCase());
          addLog(`ATMOSPHERE // SIMULATION OVERRIDE LOCKED: ${state.toUpperCase()}`);
        } else {
          addLog(`UNKNOWN WEATHER TARGET: "${state}". USE clear, rain, storm, snow, fog, or reset.`, 'err');
        }
        break;

      default:
        addLog(`UNKNOWN DIRECTIVE: "${cmd}". TYPE "help" FOR SYNTAX.`, 'err');
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommand(inputVal);
      setInputVal('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIdx < history.length - 1) {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInputVal('');
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-modal-overlay, rgba(5, 7, 10, 0.65))',
        backdropFilter: 'blur(8px)',
        zIndex: 90,
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel mono"
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: `translateX(-50%) ${isOpen ? 'translateY(0)' : 'translateY(-105%)'}`,
          width: '720px',
          height: '320px',
          borderRadius: 'var(--panel-radius, 0px)',
          background: 'var(--bg-header, rgba(7, 9, 12, 0.95))',
          borderBottom: '2px solid var(--glow-core)',
          borderLeft: '1px solid var(--line-weathered)',
          borderRight: '1px solid var(--line-weathered)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.98), 0 0 15px rgba(241, 245, 249, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          padding: '12px 16px',
        }}
      >
        {/* Terminal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9.5px',
            color: 'var(--text-ash)',
            borderBottom: '1px solid var(--line-weathered)',
            paddingBottom: '8px',
            letterSpacing: '0.12em',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--glow-core)', fontWeight: 700 }}>$ MONOLITH // DEV_CONSOLE</span>
            <span>[DIAGNOSTICS & OVERRIDES]</span>
          </div>
          <span>ALT+C / ESC TO CLOSE</span>
        </div>

        {/* Scrollable Output Area */}
        <div
          ref={logContainerRef}
          className="custom-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '11px',
          }}
        >
          {logs.map((log) => (
            <div
              key={log.id}
              style={{
                color:
                  log.type === 'err'
                    ? 'var(--accent-alert, #ff4d4d)'
                    : log.type === 'in'
                    ? 'var(--glow-core)'
                    : 'var(--text-ash)',
                lineHeight: '1.4',
              }}
            >
              {log.text}
            </div>
          ))}
        </div>

        {/* Command Line Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderTop: '1px solid var(--line-weathered)',
            paddingTop: '8px',
            gap: '8px',
          }}
        >
          <span style={{ color: 'var(--glow-core)', fontSize: '13px', fontWeight: 700 }}>&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command ('help', 'weather rain', 'weather reset')..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--glow-core, #ffffff)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
            }}
          />
        </div>
      </div>
    </div>
  );
};