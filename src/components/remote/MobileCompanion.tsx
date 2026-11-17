import React, { useState, useEffect, useCallback } from 'react';

interface QueueItem {
  original_idx: number;
  name: string;
}

interface CompanionState {
  is_playing: boolean;
  current_track_idx: number;
  track_name: string;
  current_time: number;
  duration: number;
  volume: number;
  is_shuffle: boolean;
  tracks: string[];
  queue: QueueItem[];
}

export const MobileCompanion: React.FC = () => {
  const [state, setState] = useState<CompanionState>({
    is_playing: false,
    current_track_idx: -1,
    track_name: 'No Track Selected',
    current_time: 0,
    duration: 0,
    volume: 0.8,
    is_shuffle: false,
    tracks: [],
    queue: [],
  });
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [queueTab, setQueueTab] = useState<'queue' | 'all'>('queue');

  const DAEMON_PORT = 7890;
  const getApiBase = useCallback(() => {
    if (typeof window !== 'undefined' && window.location.hostname) {
      return `http://${window.location.hostname}:${DAEMON_PORT}`;
    }
    return `http://localhost:${DAEMON_PORT}`;
  }, []);

  const sendAction = useCallback(
    (action: string) => {
      if (action === 'togglePlay') {
        setState((prev) => ({ ...prev, is_playing: !prev.is_playing }));
      }

      fetch(`${getApiBase()}/api/action/${action}`, { method: 'POST' }).catch((err) =>
        console.warn('Action dispatch error:', err)
      );
    },
    [getApiBase]
  );

  // Poll state from Monolith desktop daemon
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/state`);
        if (res.ok) {
          const data = (await res.json()) as CompanionState;
          setState(data);
        }
      } catch {
        // Station offline or unreachable
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 800);
    return () => clearInterval(interval);
  }, [getApiBase]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#07090c',
        color: '#fff',
        fontFamily: 'monospace',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.1em' }}>
            MONOLITH // UPLINK
          </div>
          <div style={{ fontSize: '9px', color: '#64748b' }}>HANDHELD CYBERDECK</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {state.is_shuffle && (
            <span style={{ fontSize: '8.5px', color: '#38bdf8', padding: '2px 5px', border: '1px solid #38bdf8' }}>
              SHUFFLE
            </span>
          )}
          <div
            style={{
              fontSize: '9px',
              padding: '3px 8px',
              border: `1px solid ${state.is_playing ? '#38bdf8' : '#64748b'}`,
              color: state.is_playing ? '#38bdf8' : '#64748b',
            }}
          >
            {state.is_playing ? '● STREAMING' : '○ PAUSED'}
          </div>
        </div>
      </div>

      {/* Main Track Display */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '140px',
            height: '140px',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            background: 'rgba(56, 189, 248, 0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: state.is_playing ? '0 0 30px rgba(56, 189, 248, 0.15)' : 'none',
          }}
        >
          <span style={{ fontSize: '40px', color: '#38bdf8' }}>{state.is_playing ? '▶' : '❚❚'}</span>
        </div>

        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', wordBreak: 'break-word' }}>
            {state.track_name || 'Idle Deck'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            TRACK {state.current_track_idx >= 0 ? state.current_track_idx + 1 : 0} OF {state.tracks.length}
          </div>
        </div>

        {/* Transport Controls */}
        <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '320px', marginTop: '12px' }}>
          <button
            onClick={() => sendAction('prevTrack')}
            style={{
              flex: 1,
              padding: '16px 0',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            |◀
          </button>

          <button
            onClick={() => sendAction('togglePlay')}
            style={{
              flex: 1.5,
              padding: '16px 0',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {state.is_playing ? 'PAUSE' : 'PLAY'}
          </button>

          <button
            onClick={() => sendAction('nextTrack')}
            style={{
              flex: 1,
              padding: '16px 0',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ▶|
          </button>
        </div>
      </div>

      {/* Expandable YouTube Music Style Queue Drawer */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.12)',
          background: '#0d1117',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          maxHeight: isQueueOpen ? '70vh' : '52px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Drawer Header Bar */}
        <div
          onClick={() => setIsQueueOpen(!isQueueOpen)}
          style={{
            height: '52px',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            flexShrink: 0,
            borderBottom: isQueueOpen ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
            <span style={{ color: '#38bdf8' }}>{isQueueOpen ? '▾' : '▴'}</span>
            <span style={{ color: '#94a3b8' }}>QUEUE //</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>
              {state.queue.length > 0 ? `${state.queue.length} UPCOMING` : 'END OF QUEUE'}
            </span>
          </div>

          <span style={{ fontSize: '10px', color: '#38bdf8' }}>
            {isQueueOpen ? '[ CLOSE ]' : '[ EXPAND ]'}
          </span>
        </div>

        {/* Expanded Drawer Content */}
        {isQueueOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Tab Switcher */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                onClick={() => setQueueTab('queue')}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: queueTab === 'queue' ? '2px solid #38bdf8' : 'none',
                  color: queueTab === 'queue' ? '#38bdf8' : '#64748b',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                UP NEXT ({state.queue.length})
              </button>
              <button
                onClick={() => setQueueTab('all')}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: queueTab === 'all' ? '2px solid #38bdf8' : 'none',
                  color: queueTab === 'all' ? '#38bdf8' : '#64748b',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ALL SONGS ({state.tracks.length})
              </button>
            </div>

            {/* Scrollable Song List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {queueTab === 'queue' ? (
                // Authentic UP NEXT Queue
                state.queue.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '11px' }}>
                    NO MORE TRACKS IN QUEUE
                  </div>
                ) : (
                  state.queue.map((item, queueIdx) => (
                    <div
                      key={`${item.original_idx}-${queueIdx}`}
                      onClick={() => sendAction(`playIndex/${item.original_idx}`)}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: '10px', color: '#38bdf8', width: '24px' }}>
                        +{queueIdx + 1}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: '12px',
                          color: '#e2e8f0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.name}
                      </span>
                    </div>
                  ))
                )
              ) : (
                // ALL SONGS TAB
                state.tracks.map((name, idx) => {
                  const isCurrent = idx === state.current_track_idx;
                  return (
                    <div
                      key={idx}
                      onClick={() => sendAction(`playIndex/${idx}`)}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        background: isCurrent ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: '10px', color: isCurrent ? '#38bdf8' : '#475569', width: '24px' }}>
                        {idx + 1}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: '12px',
                          color: isCurrent ? '#38bdf8' : '#e2e8f0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name}
                      </span>
                      {isCurrent && <span style={{ fontSize: '10px', color: '#38bdf8' }}>PLAYING</span>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};