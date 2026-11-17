import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ThreeEngineProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  modelPath?: string;
}

interface MeshItem {
  mesh: THREE.Mesh;
  initialScale: THREE.Vector3;
  initialPos: THREE.Vector3;
  group: 'bass' | 'mid' | 'treb';
  phase: number;
}

export const ThreeEngine: React.FC<ThreeEngineProps> = ({
  analyserRef,
  modelPath = '/octahedron_triangle.glb',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || 520;
    let height = container.clientHeight || 150;

    // 1. Scene & Stationary Downward Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.8, 5.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 2. Palette Sampling from CSS Skin
    const computed = getComputedStyle(container);
    const skinCore = computed.getPropertyValue('--glow-core').trim() || '#00f0ff';
    const skinAura = computed.getPropertyValue('--glow-aura').trim() || '#ff0055';
    const skinAsh  = computed.getPropertyValue('--text-ash').trim() || '#7dd3fc';

    const colorBass = new THREE.Color(skinAura);
    const colorMid  = new THREE.Color(skinCore);
    const colorTreb = new THREE.Color(skinAsh);

    // Dynamic Multi-angle Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const topLight = new THREE.PointLight(new THREE.Color(skinCore), 3.0, 25);
    topLight.position.set(0, 4, 3);
    scene.add(topLight);

    const fillLight = new THREE.DirectionalLight(new THREE.Color(skinAura), 1.2);
    fillLight.position.set(-3, -2, -2);
    scene.add(fillLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const meshItems: MeshItem[] = [];
    const dataArray = new Uint8Array(256);

    // 3. Model Loader with fallback
    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        const rawMeshes: THREE.Mesh[] = [];
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) rawMeshes.push(child);
        });

        if (rawMeshes.length === 0) return;

        // Auto-center & frame geometry
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        gltf.scene.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          gltf.scene.scale.setScalar(2.6 / maxDim);
        }

        rootGroup.add(gltf.scene);

        // Map audio reactive groups across parts
        const total = rawMeshes.length;
        const bassCutoff = Math.floor(total * 0.45);
        const midCutoff  = Math.floor(total * 0.80);

        for (let i = 0; i < total; i++) {
          const mesh = rawMeshes[i];
          const group: 'bass' | 'mid' | 'treb' =
            i < bassCutoff ? 'bass' : i < midCutoff ? 'mid' : 'treb';

          const targetColor =
            group === 'bass' ? colorBass : group === 'mid' ? colorMid : colorTreb;

          mesh.material = new THREE.MeshStandardMaterial({
            color: targetColor.clone(),
            roughness: 0.25,
            metalness: 0.8,
            emissive: targetColor.clone(),
            emissiveIntensity: 0.45,
          });

          meshItems.push({
            mesh,
            initialScale: mesh.scale.clone(),
            initialPos: mesh.position.clone(),
            group,
            phase: Math.random() * Math.PI * 2,
          });
        }
      },
      undefined,
      () => {
        // Fallback procedural geometry if GLB is missing
        const fallbackGeo = new THREE.ConeGeometry(0.8, 1.2, 4);
        const mat = new THREE.MeshStandardMaterial({
          color: colorMid,
          emissive: colorMid,
          emissiveIntensity: 0.5,
          wireframe: true,
        });
        const fallbackMesh = new THREE.Mesh(fallbackGeo, mat);
        rootGroup.add(fallbackMesh);
        meshItems.push({
          mesh: fallbackMesh,
          initialScale: fallbackMesh.scale.clone(),
          initialPos: fallbackMesh.position.clone(),
          group: 'bass',
          phase: 0,
        });
      }
    );

    // 4. Kinetic Animation Loop
    let animId: number;
    let time = 0;

    const render = () => {
      time += 0.016;

      let bass = 0;
      let mid = 0;
      let treb = 0;

      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        bass = ((dataArray[2] || 0) + (dataArray[4] || 0) + (dataArray[6] || 0)) / (3 * 255);
        mid  = ((dataArray[14] || 0) + (dataArray[22] || 0) + (dataArray[30] || 0)) / (3 * 255);
        treb = ((dataArray[44] || 0) + (dataArray[60] || 0) + (dataArray[76] || 0)) / (3 * 255);
      }

      // Keep model stationary & centered as requested
      rootGroup.position.set(0, 0, 0);
      rootGroup.rotation.set(0, 0, 0);

      for (let i = 0; i < meshItems.length; i++) {
        const item = meshItems[i];
        let factor = 1.0;
        let surge = 0.0;

        if (item.group === 'bass') {
          factor = 1.0 + bass * 0.35;
          surge = bass;
        } else if (item.group === 'mid') {
          factor = 1.0 + mid * 0.45;
          surge = mid;
        } else {
          factor = 1.0 + treb * 0.6;
          item.mesh.position.y = item.initialPos.y + Math.sin(time * 6.0 + item.phase) * (treb * 0.08);
          surge = treb;
        }

        item.mesh.scale.copy(item.initialScale).multiplyScalar(factor);

        if (item.mesh.material instanceof THREE.MeshStandardMaterial) {
          item.mesh.material.emissiveIntensity = 0.4 + surge * 1.2;
        }
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(render);
    };

    render();

    /*const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };*/
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      // Debounce slightly (80ms) so corner dragging stays smooth
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newWidth = entry.contentRect.width;
        const newHeight = entry.contentRect.height;
        if (newWidth <= 0 || newHeight <= 0) return;

        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      }, 80);
    });

    observer.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [analyserRef, modelPath]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
};