import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CATALOG, catalogCategories, type AssetRecord } from "@/assets/catalog.ts";
import { releaseModel } from "@/assets/kit.ts";
import { GRADE, PALETTE } from "@/viewer/grade.ts";
import { installViceGrade } from "@/viewer/post.ts";

const CATEGORIES = catalogCategories();

export function Showroom() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState("NPC");
  const [assetId, setAssetId] = useState("npc-police");
  const asset = CATALOG.find((item) => item.id === assetId) ?? CATALOG[0];
  const visible = CATALOG.filter((item) => item.category === category);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    installViceGrade();
    const shot = new URLSearchParams(window.location.search).has("shot");
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: shot,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.CustomToneMapping;
    renderer.toneMappingExposure = GRADE.exposure;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    renderer.setClearColor(PALETTE.skySunsetBot, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(PALETTE.fogSunset, 40, 180);
    scene.add(new THREE.HemisphereLight(PALETTE.hemiSunset, PALETTE.groundSunset, 0.85));
    const sun = new THREE.DirectionalLight(PALETTE.sunSunset, 1.35);
    sun.position.set(12, 18, 8);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(PALETTE.rim, 0.55);
    rim.position.set(-8, 6, -6);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(PALETTE.fill, 0.4);
    fill.position.set(-4, 3, 10);
    scene.add(fill);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(18, 40), new THREE.MeshStandardMaterial({ color: GRADE.ground, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.15, 400);
    const center = new THREE.Vector3();
    let yaw = 0.7;
    let pitch = 0.32;
    let dist = 6;
    let spinning = !shot && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let current: THREE.Group | null = null;

    const frame = (model: THREE.Group) => {
      model.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(model);
      box.getCenter(center);
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z);
      dist = radius * 1.35 + 1.4;
      ground.scale.setScalar(Math.max(1, radius / 6));
    };

    const apply = () => {
      const cp = Math.cos(pitch);
      camera.position.set(center.x + Math.sin(yaw) * cp * dist, center.y + Math.sin(pitch) * dist * 0.85, center.z + Math.cos(yaw) * cp * dist);
      camera.lookAt(center);
    };

    const show = (id: string) => {
      if (current) {
        scene.remove(current);
        releaseModel(current);
        current = null;
      }
      const record = CATALOG.find((item) => item.id === id);
      if (!record) return;
      current = record.build();
      scene.add(current);
      frame(current);
      apply();
    };

    show(assetId);
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let drag = false;
    let lx = 0;
    let ly = 0;
    const down = (event: PointerEvent) => {
      drag = true;
      spinning = false;
      lx = event.clientX;
      ly = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      yaw -= (event.clientX - lx) * 0.008;
      pitch += (event.clientY - ly) * 0.008;
      pitch = Math.max(-0.2, Math.min(1.1, pitch));
      lx = event.clientX;
      ly = event.clientY;
      apply();
    };
    const up = () => {
      drag = false;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      dist *= event.deltaY > 0 ? 1.08 : 0.92;
      dist = Math.max(1.2, Math.min(80, dist));
      apply();
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });

    let last = performance.now();
    let stopped = false;
    const loop = (now: number) => {
      if (stopped) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (spinning) {
        yaw += dt * 0.25;
        apply();
      }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const onPick = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      spinning = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      yaw = 0.7;
      show(id);
    };
    mount.addEventListener("showroom-pick", onPick);

    return () => {
      stopped = true;
      observer.disconnect();
      mount.removeEventListener("showroom-pick", onPick);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("wheel", wheel);
      if (current) releaseModel(current);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [assetId]);

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-3 sm:px-4">
        <div>
          <p className="font-display text-2xl leading-none tracking-wide">DHAKA</p>
          <p className="font-display text-sm tracking-[0.18em] text-accent">MODEL INDEX</p>
        </div>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm">
          Back to the city
        </Link>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-[46dvh] overflow-auto border-b border-line p-3 md:max-h-none md:w-80 md:border-b-0 md:border-r">
          <div className="flex gap-1 overflow-x-auto pb-2">
            {CATEGORIES.map((name) => (
              <button
                key={name}
                type="button"
                className={`min-h-11 shrink-0 rounded-full border px-3 text-xs ${category === name ? "border-accent bg-accent text-bg" : "border-line bg-bg text-fg"}`}
                onClick={() => {
                  setCategory(name);
                  const first = CATALOG.find((item) => item.category === name);
                  if (first) setAssetId(first.id);
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <ul className="mt-2 space-y-1">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`min-h-11 w-full rounded-xl border px-3 text-left ${item.id === asset.id ? "border-accent bg-surface" : "border-transparent bg-bg"}`}
                  onClick={() => setAssetId(item.id)}
                >
                  <span className="block text-sm">{item.name}</span>
                  <Status status={item.status} />
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="relative min-h-0 flex-1">
          <div ref={mountRef} className="absolute inset-0 touch-none" />
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-2xl border border-line bg-surface/90 p-3 sm:left-4 sm:max-w-md">
            <p className="font-display text-xl leading-none">{asset.name}</p>
            <Status status={asset.status} />
            <p className="mt-2 text-sm leading-relaxed text-fg">{asset.summary}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{asset.evidence}</p>
            <p className="mt-2 text-xs text-muted">Drag to orbit. Scroll to zoom. These are the game meshes, not the poster.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Status({ status }: { status: AssetRecord["status"] }) {
  const on = status === "INTEGRATED" || status === "VERIFIED";
  return <span className={`text-xs ${on ? "text-accent" : "text-muted"}`}>{status}</span>;
}
