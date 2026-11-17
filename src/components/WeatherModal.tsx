import React, { useEffect, useRef } from 'react';

export interface WeatherData {
  temp_C: string;
  temp_F?: number;
  condition: string;
  humidity: string;
  windSpeed: string;
  windDir: string;
  pressure: string;
  location: string;
  feelsLike: string;
  cloudCover: string;
  precipChance: string;
  minTemp: string;
  maxTemp: string;
  hourly: Array<{
    time: string;
    temp_C: string;
    icon: string;
    desc: string;
  }>;
}

export const getWeatherGlyph = (conditionStr?: string) => {
  if (!conditionStr) return '☁';
  const c = conditionStr.toLowerCase();
  if (c.includes('snow') || c.includes('blizzard') || c.includes('ice') || c.includes('flurry')) return '❄';
  if (c.includes('thunder') || c.includes('storm')) return '⛈';
  if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) return '🌧';
  if (c.includes('cloud') || c.includes('overcast')) return '☁';
  if (c.includes('fog') || c.includes('mist')) return '🌫';
  if (c.includes('clear') || c.includes('sun')) return '☀';
  return '☁';
};

// -------------------------------------------------------------
// WEATHER ATMOSPHERE OVERLAY (CANVAS RAIN + DRIFTING SNOW ENGINE)
// -------------------------------------------------------------
type WeatherGroup = 'storm' | 'rain' | 'snow' | 'overcast' | 'partly-cloudy' | 'sunny';

const resolveWeatherGroup = (raw?: string): WeatherGroup => {
  if (!raw) return 'partly-cloudy';
  const c = raw.toLowerCase();

  // 1. Snow / Blizzard
  if (c.includes('snow') || c.includes('blizzard') || c.includes('ice') || c.includes('sleet') || c.includes('flurry')) {
    return 'snow';
  }
  // 2. Storm / Severe
  if (c.includes('thunder') || c.includes('storm')) {
    return 'storm';
  }
  // 3. Rain / Shower / Drizzle
  if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) {
    return 'rain';
  }
  // 4. Overcast / Cloudy / Fog
  if (c.includes('overcast') || c.includes('cloudy') || c.includes('fog') || c.includes('mist') || c.includes('haze')) {
    return 'overcast';
  }
  // 5. Sunny / Clear
  if (c.includes('sun') || c.includes('clear')) {
    return 'sunny';
  }

  return 'partly-cloudy';
};

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
  width: number;
}

interface SnowFlake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  swaySpeed: number;
  swayAmplitude: number;
  swayOffset: number;
  opacity: number;
}

