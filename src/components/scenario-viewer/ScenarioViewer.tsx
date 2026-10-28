import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  importScenarioFromWorkbook,
  buildDemoScenarioWorkbook,
} from '../../services/excelScenarioImporter';
import {
  renderScenario,
  type ScenarioInput,
  type ScenarioRenderResult,
} from '../factory-builder/3d/shared/ScenarioRenderer';
import { ScaleLevel } from '../factory-builder/3d/shared/MultiScale';
import { applyOverrides } from '../factory-builder/3d/shared/Overrides';
import { listAvailableModelKeys } from '../factory-builder/3d/shared/ScenarioRenderer';
import { ScenarioAnimator } from '../factory-builder/3d/shared/ScenarioAnimator';
import { ProductFlowAnimator } from '../factory-builder/3d/shared/ProductFlowAnimator';
import { PickAndPlaceCoordinator } from '../factory-builder/3d/shared/PickAndPlaceCoordinator';
import { StationFlowAnimator, type FlowEdge } from '../factory-builder/3d/shared/StationFlowAnimator';
import { LiveHUD } from '../factory-builder/3d/shared/LiveHUD';
import { loadGLBFromFile } from '../factory-builder/3d/shared/GLBLoader';
import { applyCameraPreset } from '../factory-builder/3d/shared/CameraPresets';
import { ReachStudy, reachStats } from '../factory-builder/3d/shared/ReachStudy';
import { CycleTimeAnalyzer, type CycleSnapshot } from '../factory-builder/3d/shared/CycleTimeAnalyzer';
import { CameraBookmarks, type CameraBookmark } from '../factory-builder/3d/shared/CameraBookmarks';
import { useScenarioBridgeStore } from '../../stores/scenarioBridgeStore';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';

/**
 * ScenarioViewer — drag-and-drop Excel → 3D world.
 *
 * Single-page workflow:
 *   1. Click "Download starter template" to get a working .xlsx.
 *   2. Edit it (model keys, positions, colors, scale level) in Excel.
 *   3. Drag-drop or click "Upload" to load it. The 3D world rebuilds.
 *   4. Toggle scenario scale (factory / warehouse / supply-chain / mixed).
 *   5. Pick an entity in the right panel and tweak its color live.
 */
