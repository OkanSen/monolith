import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

export interface Track {
  name: string;
  path: string;
  cover_art?: string | null;
}

export type RepeatMode = 'all' | 'one' | 'off';

export function useAudioManager() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIdx, setCurrentTrackIdx] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [folderPath, setFolderPath] = useState<string>(() => {
    return localStorage.getItem('monolith_music_dir') || '';
  });

  // Playback modes
  const [isShuffle, setIsShuffle] = useState<boolean>(() => {
    return localStorage.getItem('monolith_shuffle_active') === 'true';
  });
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');

  const initAudioNodes = useCallback(() => {
    if (!audioRef.current) return;

    if (!audioContextRef.current) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;

        const gainNode = ctx.createGain();
        gainNode.gain.value = volume;

        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(ctx.destination);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;
        gainNodeRef.current = gainNode;
      } catch (err) {
        console.warn('AudioContext notice:', err);
      }
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, [volume]);

  // Set volume via Web Audio GainNode and audio element fallback
  const setAudioVolume = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolume(clamped);

    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(clamped, audioContextRef.current.currentTime);
    }
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  };

  const generateShuffledQueue = useCallback((length: number, startingIdx: number = 0) => {
    const remaining: number[] = [];
    for (let i = 0; i < length; i++) {
      if (i !== startingIdx) remaining.push(i);
    }

    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    return [startingIdx, ...remaining];
  }, []);

  const updateMediaSession = useCallback((track: Track) => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name || 'Unknown Track',
        artist: 'Monolith Deck',
        album: 'Local Repository',
        artwork: track.cover_art ? [{ src: track.cover_art, sizes: '512x512', type: 'image/png' }] : [],
      });
    }
  }, []);

  const playTrackDirect = useCallback((index: number, trackList: Track[]) => {
    if (index < 0 || index >= trackList.length || !audioRef.current) return;
    initAudioNodes();
    setCurrentTrackIdx(index);

    const track = trackList[index];
    const streamUrl = convertFileSrc(track.path);
    audioRef.current.src = streamUrl;
    audioRef.current.volume = volume;
    audioRef.current.load();

    audioRef.current
      .play()
      .then(() => {
        setIsPlaying(true);
        updateMediaSession(track);
      })
      .catch((err) => {
        console.error('Playback error:', err);
        setIsPlaying(false);
      });
  }, [initAudioNodes, volume, updateMediaSession]);

  const playTrack = useCallback((index: number, trackList: Track[] = tracks) => {
    if (index < 0 || index >= trackList.length) return;

    if (isShuffle) {
      const freshQueue = generateShuffledQueue(trackList.length, index);
      setShuffledIndices(freshQueue);
    }
    playTrackDirect(index, trackList);
  }, [isShuffle, tracks, generateShuffledQueue, playTrackDirect]);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('monolith_shuffle_active', next ? 'true' : 'false');
      } catch {}

      if (next && tracks.length > 0) {
        // Create a fresh random shuffle immediately
        setShuffledIndices(generateShuffledQueue(tracks.length, currentTrackIdx >= 0 ? currentTrackIdx : 0));
      }
      return next;
    });
  }, [tracks.length, currentTrackIdx]);

  const cycleRepeatMode = () => {
    setRepeatMode((prev) => {
      if (prev === 'all') return 'one';
      if (prev === 'one') return 'off';
      return 'all';
    });
  };

  const nextTrack = useCallback(() => {
    if (tracks.length === 0) return;

    if (isShuffle && shuffledIndices.length > 0) {
      const currentPos = shuffledIndices.indexOf(currentTrackIdx);
      if (currentPos === -1 || currentPos >= shuffledIndices.length - 1) {
        if (repeatMode === 'all') {
          playTrackDirect(shuffledIndices[0], tracks);
        } else if (repeatMode === 'off') {
          setIsPlaying(false);
        }
      } else {
        playTrackDirect(shuffledIndices[currentPos + 1], tracks);
      }
    } else {
      const nextIdx = currentTrackIdx + 1;
      if (nextIdx >= tracks.length) {
        if (repeatMode === 'all') {
          playTrackDirect(0, tracks);
        } else if (repeatMode === 'off') {
          setIsPlaying(false);
        }
      } else {
        playTrackDirect(nextIdx, tracks);
      }
    }
  }, [tracks, isShuffle, shuffledIndices, currentTrackIdx, repeatMode, playTrackDirect]);

  // Compute the live upcoming queue (shuffled or linear)
  const activeQueue = useMemo(() => {
    if (tracks.length === 0 || currentTrackIdx < 0) return [];

    if (isShuffle && shuffledIndices.length > 0) {
      const currentPos = shuffledIndices.indexOf(currentTrackIdx);
      if (currentPos === -1) return [];

      // Slice the remaining indices after currentPos
      const upcomingIndices = shuffledIndices.slice(currentPos + 1);
      return upcomingIndices.map((idx) => ({
        original_idx: idx,
        name: tracks[idx]?.name || 'Unknown Track',
      }));
    } else {
      // Linear alphabetical queue
      return tracks.slice(currentTrackIdx + 1).map((track, i) => ({
        original_idx: currentTrackIdx + 1 + i,
        name: track.name,
      }));
    }
  }, [tracks, currentTrackIdx, isShuffle, shuffledIndices]);

  const prevTrack = useCallback(() => {
    if (tracks.length === 0) return;

    if (isShuffle && shuffledIndices.length > 0) {
      const currentPos = shuffledIndices.indexOf(currentTrackIdx);
      if (currentPos <= 0) {
        playTrackDirect(shuffledIndices[shuffledIndices.length - 1], tracks);
      } else {
        playTrackDirect(shuffledIndices[currentPos - 1], tracks);
      }
    } else {
      const prevIdx = (currentTrackIdx - 1 + tracks.length) % tracks.length;
      playTrackDirect(prevIdx, tracks);
    }
  }, [tracks, isShuffle, shuffledIndices, currentTrackIdx, playTrackDirect]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    initAudioNodes();

    // Check the hardware HTMLAudioElement state directly to eliminate React closure lag
    const isActuallyPaused = audio.paused || audio.ended;

    if (!isActuallyPaused) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if ((currentTrackIdx === -1 || !audio.src) && tracks.length > 0) {
        playTrack(0);
      } else {
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.error('Playback resume error:', err);
            if (tracks.length > 0) {
              playTrack(currentTrackIdx >= 0 ? currentTrackIdx : 0);
            }
          });
      }
    }
  }, [currentTrackIdx, tracks, initAudioNodes, playTrack]);

  const handleTrackEnded = () => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(console.error);
      }
      return;
    }
    nextTrack();
  };

  const seek = (timeInSeconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = timeInSeconds;
    setCurrentTime(timeInSeconds);
  };

  const loadFolder = async (dirPath: string, autoPlay: boolean = true) => {
    const cleaned = dirPath.replace(/^["']|["']$/g, '').trim();
    if (!cleaned) return;

    try {
      const result = await invoke<Track[]>('scan_music_directory', { folderPath: cleaned });
      setTracks(result);
      setFolderPath(cleaned);
      localStorage.setItem('monolith_music_dir', cleaned);

      if (result.length > 0) {
        const shufflePref = localStorage.getItem('monolith_shuffle_active') === 'true';
        if (shufflePref) {
          setShuffledIndices(generateShuffledQueue(result.length, 0));
        }
        if (autoPlay) {
          playTrackDirect(0, result);
        } else {
          setCurrentTrackIdx(0);
          if (audioRef.current) {
            audioRef.current.src = convertFileSrc(result[0].path);
            audioRef.current.volume = volume;
            audioRef.current.load();
          }
        }
      }
    } catch (err) {
      console.error('Failed to scan music directory:', err);
    }
  };

  useEffect(() => {
    const savedDir = localStorage.getItem('monolith_music_dir');
    if (savedDir) {
      loadFolder(savedDir, false);
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      if (audioRef.current) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [nextTrack, prevTrack]);

  // FOR PLAYBACK DEVICE SETTINGS
  // 1. Add state for active sink ID (persisted in localStorage)
  const [audioDeviceId, setAudioDeviceId] = useState<string>(() => {
    return localStorage.getItem('monolith_audio_device_id') || 'default';
  });

  // 2. Handler to switch output device on the audio element
  const setAudioDevice = useCallback(async (deviceId: string) => {
    setAudioDeviceId(deviceId);
    localStorage.setItem('monolith_audio_device_id', deviceId);

    // If default, route to system default sink without errors
    if (deviceId === 'default' || !deviceId) {
      try {
        const ctx = audioContextRef.current as any;
        if (ctx && typeof ctx.setSinkId === 'function') {
          await ctx.setSinkId('');
        }
      } catch (e) {
        // Fallback silently if unsupported
      }
      return;
    }

    // Only attempt setSinkId if the ID is NOT a raw Windows device name
    // (Chromium device IDs are 64-character hex/hash strings)
    const isBrowserSinkHash = /^[a-f0-9]{64}$/i.test(deviceId);
    if (!isBrowserSinkHash) {
      // It's a Windows hardware name from Rust WASAPI, not a Chromium sink hash.
      // Do not pass raw OS names to AudioContext.setSinkId to prevent NotFoundError.
      return;
    }

    try {
      const ctx = audioContextRef.current as any;
      if (ctx && typeof ctx.setSinkId === 'function') {
        await ctx.setSinkId(deviceId);
      }
    } catch (err) {
      console.warn('AudioContext sink routing notice:', err);
    }
  }, []);

  // 3. Re-apply saved device ID when audio element mounts
  useEffect(() => {
    const savedDevice = localStorage.getItem('monolith_audio_device_id');
    if (savedDevice && savedDevice !== 'default') {
      setAudioDevice(savedDevice);
    }
  }, [setAudioDevice]);

  return {
    audioRef,
    analyserRef,
    tracks,
    currentTrackIdx,
    isPlaying,
    currentTime,
    duration,
    volume,
    folderPath,
    isShuffle,
    activeQueue,
    repeatMode,
    toggleShuffle,
    cycleRepeatMode,
    handleTrackEnded,
    setAudioVolume,
    loadFolder,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    audioDeviceId,
    setAudioDevice,
  };
}