export const WeatherAtmosphereOverlay: React.FC<{ condition?: string; style?: React.CSSProperties }> = ({ condition, style }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const group = resolveWeatherGroup(condition);
  const isRain = group === 'rain' || group === 'storm';
  const isSnow = group === 'snow';

  useEffect(() => {
    if (!isRain && !isSnow) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // RAIN ENGINE
    const rainCount = group === 'storm' ? 220 : 140;
    const drops: RainDrop[] = Array.from({ length: rainCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      speed: group === 'storm' ? 11 + Math.random() * 9 : 6.5 + Math.random() * 5.5,
      length: group === 'storm' ? 14 + Math.random() * 12 : 9 + Math.random() * 8,
      opacity: group === 'storm' ? 0.25 + Math.random() * 0.45 : 0.18 + Math.random() * 0.35,
      width: Math.random() > 0.4 ? 1.5 : 1,
    }));

    // SNOW ENGINE
    const snowCount = 120;
    const flakes: SnowFlake[] = Array.from({ length: snowCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1.2 + Math.random() * 2.6,
      speed: 0.8 + Math.random() * 1.6,
      swaySpeed: 0.015 + Math.random() * 0.025,
      swayAmplitude: 0.6 + Math.random() * 1.4,
      swayOffset: Math.random() * Math.PI * 2,
      opacity: 0.2 + Math.random() * 0.55,
    }));

    let frameCount = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      frameCount++;

      if (isRain) {
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          ctx.fillStyle = `rgba(215, 235, 255, ${d.opacity})`;
          ctx.fillRect(d.x, d.y, d.width, d.length);

          d.y += d.speed;

          if (d.y > height) {
            d.y = -d.length;
            d.x = Math.random() * width;
          }
        }
      } else if (isSnow) {
        for (let i = 0; i < flakes.length; i++) {
          const f = flakes[i];
          f.x += Math.sin(frameCount * f.swaySpeed + f.swayOffset) * f.swayAmplitude;
          f.y += f.speed;

          if (f.y > height + 5) {
            f.y = -5;
            f.x = Math.random() * width;
          }
          if (f.x > width + 5) f.x = -5;
          if (f.x < -5) f.x = width + 5;

          ctx.beginPath();
          ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(240, 245, 255, ${f.opacity})`;
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isRain, isSnow, group]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 1,
        ...style,
      }}
    >
      {/* 1. Lightning flashes ONLY for Storm */}
      {group === 'storm' && <div className="weather-fx-storm" />}

      {/* 2. Canvas Particles (Covers Storm, Rain, and Snow) */}
      {(isRain || isSnow) && (
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      )}

      {/* 3. Overcast / Fog */}
      {group === 'overcast' && <div className="weather-fx-overcast" />}

      {/* 4. Partly Cloudy */}
      {group === 'partly-cloudy' && <div className="weather-fx-partly-cloudy" />}

      {/* 5. Sunny / Clear */}
      {group === 'sunny' && <div className="weather-fx-sunny" />}
    </div>
  );
};

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  tempUnit: 'C' | 'F';
  onToggleTempUnit: (unit: 'C' | 'F') => void;
}

export const WeatherModal: React.FC<WeatherModalProps> = ({
  isOpen,
  onClose,
  weather,
  loading,
  error,
  onRefresh,
  tempUnit = 'C',
  onToggleTempUnit,
}) => {
  // Helper to convert and display temperatures based on active unit
  const formatTemp = (cVal?: string | number, fallback = '--') => {
    if (cVal === undefined || cVal === null || cVal === '') return fallback;
    const num = typeof cVal === 'number' ? cVal : parseFloat(cVal);
    if (isNaN(num)) return fallback;
    if (tempUnit === 'F') {
      return Math.round(num * 1.8 + 32).toString();
    }
    return Math.round(num).toString();
  };

  return (
    <div
      onClick={onClose}
      className={`monolith-modal-overlay ${isOpen ? 'open' : ''}`}
      style={{
        backgroundColor: 'var(--bg-modal-overlay, rgba(5, 6, 8, 0.78))',
        backdropFilter: 'blur(16px)',
        zIndex: 45,
        padding: '24px',
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      <WeatherAtmosphereOverlay condition={weather?.condition} />

      <div
        onClick={(e) => e.stopPropagation()}
        className="mono monolith-modal-content"
        style={{
          width: '82vw',
          maxWidth: '1280px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* CONTAINER 1: CURRENT METRICS */}
        <section
          className="glass-panel"
          style={{
            padding: '20px 24px',
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--line-weathered)',
              paddingBottom: '10px',
              fontSize: '11px',
              color: 'var(--text-ash)',
              letterSpacing: '0.1em',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>ATMOSPHERE // CURRENT METRICS</span>
              <button
                onClick={onRefresh}
                className="monolith-btn"
                style={{ padding: '3px 8px', fontSize: '9px' }}
                title="Force refresh telemetry"
              >
                [ RE-POLL ]
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  onClick={() => onToggleTempUnit('C')}
                  className={`monolith-btn ${tempUnit === 'C' ? 'active' : ''}`}
                  style={{ fontSize: '9px', padding: '2px 6px', fontWeight: tempUnit === 'C' ? 700 : 400 }}
                >
                  °C
                </button>
                <button
                  onClick={() => onToggleTempUnit('F')}
                  className={`monolith-btn ${tempUnit === 'F' ? 'active' : ''}`}
                  style={{ fontSize: '9px', padding: '2px 6px', fontWeight: tempUnit === 'F' ? 700 : 400 }}
                >
                  °F
                </button>
              </div>

              <span style={{ color: 'var(--glow-core)', fontSize: '13px', fontWeight: 600 }}>
                {weather?.location || 'POLLING REGION...'}
              </span>
            </div>
          </div>

          {loading ? (
            <div
              style={{
                padding: '30px 0',
                textAlign: 'center',
                fontSize: '12px',
                color: 'var(--text-ash)',
                position: 'relative',
                zIndex: 10,
              }}
            >
              SYNCHRONIZING SENSORS...
            </div>
          ) : error ? (
            <div
              style={{
                padding: '24px 0',
                textAlign: 'center',
                fontSize: '12px',
                color: 'var(--accent-alert, #ff4d4d)',
                position: 'relative',
                zIndex: 10,
              }}
            >
              TELEMETRY ERROR // {error}
            </div>
          ) : weather ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                position: 'relative',
                zIndex: 10,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
                  <div
                    style={{
                      fontSize: '68px',
                      fontWeight: 800,
                      color: 'var(--glow-core)',
                      lineHeight: 1,
                      letterSpacing: '-0.02em',
                      textShadow: '0 0 20px rgba(0,0,0,0.8)',
                    }}
                  >
                    {formatTemp(weather.temp_C)}°{tempUnit}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-ash)', letterSpacing: '0.04em' }}>
                    FEELS LIKE{' '}
                    <span style={{ color: 'var(--glow-core)', fontWeight: 600 }}>
                      {formatTemp(weather.feelsLike ?? weather.temp_C)}°{tempUnit}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--glow-core)',
                    marginTop: '8px',
                    letterSpacing: '0.06em',
                  }}
                >
                  {weather.condition || 'CLEAR'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-ash)', marginTop: '4px' }}>
                  DAY RANGE // MIN: {formatTemp(weather.minTemp)}°{tempUnit} — MAX: {formatTemp(weather.maxTemp)}°{tempUnit}
                </div>
              </div>

              <div
                className="relic-icon-filter"
                style={{
                  fontSize: '76px',
                  lineHeight: 1,
                  paddingRight: '12px',
                  userSelect: 'none',
                }}
              >
                {getWeatherGlyph(weather.condition)}
              </div>
            </div>
          ) : null}
        </section>

        {/* CONTAINER 2: HOURLY CHRONO TRACK */}
        <section
          className="glass-panel"
          style={{
            padding: '16px 20px',
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-ash)',
              letterSpacing: '0.1em',
              borderBottom: '1px solid var(--line-weathered)',
              paddingBottom: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <span>CHRONO PROJECTION TRACK // NEXT 10 HOURS</span>
            <span style={{ color: 'var(--text-fossil)' }}>INTERVAL: +1H</span>
          </div>

          <div
            className="custom-scrollbar"
            style={{
              display: 'flex',
              gap: '12px',
              overflowX: 'auto',
              paddingBottom: '4px',
              position: 'relative',
              zIndex: 10,
            }}
          >
            {weather?.hourly && weather.hourly.length > 0 ? (
              weather.hourly.map((h, idx) => (
                <div
                  key={idx}
                  style={{
                    flex: '1 0 95px',
                    minWidth: '95px',
                    borderRadius: 'var(--panel-radius, 0px)',
                    background:
                      idx === 0
                        ? 'var(--bg-slot, rgba(255, 255, 255, 0.05))'
                        : 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
                    border: idx === 0 ? '1px solid var(--glow-core)' : '1px solid var(--line-weathered)',
                    padding: '14px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = 'var(--glow-core)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      idx === 0
                        ? 'var(--bg-slot, rgba(255, 255, 255, 0.05))'
                        : 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))';
                    e.currentTarget.style.borderColor = idx === 0 ? 'var(--glow-core)' : 'var(--line-weathered)';
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        color: idx === 0 ? 'var(--glow-core)' : 'var(--text-ash)',
                        fontWeight: idx === 0 ? 700 : 400,
                      }}
                    >
                      {h.time}
                    </span>
                    {idx === 0 && (
                      <span style={{ fontSize: '8px', color: 'var(--glow-core)', letterSpacing: '0.08em' }}>
                        [NOW]
                      </span>
                    )}
                  </div>

                  <span className="relic-icon-filter" style={{ fontSize: '26px' }}>
                    {h.icon}
                  </span>
                  <span style={{ fontSize: '16px', color: 'var(--glow-core)', fontWeight: 700 }}>
                    {formatTemp(h.temp_C)}°
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      color: 'var(--text-fossil)',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '85px',
                    }}
                  >
                    {h.desc}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-ash)', padding: '16px 0' }}>
                PROJECTION STREAM BUFFERING...
              </div>
            )}
          </div>
        </section>

        {/* CONTAINER 3: DIAGNOSTIC MATRIX */}
        <section
          className="glass-panel"
          style={{
            padding: '16px 20px',
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-ash)',
              letterSpacing: '0.1em',
              borderBottom: '1px solid var(--line-weathered)',
              paddingBottom: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <span>DIAGNOSTIC MATRIX // READINGS</span>
            <span style={{ color: 'var(--text-fossil)' }}>UNITS: {tempUnit === 'C' ? 'METRIC' : 'IMPERIAL'}</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <div
              style={{
                background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
                borderRadius: 'var(--panel-radius, 0px)',
                padding: '12px 14px',
                border: '1px solid var(--line-weathered)',
              }}
            >
              <div style={{ color: 'var(--text-ash)', fontSize: '10px' }}>WIND VELOCITY</div>
              <div style={{ color: 'var(--glow-core)', marginTop: '4px', fontSize: '15px', fontWeight: 700 }}>
                {tempUnit === 'C'
                  ? `${weather?.windSpeed ?? '0'} KM/H`
                  : `${Math.round(parseFloat(weather?.windSpeed || '0') * 0.621371)} MPH`}
              </div>
              <div style={{ color: 'var(--text-fossil)', fontSize: '10px', marginTop: '2px' }}>
                VECTOR: {weather?.windDir ?? 'N/A'}
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
                borderRadius: 'var(--panel-radius, 0px)',
                padding: '12px 14px',
                border: '1px solid var(--line-weathered)',
              }}
            >
              <div style={{ color: 'var(--text-ash)', fontSize: '10px' }}>RELATIVE HUMIDITY</div>
              <div style={{ color: 'var(--glow-core)', marginTop: '4px', fontSize: '15px', fontWeight: 700 }}>
                {weather?.humidity ?? '0'}%
              </div>
              <div style={{ color: 'var(--text-fossil)', fontSize: '10px', marginTop: '2px' }}>
                SATURATION INDEX
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
                borderRadius: 'var(--panel-radius, 0px)',
                padding: '12px 14px',
                border: '1px solid var(--line-weathered)',
              }}
            >
              <div style={{ color: 'var(--text-ash)', fontSize: '10px' }}>PRECIPITATION</div>
              <div style={{ color: 'var(--glow-core)', marginTop: '4px', fontSize: '15px', fontWeight: 700 }}>
                {weather?.precipChance ?? '0'}%
              </div>
              <div style={{ color: 'var(--text-fossil)', fontSize: '10px', marginTop: '2px' }}>
                PROBABILITY DENSITY
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-subpanel, rgba(255, 255, 255, 0.02))',
                borderRadius: 'var(--panel-radius, 0px)',
                padding: '12px 14px',
                border: '1px solid var(--line-weathered)',
              }}
            >
              <div style={{ color: 'var(--text-ash)', fontSize: '10px' }}>ATMOSPHERIC PRESSURE</div>
              <div style={{ color: 'var(--glow-core)', marginTop: '4px', fontSize: '15px', fontWeight: 700 }}>
                {weather?.pressure ?? '0'} hPa
              </div>
              <div style={{ color: 'var(--text-fossil)', fontSize: '10px', marginTop: '2px' }}>
                BAROMETRIC SENSOR
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '2px 8px',
            fontSize: '10px',
            color: 'var(--text-ash)',
            letterSpacing: '0.08em',
            position: 'relative',
            zIndex: 10,
          }}
        >
          <span>AUTONOMOUS CACHE // 15 MIN INTERVAL</span>
          <span>PRESS [ESC] OR [ALT+Q] TO DISMISS</span>
        </div>
      </div>
    </div>
  );
};