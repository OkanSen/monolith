export default function init({ container, THREE, loadGLB, getTheme, analyserRef }) {
  let width = Math.max(container.clientWidth || 520, 320);
  let height = Math.max(container.clientHeight || 150, 120);

  // ============================================================
  // PUNCH & INDIVIDUALIZED INSTANCE IMPACT CONFIG (HIGH CONTRAST)
  // ============================================================
  const IMPACT_CONFIG = {
    attackSpeed: 0.95,        // Snappy 1-frame response on kick/snare hits
    releaseSpeed: 0.52,       // Fast reset so consecutive double-bass hits don't blur
    punchDistance: 3.40,      // Increased base outward piston displacement
    verticalSnap: 2.80,       // Elevated vertical thrust on transients
    scalePunch: 0.65,         // Block scale expansion multiplier
    exponentialPower: 1.6,    // Exponent curve: suppresses low hum, spikes on loud hits
    transientMultiplier: 5.5, // Transient velocity sensitivity
    noiseFloorCutoff: 0.04,   // Audio below 5% is zeroed out for completely calm rests
    individualVariance: 0.85, // powerBias ranges from ~0.45x up to 2.45x
    microJitterAmount: 0.65,  // Prominent micro-shivers across individual shapes
    tangentTiltMax: 0.16,     // Angular torque on peak hits
  };

  // 1. Procedural Chiseled Stone Bump Texture
  const createStoneTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 35;
      data[i]     = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    for (let y = 0; y < 512; y += 4 + Math.floor(Math.random() * 6)) {
      const lineDepth = Math.random() * 0.45 + 0.1;
      const isRidge = Math.random() > 0.5;

      ctx.strokeStyle = isRidge
        ? `rgba(255, 255, 255, ${lineDepth * 0.35})`
        : `rgba(0, 0, 0, ${lineDepth * 0.55})`;
      ctx.lineWidth = Math.random() * 1.5 + 0.5;

      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < 512; x += 32) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 1.8);
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  };

  const stoneBumpMap = createStoneTexture();

  // 2. Scene & Deep Fog
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0x050608);
  scene.fog = new THREE.Fog(fogColor, 40, 320);

  // PRESERVED: Your exact camera standoff & focus target
  const camera = new THREE.PerspectiveCamera(46, width / height, 0.01, 2500);
  camera.position.set(40, 0, 260);
  camera.lookAt(0, -0.5, 0);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // 3. Theme Colors & External Lighting
  const theme = getTheme ? getTheme() : {};
  const themeAccentHex = theme.core || theme.aura || '#00e5ff';
  const baseAccentColor = new THREE.Color(themeAccentHex);
  const colorRest = new THREE.Color(0x101318);

  const hsl = { h: 0, s: 0, l: 0 };
  baseAccentColor.getHSL(hsl);

  const getThemeHarmonicColor = (normalizedTier, timeOffset) => {
    const col = new THREE.Color();
    const tierHue = (hsl.h + (normalizedTier - 0.5) * 0.22 + Math.sin(timeOffset) * 0.03 + 1.0) % 1.0;
    const tierSat = Math.max(0.45, Math.min(0.95, hsl.s * 0.85));
    const tierLight = 0.36 + normalizedTier * 0.24;
    col.setHSL(tierHue, tierSat, tierLight);
    return col;
  };

  const sunLight = new THREE.DirectionalLight(0xfff8ee, 2.6);
  sunLight.position.set(45, 75, 45);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x353b47, 0.40);
  scene.add(ambientLight);

  const rimLight = new THREE.DirectionalLight(baseAccentColor, 1.1);
  rimLight.position.set(-45, -5, -45);
  scene.add(rimLight);

  // ============================================================
  // 4. THE PULSING CORE STAR & INTERIOR ILLUMINATION ENGINE
  // ============================================================
  const coreStarGroup = new THREE.Group();
  scene.add(coreStarGroup);

  // A. Inner PointLight: Illuminates internal pyramid cavities outward
  const starLight = new THREE.PointLight(0x00e5ff, 4.0, 75, 1.8);
  starLight.position.set(0, 0, 0);
  coreStarGroup.add(starLight);

  // B. Dense Luminous Star Core
  const starGeo = new THREE.SphereGeometry(0.85, 32, 32);
  const starMat = new THREE.MeshBasicMaterial({
    color: 0x99f6ff,
    transparent: true,
    opacity: 0.95,
  });
  const starCore = new THREE.Mesh(starGeo, starMat);
  coreStarGroup.add(starCore);

  // C. Ethereal Plasma Corona (Atmospheric Halo)
  const coronaGeo = new THREE.SphereGeometry(1.6, 32, 32);
  const coronaMat = new THREE.MeshBasicMaterial({
    color: 0x00a2ff,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  const starCorona = new THREE.Mesh(coronaGeo, coronaMat);
  coreStarGroup.add(starCorona);

  // 5. Mirror Floor Plate
  const floorGeo = new THREE.PlaneGeometry(350, 350);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x06070a,
    roughness: 0.12,
    metalness: 0.88,
    transparent: true,
    opacity: 0.70,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.6;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // 6. Floating Dust Particles
  const particleCount = 200;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleVelocities = [];

  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 110;
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 50 + 10;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 110;
    particleVelocities.push({
      y: Math.random() * 0.012 + 0.004,
      wobble: Math.random() * Math.PI * 2,
    });
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

  const particleMat = new THREE.PointsMaterial({
    color: baseAccentColor,
    size: 0.24,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
  });
  const particleSystem = new THREE.Points(particleGeo, particleMat);
  scene.add(particleSystem);

  // 7. Instanced Megalith (2 Copies: Core + Subterranean Inversion)
  const rootGroup = new THREE.Group();
  scene.add(rootGroup);

  const TOTAL_BINS = 64;
  const binGroups = [];
  const dummy = new THREE.Object3D();
  const tiltQuat = new THREE.Quaternion();

  loadGLB('octahedron_triangle.glb')
    .then((gltf) => {
      const rawMeshes = [];
      gltf.scene.traverse((child) => {
        if (child.isMesh || child instanceof THREE.Mesh || child.type === 'Mesh') {
          rawMeshes.push(child);
        }
      });

      if (rawMeshes.length === 0) return;

      const masterGeometry = rawMeshes[0].geometry.clone();

      const box = new THREE.Box3().setFromObject(gltf.scene);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const totalMeshes = rawMeshes.length;
      const rawTransforms = [];

      for (let i = 0; i < totalMeshes; i++) {
        const m = rawMeshes[i];
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();

        m.getWorldPosition(worldPos);
        m.getWorldQuaternion(worldQuat);
        m.getWorldScale(worldScale);

        worldPos.sub(center);

        const outwardDir = worldPos.clone().normalize();
        if (outwardDir.lengthSq() === 0) outwardDir.set(0, 1, 0);

        const powerBias = 1.0 + (Math.random() - 0.5) * 2.0 * IMPACT_CONFIG.individualVariance;
        const jitterPhase = Math.random() * Math.PI * 2;
        const jitterOffset = new THREE.Vector3(
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7
        );

        const tiltAxis = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();

        rawTransforms.push({
          pos: worldPos,
          rot: worldQuat,
          scale: worldScale,
          outwardDir,
          height: worldPos.y,
          powerBias,
          jitterPhase,
          jitterOffset,
          tiltAxis,
        });
      }

      rawTransforms.sort((a, b) => a.height - b.height);

      const binBuckets = Array.from({ length: TOTAL_BINS }, () => []);
      for (let i = 0; i < totalMeshes; i++) {
        const binIndex = Math.min(TOTAL_BINS - 1, Math.floor((i / totalMeshes) * TOTAL_BINS));
        binBuckets[binIndex].push(rawTransforms[i]);
      }

      const COPIES_COUNT = 2;

      for (let b = 0; b < TOTAL_BINS; b++) {
        const bucket = binBuckets[b];
        if (bucket.length === 0) continue;

        const material = new THREE.MeshStandardMaterial({
          color: colorRest.clone(),
          roughness: 0.62,
          metalness: 0.38,
          bumpMap: stoneBumpMap,
          bumpScale: 0.12,
          emissive: colorRest.clone(),
          emissiveIntensity: 0.0,
          side: THREE.DoubleSide,
        });

        const totalInstances = bucket.length * COPIES_COUNT;
        const instancedMesh = new THREE.InstancedMesh(masterGeometry, material, totalInstances);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        rootGroup.add(instancedMesh);

        binGroups.push({
          instancedMesh,
          material,
          transforms: bucket,
          smoothedEnergy: 0,
          prevEnergy: 0,
          transientSpike: 0,
          tierIndex: b,
        });
      }

      console.log(`[OCTAHEDRON] Loaded ${totalMeshes} blocks with core star engine.`);
    })
    .catch((err) => {
      console.error('[OCTAHEDRON] Load error:', err);
    });

  // 8. 64-Bin Musical Frequency Extractor
  const dataArray = new Uint8Array(256);
  const getLogFrequencyValue = (index, total, data) => {
    if (!data || !data.length) return 0;
    const activeRangeLength = Math.max(10, Math.floor(data.length * 0.165));
    const minLog = Math.log10(1);
    const maxLog = Math.log10(activeRangeLength);
    const exp = minLog + (index / total) * (maxLog - minLog);
    const bin = Math.min(activeRangeLength - 1, Math.max(0, Math.floor(Math.pow(10, exp))));
    return (data[bin] || 0) / 255;
  };

  // Smoothing trackers for core star dynamics
  let smoothedCoreVolume = 0;
  let prevCoreVolume = 0;

  // 9. Kinetic Render Loop
  return {
    resize: (w, h) => {
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    render: ({ bass = 0, treb = 0, time = 0 }) => {
      rootGroup.position.set(0, 0, 0);
      rootGroup.rotation.y = time * 0.014;
      rootGroup.rotation.x = Math.sin(time * 0.12) * 0.003;

      const binEnergies = new Float32Array(TOTAL_BINS);
      let totalMasterSum = 0;

      if (analyserRef && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        for (let b = 0; b < TOTAL_BINS; b++) {
          const val = getLogFrequencyValue(b, TOTAL_BINS, dataArray);
          binEnergies[b] = val;
          totalMasterSum += val;
        }
      } else {
        for (let b = 0; b < TOTAL_BINS; b++) {
          const val = b < 20 ? bass : treb;
          binEnergies[b] = val;
          totalMasterSum += val;
        }
      }

      // ============================================================
      // CORE STAR DYNAMICS (Scales & flares with bass + master volume)
      // ============================================================
      const rawMasterVolume = totalMasterSum / TOTAL_BINS;
      const coreTransient = Math.max(0, rawMasterVolume - prevCoreVolume);
      prevCoreVolume = rawMasterVolume;

      // Fast snap attack, smooth decay for star size
      if (rawMasterVolume > smoothedCoreVolume) {
        smoothedCoreVolume += (rawMasterVolume - smoothedCoreVolume) * 0.85;
      } else {
        smoothedCoreVolume -= (smoothedCoreVolume - rawMasterVolume) * 0.25;
      }

      const starPower = Math.pow(smoothedCoreVolume, 1.5) + coreTransient * 3.0 + bass * 0.6;
      const starScale = 0.8 + starPower * 2.2;

      starCore.scale.setScalar(starScale);
      starCorona.scale.setScalar(starScale * 1.35);

      // Light pulses from inside out: bright cyan on transients
      starLight.intensity = 2.5 + starPower * 8.5;
      starLight.distance = 50 + starPower * 65;

      starMat.opacity = Math.min(1.0, 0.75 + starPower * 0.25);
      coronaMat.opacity = Math.min(0.85, 0.25 + starPower * 0.45);

      // Gentle wobble inside the cavity
      coreStarGroup.position.y = Math.sin(time * 2.0) * 0.15;
      starCorona.rotation.y = time * 0.4;
      starCorona.rotation.z = time * 0.25;

      // Dust Animation
      const posAttr = particleGeo.attributes.position;
      for (let p = 0; p < particleCount; p++) {
        let py = posAttr.getY(p) - particleVelocities[p].y * (1.0 + bass * 0.8);
        if (py < -8) py = 35;
        posAttr.setY(p, py);

        const px = posAttr.getX(p) + Math.cos(time + particleVelocities[p].wobble) * 0.008;
        posAttr.setX(p, px);
      }
      posAttr.needsUpdate = true;
      particleMat.opacity = 0.22 + treb * 0.25;

      const gridOffsets = [
        { x: 0, y: 0, z: 0, flipY: false }, // Core 75k Pyramid
        { x: 0, y: 0, z: 0, flipY: true  }, // Inverted Floor Reflection
      ];

      // Update 64 Strata Tiers
      for (let g = 0; g < binGroups.length; g++) {
        const group = binGroups[g];
        const rawEnergy = binEnergies[group.tierIndex] || 0;

        const delta = Math.max(0, rawEnergy - group.prevEnergy);
        group.prevEnergy = rawEnergy;
        group.transientSpike = Math.max(delta * IMPACT_CONFIG.transientMultiplier, group.transientSpike * 0.62);

        if (rawEnergy > group.smoothedEnergy) {
          group.smoothedEnergy += (rawEnergy - group.smoothedEnergy) * IMPACT_CONFIG.attackSpeed;
        } else {
          group.smoothedEnergy -= (group.smoothedEnergy - rawEnergy) * IMPACT_CONFIG.releaseSpeed;
        }

        const tierEnergy = group.smoothedEnergy;
        const normalizedTier = group.tierIndex / TOTAL_BINS;

        const gatedEnergy = Math.max(0, (tierEnergy - IMPACT_CONFIG.noiseFloorCutoff) / (1 - IMPACT_CONFIG.noiseFloorCutoff));
        const exponentialImpact = Math.pow(gatedEnergy, IMPACT_CONFIG.exponentialPower);
        const baseImpact = exponentialImpact + Math.pow(group.transientSpike, 1.6);

        let instancePtr = 0;

        for (let r = 0; r < gridOffsets.length; r++) {
          const ref = gridOffsets[r];
          const ySign = ref.flipY ? -1 : 1;

          for (let j = 0; j < group.transforms.length; j++) {
            const t = group.transforms[j];

            const individualImpact = baseImpact * t.powerBias;
            const jitterPhaseVal = Math.sin(time * 18.0 + t.jitterPhase);
            const microJitter = jitterPhaseVal * (individualImpact * IMPACT_CONFIG.microJitterAmount);

            const outwardJolt = individualImpact * IMPACT_CONFIG.punchDistance;
            const verticalSnap = (group.transientSpike * 1.6 * t.powerBias + exponentialImpact * 0.7) * IMPACT_CONFIG.verticalSnap;
            const scaleVal = 1.0 + individualImpact * IMPACT_CONFIG.scalePunch;

            const posX = t.pos.x + t.outwardDir.x * outwardJolt + t.jitterOffset.x * microJitter;
            const posY = (t.pos.y + verticalSnap + t.jitterOffset.y * microJitter) * ySign;
            const posZ = t.pos.z + t.outwardDir.z * outwardJolt + t.jitterOffset.z * microJitter;

            dummy.position.set(posX, posY, posZ);

            const tiltAngle = individualImpact * IMPACT_CONFIG.tangentTiltMax;
            tiltQuat.setFromAxisAngle(t.tiltAxis, tiltAngle * ySign);
            dummy.quaternion.copy(t.rot).multiply(tiltQuat);

            dummy.scale.set(t.scale.x * scaleVal, t.scale.y * scaleVal * ySign, t.scale.z * scaleVal);
            dummy.updateMatrix();

            group.instancedMesh.setMatrixAt(instancePtr++, dummy.matrix);
          }
        }
        group.instancedMesh.instanceMatrix.needsUpdate = true;

        const targetColor = getThemeHarmonicColor(normalizedTier, time * 0.02);
        const surgeRatio = Math.min(1.0, Math.max(0.0, (baseImpact - 0.04) * 2.0));

        group.material.color.copy(colorRest).lerp(targetColor, surgeRatio * 0.85);
        group.material.emissive.copy(targetColor);
        group.material.emissiveIntensity = surgeRatio * (0.04 + baseImpact * 0.45);
      }

      renderer.render(scene, camera);
    },
    destroy: () => {
      renderer.dispose();
      stoneBumpMap.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      coronaGeo.dispose();
      coronaMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      binGroups.forEach((g) => {
        g.instancedMesh.geometry.dispose();
        g.material.dispose();
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}