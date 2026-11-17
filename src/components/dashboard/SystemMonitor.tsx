import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DiskVolume {
  name: string;
  mount: string;
  total_gb: number;
  used_gb: number;
}

interface ProcessItem {
  pid: number;
  name: string;
  cpu: number;
  mem_mb: number;
}

interface SystemVitals {
  cpu_usage: number;
  cpu_cores: number[];
  mem_used_gb: number;
  mem_total_gb: number;
  net_rx_kb: number;
  net_tx_kb: number;
  uptime_secs: number;
  process_count: number;
  disks: DiskVolume[];
  all_processes: ProcessItem[];
}

const formatUptime = (totalSecs: number) => {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const SystemMonitor: React.FC = () => {
  const [vitals, setVitals] = useState<SystemVitals>({
    cpu_usage: 0,
    cpu_cores: [],
    mem_used_gb: 0,
    mem_total_gb: 16,
    net_rx_kb: 0,
    net_tx_kb: 0,
    uptime_secs: 0,
    process_count: 0,
    disks: [],
    all_processes: [],
  });

  const [filterQuery, setFilterQuery] = useState('');
  const graphCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<{ cpu: number[]; mem: number[] }>({
    cpu: new Array(40).fill(0),
    mem: new Array(40).fill(0),
  });

  useEffect(() => {
    let isMounted = true;

    const drawGraph = () => {
      const canvas = graphCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = (canvas.width = canvas.parentElement?.clientWidth || 320);
      const h = (canvas.height = 42);

      ctx.clearRect(0, 0, w, h);

      // Subtle horizontal grid line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();

      const drawSeries = (series: number[], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const step = w / (series.length - 1);
        series.forEach((val, i) => {
          const y = h - (Math.min(100, Math.max(0, val)) / 100) * h;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * step, y);
        });
        ctx.stroke();
      };

      drawSeries(historyRef.current.mem, 'rgba(100, 116, 139, 0.6)');
      drawSeries(historyRef.current.cpu, 'var(--glow-core, rgba(241, 245, 249, 0.9))');
    };

    const fetchVitals = async () => {
      try {
        const data = await invoke<SystemVitals>('get_system_vitals');
        if (!isMounted) return;

        setVitals(data);

        const memPct = data.mem_total_gb > 0 ? (data.mem_used_gb / data.mem_total_gb) * 100 : 0;
        historyRef.current.cpu.push(data.cpu_usage);
        historyRef.current.cpu.shift();
        historyRef.current.mem.push(memPct);
        historyRef.current.mem.shift();

        drawGraph();
      } catch (err) {
        console.error('System vitals query error:', err);
      }
    };

    fetchVitals();
    const interval = setInterval(fetchVitals, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const memPercent = vitals.mem_total_gb > 0 ? (vitals.mem_used_gb / vitals.mem_total_gb) * 100 : 0;
  
  // Renders the entire process list without cutting it off
  const filteredProcs = vitals.all_processes.filter(
    (p) => p.name.toLowerCase().includes(filterQuery.toLowerCase()) || p.pid.toString().includes(filterQuery)
  );

  return (
    <div
      style={{
        padding: '10px 12px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minHeight: 0,
      }}
      className="mono"
    >
      {/* Top Header */}
      <div
        style={{
          borderBottom: '1px solid var(--line-weathered)',
          paddingBottom: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '9.5px',
          color: 'var(--text-ash)',
        }}
      >
        <span style={{ color: 'var(--glow-core)', letterSpacing: '0.08em' }}>MACHINE STATUS // LIVE METRICS</span>
        <span>UPTIME {formatUptime(vitals.uptime_secs)}</span>
      </div>

      {/* Rolling Performance Canvas */}
      <div
        style={{
          background: 'var(--bg-subpanel, rgba(0, 0, 0, 0.35))',
          border: '1px solid var(--line-weathered)',
          borderRadius: 'var(--panel-radius, 0px)',
          padding: '6px 8px',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '8px',
            color: 'var(--text-ash)',
            marginBottom: '4px',
          }}
        >
          <span>GRAPH // CPU (WHITE) vs RAM (ASH)</span>
          <span style={{ color: 'var(--glow-core)' }}>{vitals.cpu_usage.toFixed(1)}% LOAD</span>
        </div>
        <canvas ref={graphCanvasRef} style={{ width: '100%', height: '42px', display: 'block' }} />
      </div>

      {/* Primary Metrics: CPU, RAM, Network */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
        {/* CPU */}
        <div
          style={{
            background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
            borderRadius: 'var(--panel-radius, 0px)',
            padding: '6px',
            border: '1px solid var(--line-weathered)',
          }}
        >
          <div style={{ fontSize: '8px', color: 'var(--text-ash)' }}>CPU</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--glow-core)' }}>
            {vitals.cpu_usage.toFixed(0)}%
          </div>
          <div className="carved-slot" style={{ height: '3px', width: '100%', marginTop: '3px' }}>
            <div
              style={{
                width: `${Math.min(100, vitals.cpu_usage)}%`,
                height: '100%',
                background: vitals.cpu_usage > 75 ? 'var(--accent-alert, #ff6b6b)' : 'var(--glow-core)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* RAM */}
        <div
          style={{
            background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
            borderRadius: 'var(--panel-radius, 0px)',
            padding: '6px',
            border: '1px solid var(--line-weathered)',
          }}
        >
          <div style={{ fontSize: '8px', color: 'var(--text-ash)' }}>RAM</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--glow-core)' }}>
            {vitals.mem_used_gb.toFixed(1)}G
          </div>
          <div className="carved-slot" style={{ height: '3px', width: '100%', marginTop: '3px' }}>
            <div
              style={{
                width: `${memPercent}%`,
                height: '100%',
                background: memPercent > 80 ? 'var(--accent-alert, #ff6b6b)' : 'var(--glow-core)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Network */}
        <div
          style={{
            background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
            borderRadius: 'var(--panel-radius, 0px)',
            padding: '6px',
            border: '1px solid var(--line-weathered)',
          }}
        >
          <div style={{ fontSize: '8px', color: 'var(--text-ash)' }}>NET I/O</div>
          <div style={{ fontSize: '9.5px', color: 'var(--glow-core)', marginTop: '2px', whiteSpace: 'nowrap' }}>
            ↓ {vitals.net_rx_kb > 1024 ? `${(vitals.net_rx_kb / 1024).toFixed(1)}M` : `${vitals.net_rx_kb}K`}
          </div>
          <div style={{ fontSize: '8px', color: 'var(--text-fossil)' }}>
            ↑ {vitals.net_tx_kb > 1024 ? `${(vitals.net_tx_kb / 1024).toFixed(1)}M` : `${vitals.net_tx_kb}K`}
          </div>
        </div>
      </div>

      {/* Disks Storage Meter */}
      {vitals.disks.length > 0 && (
        <div
          style={{
            background: 'var(--bg-subpanel, rgba(0,0,0,0.2))',
            borderRadius: 'var(--panel-radius, 0px)',
            border: '1px solid var(--line-weathered)',
            padding: '4px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {vitals.disks.slice(0, 2).map((d) => {
            const diskPct = d.total_gb > 0 ? (d.used_gb / d.total_gb) * 100 : 0;
            return (
              <div key={d.mount} style={{ fontSize: '8px', color: 'var(--text-ash)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>{d.mount || d.name}</span>
                  <span style={{ color: 'var(--glow-core)' }}>
                    {d.used_gb.toFixed(0)}/{d.total_gb.toFixed(0)} GB ({diskPct.toFixed(0)}%)
                  </span>
                </div>
                <div className="carved-slot" style={{ height: '2px', width: '100%' }}>
                  <div
                    style={{
                      width: `${diskPct}%`,
                      height: '100%',
                      background: diskPct > 85 ? 'var(--accent-alert, #ff6b6b)' : 'var(--glow-core)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Process Directory */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '8.5px', color: 'var(--text-ash)' }}>TASKS ({vitals.process_count})</span>
          <input
            type="text"
            placeholder="FILTER..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{
              width: '80px',
              background: 'var(--bg-slot, rgba(0,0,0,0.5))',
              border: '1px solid var(--line-eroded)',
              borderRadius: 'var(--btn-radius, 0px)',
              color: 'var(--glow-core)',
              fontSize: '8.5px',
              padding: '1px 4px',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '8px',
            color: 'var(--text-fossil)',
            borderBottom: '1px solid var(--line-weathered)',
            paddingBottom: '2px',
            marginBottom: '2px',
          }}
        >
          <span>PROCESS</span>
          <span>PID / MEM / CPU</span>
        </div>

        <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, paddingRight: '2px' }}>
          {filteredProcs.map((p) => (
            <div
              key={p.pid}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '8.5px',
                padding: '2px 0',
                borderBottom: '1px solid var(--line-weathered, rgba(255, 255, 255, 0.02))',
                color: 'var(--text-ash)',
              }}
            >
              <span
                style={{
                  color: p.cpu > 5 ? '#ffffff' : 'var(--glow-core)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '120px',
                }}
              >
                {p.name}
              </span>
              <span style={{ color: p.cpu > 5 ? 'var(--accent-cyan, #5eead4)' : 'var(--text-ash)' }}>
                {p.pid} · {p.mem_mb}M · {p.cpu.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};