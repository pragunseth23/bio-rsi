"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

type Geometry = {
  atoms: { element: string; position: [number, number, number] }[];
  bonds: { start: number; end: number; order: number }[];
};
const colors: Record<string, string> = {
  C: "#b1bacd",
  N: "#3546ff",
  O: "#586bff",
  F: "#f3f3fb",
  S: "#e8af65",
  Cl: "#84aec2",
  P: "#ddb18a",
  Br: "#b27e69",
  I: "#8c71be",
};

export function MolecularScene({
  smiles,
  running,
}: {
  smiles: string;
  running: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const model = useRef<THREE.Group | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [atomCount, setAtomCount] = useState(0);
  const isRunning = useRef(running);
  useEffect(() => {
    isRunning.current = running;
  }, [running]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setUnavailable(true);
      setLoading(false);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 19);
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(environment, 0.04);
    scene.environment = target.texture;
    environment.dispose();
    const ambient = new THREE.AmbientLight(0xc7d6ff, 1.3);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 4);
    key.position.set(-5, 8, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3e59ff, 7);
    rim.position.set(8, 2, -3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x7486ff, 3);
    fill.position.set(-6, -3, 3);
    scene.add(fill);
    const group = new THREE.Group();
    scene.add(group);
    model.current = group;
    group.rotation.set(0.18, -0.2, -0.25);
    const controls = new OrbitControls(camera, renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.65;
    controls.rotateSpeed = 0.6;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visibility = { onscreen: true };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibility.onscreen = entry.isIntersecting;
      },
      { threshold: 0.05 },
    );
    observer.observe(element);
    let frame = 0;
    const startedAt = performance.now();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visibility.onscreen || document.hidden) return;
      controls.autoRotate = !reduce.matches;
      controls.autoRotateSpeed = isRunning.current ? 1.6 : 0.65;
      controls.update();
      group.position.y = reduce.matches
        ? 0
        : Math.sin(((performance.now() - startedAt) / 1000) * 0.7) * 0.12;
      renderer.render(scene, camera);
    };
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth,
        height = element.clientHeight;
      renderer.setSize(width, height);
      if (group.userData.radius)
        group.scale.setScalar((width < 600 ? 4 : 6.5) / group.userData.radius);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    const handleLoss = (event: Event) => {
      event.preventDefault();
      setUnavailable(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", handleLoss);
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      controls.dispose();
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          mats.forEach((m) => m.dispose());
        }
      });
      target.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", handleLoss);
      renderer.domElement.remove();
      model.current = null;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/molecule/scene?smiles=${encodeURIComponent(smiles)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Geometry unavailable");
        return r.json() as Promise<Geometry>;
      })
      .then((data) => {
        const group = model.current;
        if (!group) {
          setLoading(false);
          return;
        }
        while (group.children.length) {
          const child = group.children[0];
          group.remove(child);
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        }
        const positions = data.atoms.map(
          (a) => new THREE.Vector3(...a.position),
        );
        const center = positions
          .reduce((sum, p) => sum.add(p), new THREE.Vector3())
          .divideScalar(positions.length);
        positions.forEach((p) => p.sub(center));
        const radius = Math.max(...positions.map((p) => p.length())) + 0.7;
        group.userData.radius = radius;
        const scale =
          ((host.current?.clientWidth || 900) < 600 ? 4 : 6.5) / radius;
        data.atoms.forEach((atom, index) => {
          const material = new THREE.MeshPhysicalMaterial({
            color: colors[atom.element] || "#aab5cc",
            metalness: atom.element === "C" ? 0.9 : 0.45,
            roughness: 0.16,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            envMapIntensity: 1.4,
          });
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(
              atom.element === "C" ? 0.66 : 0.71,
              40,
              32,
            ),
            material,
          );
          sphere.position.copy(positions[index]);
          sphere.userData.element = atom.element;
          group.add(sphere);
        });
        data.bonds.forEach((bond) => {
          const start = positions[bond.start],
            end = positions[bond.end];
          const delta = new THREE.Vector3().subVectors(end, start);
          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.16, delta.length(), 16),
            new THREE.MeshPhysicalMaterial({
              color: "#7b85a6",
              metalness: 0.85,
              roughness: 0.22,
              clearcoat: 1,
            }),
          );
          mesh.position.copy(start).add(end).multiplyScalar(0.5);
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            delta.normalize(),
          );
          group.add(mesh);
        });
        group.scale.setScalar(scale);
        setAtomCount(data.atoms.length);
        setUnavailable(false);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setUnavailable(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [smiles]);
  return (
    <div className="scene-wrap">
      <div
        ref={host}
        className="scene-canvas"
        role="img"
        aria-label={`Interactive illustrative 3D model of ${smiles}. Drag to rotate.`}
      />
      {unavailable && (
        <div className="scene-fallback">
          <img
            src={`/api/molecule/svg?smiles=${encodeURIComponent(smiles)}`}
            alt={`Molecular structure of ${smiles}`}
          />
        </div>
      )}
      <div className="scene-caption">
        <span className="scene-cross">+</span>
        <span>
          {loading
            ? "BUILDING SPECIMEN"
            : unavailable
              ? "MOLECULAR STRUCTURE"
              : `${atomCount} ATOMS / DRAG TO ROTATE`}
        </span>
        <span className="scene-cross">+</span>
      </div>
    </div>
  );
}
