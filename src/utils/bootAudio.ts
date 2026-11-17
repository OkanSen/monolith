import { convertFileSrc } from '@tauri-apps/api/core';

// Default gentle mathematical tone (soft, non-intrusive sine hum)
function playDefaultProceduralTone(volume: number) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const clampedVol = Math.max(0.01, Math.min(1, volume));

    // Smooth envelope with no clicks
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(clampedVol * 0.35, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    gain.connect(ctx.destination);

    // Warm sub-fundamental
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(55, now); // A1 note
    osc1.frequency.exponentialRampToValueAtTime(45, now + 2.0);

    // Gentle second harmonic
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(110, now);
    osc2.frequency.exponentialRampToValueAtTime(110, now + 1.6);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 2.2);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 2.5);
    osc2.stop(now + 2.5);
  } catch (err) {
    console.warn('Boot procedural synthesis error:', err);
  }
}

// Master Boot Audio Entrypoint
export async function playBootChime(volume: number = 0.5) {
  const customPath = localStorage.getItem('monolith_custom_boot_sound');

  if (customPath) {
    try {
      const assetUrl = convertFileSrc(customPath);
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = assetUrl;
      audio.volume = Math.max(0, Math.min(1, volume));
      
      // Fire immediately without waiting for standard event pump
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Custom boot audio failed, reverting to procedural default:', err);
          playDefaultProceduralTone(volume);
        });
      }
      return;
    } catch {
      playDefaultProceduralTone(volume);
      return;
    }
  }

  // Instantly start procedural synthesis
  playDefaultProceduralTone(volume);
}