import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';

interface RemoteServerStatus {
  is_running: boolean;
  ip: string;
  port: number;
}

interface ConnectedClientInfo {
  id: string;
  ip: string;
  user_agent: string;
  device_name: string;
  last_seen_secs_ago: number;
}

export const RemoteUplink: React.FC = () => {
  const [isServerActive, setIsServerActive] = useState(false);
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [serverPort, setServerPort] = useState(7890);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>('');
  const [clients, setClients] = useState<ConnectedClientInfo[]>([]);

  const companionUrl = `http://${localIp}:${serverPort}`;

  // 1. Generate compliant scannable QR Code
  useEffect(() => {
    if (!isServerActive) {
      setQrSvg('');
      return;
    }

    QRCode.toString(companionUrl, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#ffffff',     // Base shape color (will be overridden directly by CSS)
        light: '#00000000',  // 100% transparent background so it shows deck plate
      },
      errorCorrectionLevel: 'M',
    })
      .then((rawSvg) => {
        setQrSvg(rawSvg);
      })
      .catch((err) => console.error('QR Generator fault:', err));
  }, [companionUrl, isServerActive]);

  // 2. Poll server status and connected clients
  const refreshStatus = useCallback(async () => {
    try {
      const status = await invoke<RemoteServerStatus>('get_remote_server_status');
      setIsServerActive(status.is_running);
      setLocalIp(status.ip);
      setServerPort(status.port);

      if (status.is_running) {
        const clientList = await invoke<ConnectedClientInfo[]>('get_connected_clients');
        setClients(clientList);
      } else {
        setClients([]);
      }
    } catch (err) {
      console.warn('Failed to query remote server status:', err);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 1500);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handleToggleServer = async () => {
    setIsLoading(true);
    try {
      if (isServerActive) {
        const res = await invoke<RemoteServerStatus>('stop_remote_server');
        setIsServerActive(res.is_running);
        setClients([]);
      } else {
        const res = await invoke<RemoteServerStatus>('start_remote_server');
        setIsServerActive(res.is_running);
        setLocalIp(res.ip);
        setServerPort(res.port);
      }
    } catch (err) {
      console.error('❌ REMOTE SERVER ERROR:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(companionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard copy error:', err);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '14px',
        overflowY: 'auto',
      }}
      className="mono custom-scrollbar"
    >
      {/* Top Header & Server Status Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="font-display relic-glow" style={{ fontSize: '12px', letterSpacing: '0.12em' }}>
            LOCAL AREA UPLINK // BRIDGE
          </div>
          <div style={{ fontSize: '8.5px', color: 'var(--text-fossil)', marginTop: '2px' }}>
            LAN COMPANION WEB CONTROLLER
          </div>
        </div>

        <div
          style={{
            fontSize: '8.5px',
            padding: '3px 8px',
            border: `1px solid ${isServerActive ? 'var(--glow-core)' : '#ff6b6b'}`,
            color: isServerActive ? 'var(--glow-core)' : '#ff6b6b',
            background: isServerActive ? 'rgba(0, 255, 204, 0.06)' : 'rgba(255, 107, 107, 0.08)',
          }}
        >
          {isServerActive ? '● LISTENING' : '○ HALTED'}
        </div>
      </div>

      <div className="weathered-line" style={{ margin: 0 }} />

      {/* QR Code Centerpiece Frame */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 12px',
          background: 'rgba(0, 0, 0, 0.45)',
          border: '1px solid var(--line-eroded)',
          position: 'relative',
        }}
      >
        {isServerActive ? (
          <>
            {/* Themed High-Contrast QR Matrix Frame */}
            <div
              style={{
                width: '180px',
                height: '180px',
                background: 'var(--stone-base, #040507)',
                border: '1px solid var(--glow-core, #38bdf8)',
                padding: '10px',
                boxShadow: '0 0 24px var(--glow-aura, rgba(56, 189, 248, 0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {/* Force every SVG pixel/path inside to fill with --glow-core */}
              <style>
                {`
                  .qr-matrix-svg svg {
                    width: 100% !important;
                    height: 100% !important;
                  }
                  .qr-matrix-svg svg path,
                  .qr-matrix-svg svg rect {
                    fill: var(--glow-core, #38bdf8) !important;
                  }
                `}
              </style>

              {qrSvg ? (
                <div
                  className="qr-matrix-svg"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
              ) : (
                <div style={{ fontSize: '10px', color: 'var(--text-ash)' }}>GENERATING...</div>
              )}

              {/* Corner crosshairs matching --glow-core */}
              <div style={{ position: 'absolute', top: -3, left: -3, width: 6, height: 6, borderLeft: '2px solid var(--glow-core, #38bdf8)', borderTop: '2px solid var(--glow-core, #38bdf8)' }} />
              <div style={{ position: 'absolute', top: -3, right: -3, width: 6, height: 6, borderRight: '2px solid var(--glow-core, #38bdf8)', borderTop: '2px solid var(--glow-core, #38bdf8)' }} />
              <div style={{ position: 'absolute', bottom: -3, left: -3, width: 6, height: 6, borderLeft: '2px solid var(--glow-core, #38bdf8)', borderBottom: '2px solid var(--glow-core, #38bdf8)' }} />
              <div style={{ position: 'absolute', bottom: -3, right: -3, width: 6, height: 6, borderRight: '2px solid var(--glow-core, #38bdf8)', borderBottom: '2px solid var(--glow-core, #38bdf8)' }} />
            </div>

            <div style={{ fontSize: '9px', color: 'var(--text-ash)', marginTop: '10px' }}>
              POINT CAMERA TO AUTO-CONNECT MOBILE CONTROLLER
            </div>
          </>
        ) : (
          <div
            style={{
              height: '180px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-fossil)',
              fontSize: '11px',
              gap: '6px',
            }}
          >
            <span>[ DAEMON OFFLINE ]</span>
            <span style={{ fontSize: '8.5px', color: 'var(--text-ash)' }}>START DAEMON TO GENERATE QR MATRIX</span>
          </div>
        )}
      </div>

      {/* Broadcast URL & Instant Copy Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--line-weathered)',
          padding: '8px 12px',
        }}
      >
        <div style={{ minWidth: 0, flex: 1, marginRight: '10px' }}>
          <div style={{ fontSize: '8px', color: 'var(--text-fossil)' }}>BROADCAST ADDRESS</div>
          <div
            style={{
              fontSize: '11px',
              color: isServerActive ? 'var(--glow-core)' : 'var(--text-ash)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: '1px',
            }}
          >
            {isServerActive ? companionUrl : 'SERVICE TERMINATED'}
          </div>
        </div>

        <button
          onClick={handleCopyUrl}
          disabled={!isServerActive}
          className={`monolith-btn ${copied ? 'active' : ''}`}
          style={{ padding: '4px 10px', fontSize: '9px', flexShrink: 0 }}
        >
          {copied ? 'COPIED ✓' : '[ 📋 COPY ]'}
        </button>
      </div>

      {/* Connected Clients Sitrep */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '8.5px', color: 'var(--text-fossil)' }}>
            PAIRED CLIENT NODES ({isServerActive ? clients.length : 0})
          </span>
          <span style={{ fontSize: '8.5px', color: 'var(--text-ash)' }}>PORT {serverPort}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {isServerActive && clients.length > 0 ? (
            clients.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  fontSize: '9.5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--glow-core)' }}>●</span>
                  <div>
                    <div style={{ color: 'var(--text-ash)', fontWeight: 600 }}>{c.device_name}</div>
                    <div style={{ fontSize: '8px', color: 'var(--text-fossil)' }}>{c.ip}</div>
                  </div>
                </div>
                <span style={{ fontSize: '8px', color: 'var(--glow-core)', opacity: 0.8 }}>
                  {c.last_seen_secs_ago === 0 ? 'ACTIVE NOW' : `${c.last_seen_secs_ago}s AGO`}
                </span>
              </div>
            ))
          ) : (
            <div
              style={{
                padding: '12px',
                textAlign: 'center',
                color: 'var(--text-fossil)',
                fontSize: '9.5px',
                border: '1px dashed var(--line-weathered)',
              }}
            >
              {isServerActive ? 'WAITING FOR COMPANION HANDSHAKE...' : 'NO ACTIVE NETWORK LISTENERS'}
            </div>
          )}
        </div>
      </div>

      {/* Action / Master Lifecycle Button */}
      <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
        <button
          onClick={handleToggleServer}
          disabled={isLoading}
          className={`monolith-btn ${isServerActive ? '' : 'active'}`}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '10px',
            letterSpacing: '0.1em',
            borderColor: isServerActive ? '#ff6b6b' : 'var(--glow-core)',
            color: isServerActive ? '#ff6b6b' : 'var(--glow-core)',
            cursor: isLoading ? 'wait' : 'pointer',
          }}
        >
          {isLoading
            ? '[ ...PROCESSING... ]'
            : isServerActive
            ? '[ ⏹ TERMINATE REMOTE SERVER ]'
            : '[ ▶ INITIALIZE UPLINK SERVER ]'}
        </button>
      </div>
    </div>
  );
};