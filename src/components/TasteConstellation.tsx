"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { graphColor, type GraphData, type GraphNode } from "@/lib/taste-graph";
import { ConstellationFallback } from "./ConstellationFallback";
import { Icon } from "./Icon";

interface SceneController {
  update: (data: GraphData) => void;
  highlight: (id: string | null) => void;
  setPaused: (paused: boolean) => void;
  zoom: (factor: number) => void;
  reset: () => void;
}

function positionsFor(nodes: GraphNode[]): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>([["center", new THREE.Vector3()]]);
  for (const ring of [0, 1, 2] as const) {
    const members = nodes.filter((node) => node.id !== "center" && node.ring === ring);
    members.forEach((node, index) => {
      const angle = (index / Math.max(members.length, 1)) * Math.PI * 2 + (ring === 0 ? 0.45 : ring * 0.8);
      const radius = ring === 0 ? 1.38 : ring === 1 ? 2.4 : 3.05;
      positions.set(node.id, new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.78,
        Math.sin(angle * 2 + ring) * radius * 0.45,
      ));
    });
  }
  return positions;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else mesh.material?.dispose();
  });
  group.clear();
}

export default function TasteConstellation({ data, selectedId = null, onSelect, hero = false, onUnavailable }: {
  data: GraphData;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  hero?: boolean;
  onUnavailable?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneController | null>(null);
  const callbacks = useRef({ onSelect, onUnavailable });
  const [paused, setPaused] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { callbacks.current = { onSelect, onUnavailable }; }, [onSelect, onUnavailable]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      queueMicrotask(() => { setUnavailable(true); callbacks.current.onUnavailable?.(); });
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x050505, 0);
    host.prepend(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", hero ? "Interactive illustration of connected cultural tastes" : "3D taste map. Use arrow keys to rotate, plus and minus to zoom, Home to reset.");
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 60);
    camera.position.set(0, 0.5, hero ? 8.6 : 10);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false; // Page scrolling stays a page scroll. Explicit zoom controls below.
    controls.autoRotateSpeed = 0.35;
    controls.minDistance = 5.5;
    controls.maxDistance = 16;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stopped = motion.matches;
    let inView = true;
    let disposed = false;
    let previousTime = 0;
    let positions = new Map<string, THREE.Vector3>();
    let meshNodes: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
    let edges: GraphData["edges"] = [];
    const network = new THREE.Group();
    const globe = new THREE.Group();
    scene.add(globe, network);

    // Fine, interrupted meridians make the globe read like a three-dimensional fingerprint.
    const particles: number[] = [];
    const colors: number[] = [];
    for (let strand = 0; strand < 30; strand++) {
      const longitude = (strand / 30) * Math.PI * 2;
      for (let i = 0; i < 170; i++) {
        if ((i + strand * 7) % 71 < 5) continue;
        const latitude = -Math.PI / 2 + (i / 170) * Math.PI;
        const wobble = Math.sin(latitude * 5 + longitude * 3) * 0.045;
        const radius = 2.63 + wobble;
        const x = radius * Math.cos(latitude) * Math.cos(longitude);
        const y = radius * Math.sin(latitude);
        const z = radius * Math.cos(latitude) * Math.sin(longitude);
        particles.push(x, y, z);
        const brightness = 0.32 + 0.4 * ((z / radius + 1) / 2);
        const color = new THREE.Color("#cdbd9d").multiplyScalar(brightness);
        colors.push(color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(particles, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: hero ? 0.014 : 0.012, vertexColors: true, transparent: true, opacity: hero ? 0.8 : 0.32, depthWrite: false }));
    globe.add(points);
    globe.rotation.z = -0.36;

    const projection = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const render = () => {
      if (disposed) return;
      renderer.render(scene, camera);
      const width = host.clientWidth;
      const height = host.clientHeight;
      labelsRef.current?.querySelectorAll<HTMLElement>("[data-node]").forEach((label) => {
        const position = positions.get(label.dataset.node ?? "");
        if (!position) return;
        projection.copy(position).project(camera);
        const x = (projection.x * 0.5 + 0.5) * width;
        const y = (-projection.y * 0.5 + 0.5) * height;
        const visible = projection.z < 1 && x > 18 && x < width - 18 && y > 18 && y < height - 18;
        label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        label.style.visibility = visible ? "visible" : "hidden";
        label.style.opacity = position.clone().sub(camera.position).length() > camera.position.length() + 1.2 ? "0.48" : "1";
      });
    };
    const tick = (time: number) => {
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
      previousTime = time;
      controls.update(delta);
      render();
    };
    const schedule = () => {
      controls.autoRotate = !stopped && !motion.matches;
      renderer.setAnimationLoop(inView && !document.hidden && controls.autoRotate ? tick : null);
      previousTime = 0;
      render();
    };
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; schedule(); }, { rootMargin: "80px" });
    observer.observe(host);
    const motionChange = () => { stopped = motion.matches; setPaused(stopped); schedule(); };
    motion.addEventListener("change", motionChange);
    document.addEventListener("visibilitychange", schedule);
    controls.addEventListener("change", render);

    const zoom = (factor: number) => {
      camera.position.multiplyScalar(factor).clampLength(controls.minDistance, controls.maxDistance);
      controls.update();
      render();
    };
    const reset = () => { camera.position.set(0, 0.5, hero ? 8.6 : 10); controls.target.set(0, 0, 0); controls.update(); render(); };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const spherical = new THREE.Spherical().setFromVector3(camera.position);
        if (event.key === "ArrowLeft") spherical.theta -= 0.14;
        if (event.key === "ArrowRight") spherical.theta += 0.14;
        if (event.key === "ArrowUp") spherical.phi = Math.max(0.15, spherical.phi - 0.14);
        if (event.key === "ArrowDown") spherical.phi = Math.min(Math.PI - 0.15, spherical.phi + 0.14);
        camera.position.setFromSpherical(spherical);
        controls.update();
        render();
      } else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(0.9); }
      else if (event.key === "-") { event.preventDefault(); zoom(1.1); }
      else if (event.key === "Home") { event.preventDefault(); reset(); }
    };
    const down = new THREE.Vector2();
    const onDown = (event: PointerEvent) => { down.set(event.clientX, event.clientY); };
    const onUp = (event: PointerEvent) => {
      if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 6) return;
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshNodes)[0];
      if (hit?.object.userData.nodeId) callbacks.current.onSelect?.(hit.object.userData.nodeId as string);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      renderer.setAnimationLoop(null);
      setUnavailable(true);
      callbacks.current.onUnavailable?.();
    };
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("webglcontextlost", contextLost);

    sceneRef.current = {
      update(next) {
        disposeGroup(network);
        positions = positionsFor(next.nodes);
        edges = next.edges;
        meshNodes = [];
        for (const node of next.nodes) {
          const position = positions.get(node.id)!;
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(node.id === "center" ? 0.12 : node.ring === 0 ? 0.068 : 0.05, 14, 10),
            new THREE.MeshBasicMaterial({ color: graphColor(node), transparent: true, opacity: 1 }),
          );
          sphere.position.copy(position);
          sphere.userData.nodeId = node.id;
          network.add(sphere);
          meshNodes.push(sphere);
          const halo = new THREE.Mesh(new THREE.SphereGeometry(node.id === "center" ? 0.2 : 0.105, 12, 8), new THREE.MeshBasicMaterial({ color: graphColor(node), transparent: true, opacity: 0.07, depthWrite: false }));
          halo.position.copy(position);
          network.add(halo);
        }
        for (const edge of edges) {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) continue;
          const midpoint = from.clone().add(to).multiplyScalar(0.5);
          midpoint.z += 0.28;
          const curve = new THREE.QuadraticBezierCurve3(from, midpoint, to);
          const lineGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
          const color = edge.hops === 2 ? "#80b8ac" : edge.kind === "interest" ? "#dbc6a0" : "#aaa0e5";
          const material = edge.hops === 2 || edge.kind === "profile"
            ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.35, dashSize: 0.055, gapSize: 0.045 })
            : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.33 });
          const line = new THREE.Line(lineGeometry, material);
          line.computeLineDistances();
          line.userData.edge = edge;
          network.add(line);
        }
        render();
      },
      highlight(id) {
        const neighbors = new Set(edges.filter((edge) => edge.from === id || edge.to === id).flatMap((edge) => [edge.from, edge.to]));
        for (const mesh of meshNodes) {
          mesh.material.opacity = !id || mesh.userData.nodeId === id || neighbors.has(mesh.userData.nodeId) ? 1 : 0.24;
          mesh.scale.setScalar(mesh.userData.nodeId === id ? 1.5 : 1);
        }
        network.children.forEach((object) => {
          if (!(object instanceof THREE.Line)) return;
          const edge = object.userData.edge as GraphData["edges"][number];
          (object.material as THREE.LineBasicMaterial).opacity = !id ? 0.33 : edge.from === id || edge.to === id ? 0.85 : 0.08;
        });
        render();
      },
      setPaused(value) { stopped = value; schedule(); },
      zoom,
      reset,
    };
    resize();
    schedule();
    queueMicrotask(() => { if (!disposed) { setReady(true); setPaused(motion.matches); } });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      motion.removeEventListener("change", motionChange);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("webglcontextlost", contextLost);
      controls.dispose();
      disposeGroup(network);
      disposeGroup(globe);
      renderer.dispose();
      canvas.remove();
      sceneRef.current = null;
    };
  }, [hero]);

  useEffect(() => { sceneRef.current?.update(data); sceneRef.current?.highlight(selectedId); }, [data, selectedId]);
  useEffect(() => { sceneRef.current?.setPaused(paused); }, [paused]);

  const labelNodes = data.nodes.filter((node, index) => hero ? node.id !== "center" : node.ring === 0 || index < 15 || node.id === selectedId);

  return <div className={`constellation ${hero ? "constellation-hero" : ""}`} data-ready={ready && !unavailable}>
    {(!ready || unavailable) && <ConstellationFallback />}
    <div ref={hostRef} className="constellation-canvas" />
    {!unavailable && <div ref={labelsRef} className="constellation-labels" aria-label="Taste map nodes">
      {labelNodes.map((node) => hero ? <span key={node.id} data-node={node.id} className={`constellation-label hero-node node-ring-${node.ring}`}><span className="node-dot" style={{ background: graphColor(node) }} />{node.label}</span> :
        <button key={node.id} type="button" data-node={node.id} className={`constellation-label node-ring-${node.ring} ${selectedId === node.id ? "is-selected" : ""} ${node.id === "center" ? "center-node" : ""}`} aria-pressed={selectedId === node.id} onClick={() => onSelect?.(node.id)}>{node.label}</button>)}
    </div>}
    {ready && !unavailable && <div className="constellation-toolbar">
      <span>{hero ? "A world of unexpected connections" : "Drag to explore"}</span>
      <div className="graph-buttons">
        <button className="icon-button" type="button" aria-label={paused ? "Resume graph rotation" : "Pause graph rotation"} onClick={() => setPaused((value) => !value)}><Icon name={paused ? "play" : "pause"} size={14} /></button>
        {!hero && <>
          <button className="icon-button" type="button" aria-label="Zoom in" onClick={() => sceneRef.current?.zoom(0.86)}><Icon name="plus" size={15} /></button>
          <button className="icon-button" type="button" aria-label="Zoom out" onClick={() => sceneRef.current?.zoom(1.16)}><span aria-hidden="true">−</span></button>
          <button className="icon-button" type="button" aria-label="Reset graph view" onClick={() => sceneRef.current?.reset()}><Icon name="refresh" size={14} /></button>
        </>}
      </div>
    </div>}
  </div>;
}
