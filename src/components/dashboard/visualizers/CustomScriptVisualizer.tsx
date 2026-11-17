import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { invoke } from '@tauri-apps/api/core';

interface CustomScriptVisualizerProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  scriptPath: string;
}

export const CustomScriptVisualizer: React.FC<CustomScriptVisualizerProps> = ({
  analyserRef,
  scriptPath,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let animId: number;
    let activeEngine: {
      render: (data: { bass: number; mid: number; treb: number; time: number }) => void;
      resize: (w: number, h: number) => void;
      destroy: () => void;
    } | null = null;

    const runScript = async () => {
      try {
        // 1. Read JavaScript source code via Rust
        const code = await invoke<string>('read_custom_visualizer_code', { filePath: scriptPath });

        // 2. Wrap code into an ES Module Blob
        const blob = new Blob([code], { type: 'application/javascript' });
        const moduleUrl = URL.createObjectURL(blob);
        const module = await import(/* @vite-ignore */ moduleUrl);
        URL.revokeObjectURL(moduleUrl);

        if (destroyed || !container) return;

        // 3. Robust & Sanitized model path resolver for Windows / POSIX
        const loadGLB = async (modelFileName: string) => {
          // Defense 1: Reject path traversal sequences
          if (modelFileName.includes('..') || modelFileName.startsWith('/') || modelFileName.includes(':')) {
            throw new Error(`Security Violation: Path traversal or absolute paths not permitted: ${modelFileName}`);
          }

          // Defense 2: Restrict allowed asset extensions
          const lower = modelFileName.toLowerCase();
          if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) {
            throw new Error(`Security Violation: Only 3D model formats (.glb, .gltf) are permitted. Received: ${modelFileName}`);
          }

          // Normalize slashes
          const normalized = scriptPath.replace(/\\/g, '/');
          const folder = normalized.substring(0, normalized.lastIndexOf('/') + 1);
          const fullPath = folder + modelFileName;

          const bytes = await invoke<number[]>('read_binary_file', { filePath: fullPath });
          const buffer = new Uint8Array(bytes).buffer;

          return new Promise<any>((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.parse(buffer, '', resolve, reject);
          });
        };

        const getTheme = () => {
          const s = getComputedStyle(container);
          return {
            core: s.getPropertyValue('--glow-core').trim() || '#00f0ff',
            aura: s.getPropertyValue('--glow-aura').trim() || '#ff0055',
            ash: s.getPropertyValue('--text-ash').trim() || '#64748b',
          };
        };

        // 4. Initialize script engine
        activeEngine = module.default({
            container,
            THREE,
            loadGLB,
            getTheme,
            analyserRef,
        });

        // 5. Kinetic Audio Loop
        const dataArray = new Uint8Array(256);
        let time = 0;

        const loop = () => {
          time += 0.016;
          let bass = 0, mid = 0, treb = 0;

          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            bass = ((dataArray[2] || 0) + (dataArray[4] || 0) + (dataArray[6] || 0)) / (3 * 255);
            mid  = ((dataArray[14] || 0) + (dataArray[22] || 0) + (dataArray[30] || 0)) / (3 * 255);
            treb = ((dataArray[44] || 0) + (dataArray[60] || 0) + (dataArray[76] || 0)) / (3 * 255);
          }

          if (activeEngine?.render) {
            activeEngine.render({ bass, mid, treb, time });
          }

          animId = requestAnimationFrame(loop);
        };

        loop();
      } catch (err) {
        console.error('Failed to run custom visualizer script:', err);
      }
    };

    runScript();

    const handleResize = () => {
      if (!container || !activeEngine) return;
      activeEngine.resize(container.clientWidth || 520, container.clientHeight || 150);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (activeEngine?.destroy) {
        activeEngine.destroy();
      }
    };
  }, [scriptPath, analyserRef]);

  
  // Debounced Resize Observer to adapt Three.js & dynamic scripts cleanly
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;

      // Debounce by 100ms to avoid thrashing GPU buffers during live drag
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }

      resizeDebounceRef.current = setTimeout(() => {
        // 1. Dispatch a standard resize event so window listeners in scripts pick it up
        window.dispatchEvent(new Event('resize'));

        // 2. Direct Three.js canvas buffer auto-fit (if canvas element exists)
        const canvas = container.querySelector('canvas');
        if (canvas) {
          // If the script exposed a Three.js renderer or camera on the canvas/window:
          const anyCanvas = canvas as any;
          if (anyCanvas.__threeRenderer && anyCanvas.__threeCamera) {
            anyCanvas.__threeCamera.aspect = width / height;
            anyCanvas.__threeCamera.updateProjectionMatrix();
            anyCanvas.__threeRenderer.setSize(width, height, false);
          }
        }
      }, 100);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
};