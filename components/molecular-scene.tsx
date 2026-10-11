"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RotateCcw } from "lucide-react";
import { Molecule } from "@/components/lab/molecule";

type Geometry = {
  smiles: string;
  geometry: "illustrative-conformer" | "2d-layout";
  atoms: { element: string; position: [number, number, number] }[];
  bonds: { start: number; end: number; order: number }[];
};

export type SceneInfo = {
  smiles: string;
  geometry: Geometry["geometry"];
  atoms: number;
  elements: Record<string, number>;
};

/** CPK-derived palette, matched to the RDKit 2D drawings (O red, N blue, S yellow, halogens green). */
export const ELEMENT_COLORS: Record<string, string> = {
  C: "#b8bfcc",
  N: "#6f8bff",
  O: "#e2635c",
  F: "#7bd88f",
  Cl: "#7bd88f",
  Br: "#b0614f",
  I: "#8a62c4",
  S: "#e8bb52",
  P: "#ee9a52",
};

const cache = new Map<string, Geometry>();
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

export function MolecularScene({
  smiles,
  running,
  onInfo,
}: {
  smiles: string;
  running: boolean;
  onInfo?: (info: SceneInfo | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    load: (g: Geometry) => void;
    reset: () => void;
    setRunning: (r: boolean) => void;
  } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "no-webgl">("loading");
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;

  useEffect(() => {
    api.current?.setRunning(running);
  }, [running]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      setState("no-webgl");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const home = new THREE.Vector3(0, 0, 20);
    camera.position.copy(home);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = new RoomEnvironment();
    const envTarget = pmrem.fromScene(environment, 0.04);
    scene.environment = envTarget.texture;
    environment.dispose();
    scene.add(new THREE.AmbientLight(0xd5ddff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-6, 8, 8);
    const rim = new THREE.DirectionalLight(0x5b6cff, 5);
    rim.position.set(8, 3, -4);
    const fill = new THREE.DirectionalLight(0x8fa0ff, 1.4);
    fill.position.set(-5, -4, 4);
    scene.add(key, rim, fill);

    // tilt (pointer parallax) → spin (entrance) → model
    const tilt = new THREE.Group();
    const spin = new THREE.Group();
    tilt.add(spin);
    scene.add(tilt);
    let model: THREE.Group | null = null;
    let radius = 4;

    const controls = new OrbitControls(camera, renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.55;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isRunning = running;
    let dirty = true;
    let resetting = false;
    let entrance = 1; // 0 → 1 progress of model entrance
    let entranceStart = 0;
    const pointer = { x: 0, y: 0 };
    controls.addEventListener("change", () => (dirty = true));
    controls.addEventListener("start", () => (resetting = false));

    const fit = () => {
      const w = element.clientWidth || 1;
      const h = element.clientHeight || 1;
      const visibleH = 2 * home.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visibleW = visibleH * (w / h);
      // Molecule bounding diameter fills ~92% of the smaller visible dimension (projected extent is smaller).
      const s = (0.46 * Math.min(visibleH, visibleW)) / radius;
      spin.scale.setScalar(s);
    };

    const disposeModel = (group: THREE.Group) => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    };

    const load = (data: Geometry) => {
      const positions = data.atoms.map((a) => new THREE.Vector3(...a.position));
      const center = positions.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(positions.length || 1);
      positions.forEach((p) => p.sub(center));
      radius = Math.max(1.2, ...positions.map((p) => p.length())) + 0.75;
      const group = new THREE.Group();
      const sphere = new THREE.SphereGeometry(1, 48, 32);
      data.atoms.forEach((atom, i) => {
        const mesh = new THREE.Mesh(
          sphere.clone(),
          new THREE.MeshPhysicalMaterial({
            color: ELEMENT_COLORS[atom.element] || "#aab3c5",
            metalness: atom.element === "C" ? 0.85 : 0.35,
            roughness: atom.element === "C" ? 0.2 : 0.28,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
            envMapIntensity: 1.2,
          }),
        );
        mesh.scale.setScalar(atom.element === "C" ? 0.6 : 0.66);
        mesh.position.copy(positions[i]);
        group.add(mesh);
      });
      sphere.dispose();
      const up = new THREE.Vector3(0, 1, 0);
      data.bonds.forEach((bond) => {
        const a = positions[bond.start];
        const b = positions[bond.end];
        const delta = new THREE.Vector3().subVectors(b, a);
        const length = delta.length();
        const dir = delta.clone().normalize();
        // Double/triple bonds drawn as parallel rods offset perpendicular to the bond.
        const count = bond.order >= 2.5 ? 3 : bond.order >= 1.75 ? 2 : 1;
        const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : up).normalize();
        for (let k = 0; k < count; k++) {
          const offset = (k - (count - 1) / 2) * 0.22;
          const rod = new THREE.Mesh(
            new THREE.CylinderGeometry(count > 1 ? 0.08 : 0.13, count > 1 ? 0.08 : 0.13, length, 16),
            new THREE.MeshPhysicalMaterial({ color: "#8d96b3", metalness: 0.8, roughness: 0.25, clearcoat: 1 }),
          );
          rod.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(side, offset);
          rod.quaternion.setFromUnitVectors(up, dir);
          group.add(rod);
        }
      });
      if (model) {
        spin.remove(model);
        disposeModel(model);
      }
      model = group;
      group.rotation.set(0.2, -0.35, -0.2);
      spin.add(group);
      fit();
      entrance = reduce.matches ? 1 : 0;
      entranceStart = performance.now();
      dirty = true;
      start();
    };

    const reset = () => {
      resetting = true;
      dirty = true;
      if (reduce.matches) {
        camera.position.copy(home);
        controls.update();
        resetting = false;
      }
      start();
    };

    let frame = 0;
    let looping = false;
    let onscreen = true;
    const shouldLoop = () => onscreen && !document.hidden;
    const tick = (now: number) => {
      if (!shouldLoop()) {
        looping = false;
        return;
      }
      frame = requestAnimationFrame(tick);
      const still = reduce.matches;
      controls.autoRotate = !still && !resetting;
      controls.autoRotateSpeed = isRunning ? 1.5 : 0.55;
      if (resetting) {
        camera.position.lerp(home, 0.12);
        if (camera.position.distanceTo(home) < 0.01) {
          camera.position.copy(home);
          resetting = false;
        }
        dirty = true;
      }
      controls.update();
      if (!still) {
        // Pointer parallax with inertia.
        tilt.rotation.y += (pointer.x * 0.22 - tilt.rotation.y) * 0.06;
        tilt.rotation.x += (pointer.y * 0.16 - tilt.rotation.x) * 0.06;
        tilt.position.y = Math.sin(now / 1400) * 0.12;
        if (entrance < 1) {
          entrance = Math.min(1, (now - entranceStart) / 900);
          const e = ease(entrance);
          spin.rotation.y = (1 - e) * -0.9;
          tilt.scale.setScalar(0.86 + 0.14 * e);
        }
        dirty = true;
      }
      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
    };
    const start = () => {
      if (looping || !shouldLoop()) return;
      looping = true;
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      if (onscreen) {
        dirty = true;
        start();
      }
    });
    observer.observe(element);
    const onVisibility = () => {
      if (!document.hidden) {
        dirty = true;
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onPointer = (e: PointerEvent) => {
      const r = element.getBoundingClientRect();
      pointer.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      pointer.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    };
    const onLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    const hero = element.closest("[data-parallax-root]") || element;
    hero.addEventListener("pointermove", onPointer as EventListener);
    hero.addEventListener("pointerleave", onLeave);
    const onReduce = () => {
      dirty = true;
      start();
    };
    reduce.addEventListener("change", onReduce);

    const resize = new ResizeObserver(() => {
      const w = element.clientWidth;
      const h = element.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fit();
      dirty = true;
      start();
    });
    resize.observe(element);
    const onLost = (event: Event) => {
      event.preventDefault();
      setState("no-webgl");
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);

    api.current = {
      load,
      reset,
      setRunning: (r) => {
        isRunning = r;
      },
    };
    start();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      hero.removeEventListener("pointermove", onPointer as EventListener);
      hero.removeEventListener("pointerleave", onLeave);
      reduce.removeEventListener("change", onReduce);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      controls.dispose();
      if (model) disposeModel(model);
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // The renderer lives for the component's lifetime; `running` is synced via api.setRunning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const apply = (data: Geometry) => {
      api.current?.load(data);
      const elements: Record<string, number> = {};
      data.atoms.forEach((a) => (elements[a.element] = (elements[a.element] || 0) + 1));
      onInfoRef.current?.({ smiles: data.smiles, geometry: data.geometry, atoms: data.atoms.length, elements });
      setState((s) => (s === "no-webgl" ? s : "ready"));
    };
    const cached = cache.get(smiles);
    if (cached) {
      apply(cached);
      return;
    }
    setState((s) => (s === "no-webgl" ? s : "loading"));
    fetch(`/api/molecule/scene?smiles=${encodeURIComponent(smiles)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Geometry unavailable");
        return r.json() as Promise<Geometry>;
      })
      .then((data) => {
        cache.set(smiles, data);
        apply(data);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        onInfoRef.current?.(null);
        setState((s) => (s === "no-webgl" ? s : "unavailable"));
      });
    return () => controller.abort();
  }, [smiles]);

  const fallback = state === "no-webgl" || state === "unavailable";
  return (
    <div className="scene" data-state={state}>
      <div
        ref={host}
        className="scene-canvas"
        role="img"
        aria-label={`Illustrative 3D model of ${smiles}. Drag to rotate.`}
        hidden={fallback}
      />
      {fallback && (
        <div className="scene-fallback">
          {state === "no-webgl" ? (
            <Molecule smiles={smiles} />
          ) : (
            <p>3D geometry could not be generated for this structure.</p>
          )}
        </div>
      )}
      {state === "ready" && (
        <button type="button" className="scene-reset" onClick={() => api.current?.reset()} aria-label="Reset 3D view">
          <RotateCcw size={14} aria-hidden="true" />
          <span>Reset view</span>
        </button>
      )}
    </div>
  );
}