export function ScenarioViewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const scenarioRootRef = useRef<THREE.Group | null>(null);
  const renderResultRef = useRef<ScenarioRenderResult | null>(null);
  const animatorRef = useRef<ScenarioAnimator>(new ScenarioAnimator());
  const productFlowRef = useRef<ProductFlowAnimator>(new ProductFlowAnimator());
  const pickPlaceRef = useRef<PickAndPlaceCoordinator>(new PickAndPlaceCoordinator());
  const stationFlowRef = useRef<StationFlowAnimator>(new StationFlowAnimator());
  const liveHUDRef = useRef<LiveHUD>(new LiveHUD());
  const reachStudyRef = useRef<ReachStudy>(new ReachStudy());
  const cycleAnalyzerRef = useRef<CycleTimeAnalyzer>(new CycleTimeAnalyzer());
  const bookmarksRef = useRef<CameraBookmarks | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const [glbProps, setGlbProps] = useState<{ id: string; group: THREE.Group }[]>([]);

  const [scenario, setScenario] = useState<ScenarioInput | null>(null);
  const [scaleLevel, setScaleLevel] = useState<ScaleLevel>(ScaleLevel.DETAILED);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorDraft, setColorDraft] = useState<string>('#2266ff');
  const [opacityDraft, setOpacityDraft] = useState<number>(1);
  const [showHelp, setShowHelp] = useState(true);
  const [hudVisible, setHudVisible] = useState(true);
  const [reachStudyEntityId, setReachStudyEntityId] = useState<string | null>(null);
  const [reachStudyInfo, setReachStudyInfo] = useState<{ samples: number; maxRadius: number } | null>(null);
  const [cycleSnapshots, setCycleSnapshots] = useState<Record<string, CycleSnapshot>>({});
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>([]);

  const modelKeys = useRef(listAvailableModelKeys()).current;
  const consumeBridge = useScenarioBridgeStore(s => s.consume);

  // Consume an inbound scenario from the Factory Builder bridge, if any.
  useEffect(() => {
    const incoming = consumeBridge();
    if (incoming) {
      setScenario(incoming);
      setScaleLevel(incoming.scaleLevel ?? ScaleLevel.DETAILED);
      setSelectedId(incoming.entities[0]?.id ?? null);
      setShowHelp(false);
    }
    // Run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────
  // Three.js scene init
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1116);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
    camera.position.set(8, 6, 10);
    camera.lookAt(0, 0.5, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.5, 0);
    controlsRef.current = controls;

    // Initialize camera bookmarks (loads any persisted ones from localStorage).
    bookmarksRef.current = new CameraBookmarks(camera, controls);
    setBookmarks(bookmarksRef.current.list());

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(20, 30, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
    scene.add(sun);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x202730, roughness: 0.9, metalness: 0.0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(120, 60, 0x303744, 0x252a33);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    scene.add(grid);

    // Render loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;
      animatorRef.current.update(dt);
      productFlowRef.current.update(dt);
      stationFlowRef.current.update(dt);
      liveHUDRef.current.update();
      bookmarksRef.current?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      ro.disconnect();
      if (animationIdRef.current !== null) cancelAnimationFrame(animationIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // (Re)build scene whenever scenario or scale changes
  // ─────────────────────────────────────────────────────────
  const buildScene = useCallback((input: ScenarioInput, level: ScaleLevel) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old root
    if (scenarioRootRef.current) {
      scene.remove(scenarioRootRef.current);
      scenarioRootRef.current.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const m = mesh.material;
          if (Array.isArray(m)) m.forEach(mm => mm.dispose());
          else m?.dispose();
        }
      });
    }

    const augmented: ScenarioInput = { ...input, scaleLevel: level };
    const result = renderScenario(augmented);
    renderResultRef.current = result;
    scenarioRootRef.current = result.root;
    scene.add(result.root);
    setWarnings(result.warnings);

    // Attach pick-and-place loops to every rigged robot in the scene.
    animatorRef.current.attach(result);

    // Bridge to the live simulation: when replay/streaming events update
    // `stationStates`, robot animations switch (processing/blocked/failed/idle).
    animatorRef.current.setStateSource(() => useLiveSimulationStore.getState().stationStates);

    // Spawn products on every detected conveyor.
    productFlowRef.current.attach(result);

    // Bridge robots ↔ products: when a robot fires its 'close' tool action mid-program,
    // grab the nearest belt product and reparent onto the gripper. 'open' drops it.
    pickPlaceRef.current.attach(result, animatorRef.current, productFlowRef.current);

    // Cycle-time analyzer: tap each rigged robot's onWaypoint to record pick/place.
    cycleAnalyzerRef.current.reset();
    const animatorRobots = (animatorRef.current as unknown as { robots: Array<{
      entityId: string;
      driver: { opts?: { onWaypoint?: (idx: number, wp: { toolAction?: 'open' | 'close' | null }) => void } };
    }> }).robots;
    for (const r of animatorRobots) {
      const opts = r.driver.opts;
      if (!opts) continue;
      const prev = opts.onWaypoint;
      opts.onWaypoint = (idx, wp) => {
        cycleAnalyzerRef.current.recordWaypoint(r.entityId, idx, wp);
        prev?.(idx, wp);
      };
    }

    // Station-to-station flow: prefer real connections (from FB → 3DW bridge);
    // fall back to a synthesized chain across non-conveyor entities so demo
    // scenarios still animate.
    let flowEdges: FlowEdge[];
    if (augmented.connections && augmented.connections.length > 0) {
      flowEdges = augmented.connections.map((c) => ({
        id: `${c.source}->${c.target}`,
        source: c.source,
        target: c.target,
        rate: 0.5,
        speed: 1.0,
      }));
    } else {
      const stationLikeIds = augmented.entities
        .filter(e => !/conveyor|belt|shell|pallet/i.test(e.modelKey))
        .map(e => e.id);
      flowEdges = [];
      for (let i = 0; i < stationLikeIds.length - 1; i++) {
        flowEdges.push({
          id: `${stationLikeIds[i]}->${stationLikeIds[i + 1]}`,
          source: stationLikeIds[i],
          target: stationLikeIds[i + 1],
          rate: 0.5,
          speed: 1.0,
        });
      }
    }
    stationFlowRef.current.attach(result, flowEdges);

    // Live HUD per entity — pulls state + utilization from liveSimulationStore.
    liveHUDRef.current.attach(result, (entityId) => {
      const live = useLiveSimulationStore.getState();
      const state = live.stationStates[entityId] ?? 'idle';
      const utilization = live.stationUtilizations[entityId] ?? (state === 'processing' ? 0.85 : 0);
      return { state, utilization, label: entityId };
    });
    liveHUDRef.current.setVisible(hudVisible);

    // Apply scenario-aware camera preset (factory cell, warehouse, supply-chain aerial).
    if (cameraRef.current && controlsRef.current) {
      applyCameraPreset(cameraRef.current, controlsRef.current, augmented.type, result.root);
    }

    // Visible feedback: if anything went wrong (unknown model keys, empty scene), surface it.
    const messages: string[] = [...result.warnings];
    if (input.entities.length === 0) {
      messages.push('Scenario has 0 entities — nothing to render.');
    } else if (result.entityById.size === 0) {
      messages.push(`All ${input.entities.length} entities failed to resolve. Check model keys.`);
    } else if (result.entityById.size < input.entities.length) {
      messages.push(`${input.entities.length - result.entityById.size} of ${input.entities.length} entities skipped.`);
    }
    setWarnings(messages);
  }, []);

  useEffect(() => {
    if (scenario) buildScene(scenario, scaleLevel);
  }, [scenario, scaleLevel, buildScene]);

  // ─────────────────────────────────────────────────────────
  // Upload / download handlers
  // ─────────────────────────────────────────────────────────
  const onFileChosen = useCallback(async (file: File) => {
    setShowHelp(false);
    const buf = await file.arrayBuffer();
    try {
      const parsed = importScenarioFromWorkbook(buf);
      setScenario(parsed);
      setScaleLevel(parsed.scaleLevel ?? ScaleLevel.DETAILED);
      setSelectedId(parsed.entities[0]?.id ?? null);
    } catch (e) {
      setWarnings([`Failed to parse workbook: ${(e as Error).message}`]);
    }
  }, []);

  const onUploadClick = () => fileInputRef.current?.click();
  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileChosen(f);
    e.target.value = '';   // allow re-upload of same file
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && /\.xlsx?$/i.test(f.name)) onFileChosen(f);
  };

  const onDownloadTemplate = () => {
    const buf = buildDemoScenarioWorkbook();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'factorysim-scenario-template.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onUploadGLB = () => glbInputRef.current?.click();
  const onGLBInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { group, appliedScale, sourceSize } = await loadGLBFromFile(file, { targetSize: 1.5 });
      const id = `glb-${Date.now()}`;
      group.name = `glb:${id}`;
      // Drop new props near the camera target / scene origin, slightly offset.
      const offsetX = (glbProps.length % 4) * 1.8 - 2.7;
      const offsetZ = Math.floor(glbProps.length / 4) * 1.8 + 1.8;
      group.position.set(offsetX, 0, offsetZ);
      sceneRef.current?.add(group);
      setGlbProps([...glbProps, { id, group }]);
      setWarnings([
        `Loaded "${file.name}": original size ${sourceSize.x.toFixed(2)}×${sourceSize.y.toFixed(2)}×${sourceSize.z.toFixed(2)}, scaled ×${appliedScale.toFixed(3)}`,
      ]);
    } catch (err) {
      setWarnings([`GLB load failed: ${(err as Error).message}`]);
    }
  };

  const SAVE_KEY = 'factorysim:scenario-viewer:saved';
  const onSaveScene = () => {
    if (!scenario) return;
    try {
      // Persist a JSON snapshot of the scenario plus current scale level.
      const snap = { savedAt: new Date().toISOString(), scenario, scaleLevel };
      localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
      setWarnings([`Saved ${scenario.entities.length} entities to local storage.`]);
    } catch (e) {
      setWarnings([`Save failed: ${(e as Error).message}`]);
    }
  };
  const onLoadSavedScene = () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        setWarnings(['No saved scene found.']);
        return;
      }
      const snap = JSON.parse(raw) as { scenario: ScenarioInput; scaleLevel?: ScaleLevel };
      setScenario(snap.scenario);
      setScaleLevel(snap.scaleLevel ?? ScaleLevel.DETAILED);
      setSelectedId(snap.scenario.entities[0]?.id ?? null);
      setShowHelp(false);
      setWarnings([]);
    } catch (e) {
      setWarnings([`Load failed: ${(e as Error).message}`]);
    }
  };

  // ─────────────────────────────────────────────────────────
  // Reach study + cycle time + bookmarks handlers
  // ─────────────────────────────────────────────────────────
  const onShowReach = (entityId: string) => {
    const result = renderResultRef.current;
    const scene = sceneRef.current;
    if (!result || !scene) return;
    const wrapper = result.entityById.get(entityId);
    if (!wrapper) return;
    const detailed = wrapper.userData.multiScale?.levels?.detailed as THREE.Group | undefined;
    if (!detailed) return;
    const fkChain = detailed.userData.fkChain;
    if (!fkChain) {
      setWarnings([`Entity "${entityId}" is not a rigged robot.`]);
      return;
    }
    const cloud = reachStudyRef.current.build(fkChain, { samples: 4000 });
    scene.add(cloud);
    const stats = reachStats(fkChain, 1000);
    setReachStudyEntityId(entityId);
    setReachStudyInfo({ samples: 4000, maxRadius: stats.maxRadius });
  };
  const onClearReach = () => {
    reachStudyRef.current.dispose();
    setReachStudyEntityId(null);
    setReachStudyInfo(null);
  };

  const onRefreshCycles = () => {
    setCycleSnapshots(cycleAnalyzerRef.current.snapshotAll());
  };

  const onCaptureBookmark = () => {
    const label = `View ${bookmarks.length + 1}`;
    bookmarksRef.current?.capture(label);
    setBookmarks(bookmarksRef.current?.list() ?? []);
  };
  const onFlyToBookmark = (id: string) => {
    bookmarksRef.current?.flyTo(id, 1.0);
  };
  const onRemoveBookmark = (id: string) => {
    bookmarksRef.current?.remove(id);
    setBookmarks(bookmarksRef.current?.list() ?? []);
  };

  const onLoadDemo = () => {
    const buf = buildDemoScenarioWorkbook();
    const parsed = importScenarioFromWorkbook(buf);
    setScenario(parsed);
    setScaleLevel(parsed.scaleLevel ?? ScaleLevel.DETAILED);
    setSelectedId(parsed.entities[0]?.id ?? null);
    setShowHelp(false);
  };

  // ─────────────────────────────────────────────────────────
  // Live entity editing
  // ─────────────────────────────────────────────────────────
  const selectedEntity = scenario?.entities.find(e => e.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedEntity) {
      const c = selectedEntity.overrides?.color;
      setColorDraft(typeof c === 'string' ? c : (c !== undefined ? '#' + c.toString(16).padStart(6, '0') : '#888888'));
      setOpacityDraft(selectedEntity.overrides?.opacity ?? 1);
    }
  }, [selectedId]);

  const applyLiveColor = (color: string) => {
    setColorDraft(color);
    const result = renderResultRef.current;
    if (!result || !selectedEntity) return;
    const wrapper = result.entityById.get(selectedEntity.id);
    if (!wrapper) return;
    const visible = wrapper.userData.multiScale.levels.detailed.visible
      ? wrapper.userData.multiScale.levels.detailed
      : wrapper.userData.multiScale.levels.abstract.visible
        ? wrapper.userData.multiScale.levels.abstract
        : wrapper.userData.multiScale.levels.building;
    applyOverrides(visible, { color });
  };

  const applyModelSwap = (newModelKey: string) => {
    if (!scenario || !selectedEntity) return;
    const updated: ScenarioInput = {
      ...scenario,
      entities: scenario.entities.map(e =>
        e.id === selectedEntity.id ? { ...e, modelKey: newModelKey } : e,
      ),
    };
    setScenario(updated);
    // buildScene will rebuild on the next effect tick because scenario changed.
  };

  const applyLiveOpacity = (opacity: number) => {
    setOpacityDraft(opacity);
    const result = renderResultRef.current;
    if (!result || !selectedEntity) return;
    const wrapper = result.entityById.get(selectedEntity.id);
    if (!wrapper) return;
    const visible = wrapper.userData.multiScale.levels.detailed.visible
      ? wrapper.userData.multiScale.levels.detailed
      : wrapper.userData.multiScale.levels.abstract.visible
        ? wrapper.userData.multiScale.levels.abstract
        : wrapper.userData.multiScale.levels.building;
    applyOverrides(visible, { opacity });
  };

  // ─────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, color: '#cfd5de', fontFamily: 'system-ui, sans-serif' }}>
      {/* LEFT: 3D canvas */}
      <div
        ref={mountRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{ flex: 1, position: 'relative', minWidth: 0, background: '#0e1116' }}
      >
        {showHelp && !scenario && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              background: 'rgba(20,24,30,0.85)', padding: 24, borderRadius: 12,
              border: '1px dashed rgba(255,255,255,0.18)', maxWidth: 460, textAlign: 'center',
              pointerEvents: 'auto',
            }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Drop an Excel file here</div>
              <div style={{ fontSize: 13, color: '#9aa3af', marginBottom: 14 }}>
                or use the buttons on the right. The file should have a <b>Scenario</b> sheet
                and a <b>Layout</b> sheet — download the starter template if you don&apos;t have one yet.
              </div>
              <button
                onClick={onLoadDemo}
                style={{
                  background: '#2870c8', color: '#fff', border: 0, padding: '9px 18px',
                  borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}
              >
                Load demo scenario
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: control panel */}
      <div style={{
        width: 340, background: '#161b22', borderLeft: '1px solid #2a3038',
        padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Scenario Viewer</div>
          <div style={{ fontSize: 11, color: '#7a838f', marginTop: 2 }}>
            Excel-driven 3D world for factories, warehouses, and supply chains
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileInput}
          style={{ display: 'none' }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onUploadClick} style={btnPrimary}>Upload Excel</button>
          <button onClick={onDownloadTemplate} style={btnSecondary}>Download template</button>
        </div>
        <button onClick={onLoadDemo} style={{ ...btnSecondary, width: '100%' }}>Load demo</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onSaveScene} style={btnSecondary} disabled={!scenario}>Save scene</button>
          <button onClick={onLoadSavedScene} style={btnSecondary}>Restore</button>
        </div>
        <button onClick={onUploadGLB} style={{ ...btnSecondary, width: '100%' }}>+ Upload 3D model (.glb)</button>
        <input
          ref={glbInputRef}
          type="file"
          accept=".glb,.gltf"
          onChange={onGLBInput}
          style={{ display: 'none' }}
        />

        {/* Scenario meta */}
        {scenario && (
          <div style={panel}>
            <div style={panelHeader}>Scenario</div>
            <div style={{ fontSize: 12 }}>
              <div>Type: <b>{scenario.type}</b></div>
              <div>Entities: <b>{scenario.entities.length}</b></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#7a838f', marginBottom: 4 }}>Scale level</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[ScaleLevel.DETAILED, ScaleLevel.ABSTRACT, ScaleLevel.BUILDING].map(level => (
                  <button
                    key={level}
                    onClick={() => setScaleLevel(level)}
                    style={{
                      ...btnPill,
                      background: scaleLevel === level ? '#2870c8' : '#1f242c',
                      color: scaleLevel === level ? '#fff' : '#9aa3af',
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={hudVisible}
                  onChange={(e) => {
                    setHudVisible(e.target.checked);
                    liveHUDRef.current.setVisible(e.target.checked);
                  }}
                />
                Show live HUD overlays
              </label>
            </div>
          </div>
        )}

        {/* Entity inspector */}
        {scenario && scenario.entities.length > 0 && (
          <div style={panel}>
            <div style={panelHeader}>Entities</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {scenario.entities.map(e => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  style={{
                    background: selectedId === e.id ? '#2870c8' : '#1f242c',
                    color: selectedId === e.id ? '#fff' : '#cfd5de',
                    border: 0, padding: '6px 10px', textAlign: 'left',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span>{e.id}</span>
                  <span style={{ fontSize: 10, opacity: 0.65 }}>{e.modelKey}</span>
                </button>
              ))}
            </div>

            {selectedEntity && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2a3038' }}>
                <div style={{ fontSize: 11, color: '#7a838f', marginBottom: 4 }}>3D Model</div>
                <select
                  value={selectedEntity.modelKey}
                  onChange={(e) => applyModelSwap(e.target.value)}
                  style={{
                    width: '100%', background: '#1f242c', color: '#cfd5de',
                    border: '1px solid #2a3038', padding: '4px 6px', borderRadius: 4,
                    fontSize: 11, marginBottom: 10,
                  }}
                >
                  {Object.entries(modelKeys.reduce((acc, m) => {
                    (acc[m.category] ||= []).push(m);
                    return acc;
                  }, {} as Record<string, typeof modelKeys>)).map(([cat, list]) => (
                    <optgroup key={cat} label={cat}>
                      {list.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: '#7a838f', marginBottom: 4 }}>Color</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={colorDraft}
                    onChange={(e) => applyLiveColor(e.target.value)}
                    style={{ width: 40, height: 28, border: 0, padding: 0, background: 'transparent' }}
                  />
                  <code style={{ fontSize: 11, color: '#9aa3af' }}>{colorDraft}</code>
                </div>
                <div style={{ fontSize: 11, color: '#7a838f', marginTop: 10, marginBottom: 4 }}>
                  Opacity: {opacityDraft.toFixed(2)}
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={opacityDraft}
                  onChange={(e) => applyLiveOpacity(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>
        )}

        {/* Reach study */}
        {scenario && (
          <div style={panel}>
            <div style={panelHeader}>Reach Study</div>
            <div style={{ fontSize: 11, color: '#7a838f', marginBottom: 6 }}>
              Render the reachable workspace of any rigged robot in the scene.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {scenario.entities
                .filter(e => /cobot|industrial|palletizer|pick-and-place|scara|robot/i.test(e.modelKey))
                .map(e => (
                  <button
                    key={e.id}
                    onClick={() => onShowReach(e.id)}
                    style={{
                      ...btnSecondary,
                      background: reachStudyEntityId === e.id ? '#0e3a5c' : '#1f242c',
                    }}
                  >
                    {reachStudyEntityId === e.id ? '⦿ ' : ''}{e.id}
                  </button>
                ))}
              {reachStudyEntityId && (
                <button onClick={onClearReach} style={{ ...btnPill, background: '#3a1f1f', color: '#ffaaaa' }}>
                  Clear reach study
                </button>
              )}
              {reachStudyInfo && (
                <div style={{ fontSize: 11, color: '#9aa3af', marginTop: 4 }}>
                  {reachStudyInfo.samples} samples · max radius {reachStudyInfo.maxRadius.toFixed(2)} m
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cycle time analyzer */}
        {scenario && (
          <div style={panel}>
            <div style={{ ...panelHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Cycle Times</span>
              <button onClick={onRefreshCycles} style={{ ...btnPill, background: '#1f242c', color: '#cfd5de' }}>↻</button>
            </div>
            {Object.keys(cycleSnapshots).length === 0 ? (
              <div style={{ fontSize: 11, color: '#7a838f' }}>
                No cycles yet. Click ↻ after the robots have run for a few seconds.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(cycleSnapshots).map(([id, snap]) => (
                  <div key={id} style={{ fontSize: 11, color: '#cfd5de' }}>
                    <div style={{ fontWeight: 600 }}>{id}</div>
                    <div style={{ color: '#9aa3af' }}>
                      mean {snap.mean.toFixed(2)} s · {snap.itemsPerMinute.toFixed(1)} ipm
                    </div>
                    <div style={{ color: '#5f6772', fontSize: 10 }}>
                      n={snap.count} · min {snap.min.toFixed(2)} s · max {snap.max.toFixed(2)} s
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Camera bookmarks */}
        {scenario && (
          <div style={panel}>
            <div style={{ ...panelHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Camera Bookmarks</span>
              <button onClick={onCaptureBookmark} style={{ ...btnPill, background: '#2870c8', color: '#fff' }}>+ Save view</button>
            </div>
            {bookmarks.length === 0 ? (
              <div style={{ fontSize: 11, color: '#7a838f' }}>
                Pan, zoom, then click &ldquo;Save view&rdquo; to bookmark this angle. Bookmarks persist across reloads.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {bookmarks.map(bm => (
                  <div key={bm.id} style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => onFlyToBookmark(bm.id)} style={{ ...btnSecondary, flex: 1 }}>
                      {bm.label}
                    </button>
                    <button
                      onClick={() => onRemoveBookmark(bm.id)}
                      style={{ ...btnPill, background: '#3a1f1f', color: '#ffaaaa' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div style={{ ...panel, borderColor: '#7c4a1a', background: '#2c1d0e' }}>
            <div style={{ ...panelHeader, color: '#e6a85a' }}>Warnings</div>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#e6a85a' }}>{w}</div>
            ))}
          </div>
        )}

        {/* Available models hint */}
        <div style={panel}>
          <div style={panelHeader}>Available model keys ({modelKeys.length})</div>
          <div style={{ fontSize: 11, color: '#9aa3af', maxHeight: 120, overflowY: 'auto', lineHeight: 1.5 }}>
            {modelKeys.slice(0, 20).map(m => (
              <div key={m.id}><code>{m.id}</code> — {m.name}</div>
            ))}
            <div style={{ marginTop: 4, color: '#5f6772' }}>… and {modelKeys.length - 20} more</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline styles ─────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
  flex: 1, background: '#2870c8', color: '#fff', border: 0,
  padding: '9px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
};
const btnSecondary: React.CSSProperties = {
  flex: 1, background: '#1f242c', color: '#cfd5de', border: '1px solid #2a3038',
  padding: '9px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const btnPill: React.CSSProperties = {
  border: 0, padding: '5px 10px', borderRadius: 12, cursor: 'pointer', fontSize: 11,
  textTransform: 'capitalize',
};
const panel: React.CSSProperties = {
  background: '#1a1f26', border: '1px solid #2a3038', borderRadius: 8, padding: 12,
};
const panelHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#cfd5de', textTransform: 'uppercase',
  letterSpacing: 0.5, marginBottom: 8,
};
