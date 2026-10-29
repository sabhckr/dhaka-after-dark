import * as THREE from "three";
import { buildHuman, NPC_SPECS } from "../assets/human.ts";
import { weld } from "../assets/kit.ts";
import type { ChunkFile } from "../geo/types.ts";
import type { SolidWorld } from "../viewer/solids.ts";
import { Population } from "./population.ts";
import { PROFILES } from "./profiles.ts";
import type { PlayerSample } from "./types.ts";

/**
 * Viewer binding. Each catalog id is welded once (one mesh per material) and
 * cloned. Geometries and materials stay shared. Cross-NPC instancing was
 * measured and not kept: most batches had only a few instances, and the
 * dynamic buffer updates cost more than the draw calls saved.
 * There is no skeleton, so a walk is a bob.
 * The placeholder CNG driver reuses the rickshaw-driver prototype on purpose.
 */
export function createCityLife(scene: THREE.Scene, world: SolidWorld) {
  const pop = new Population(world);
  const root = new THREE.Group();
  root.name = "npcs";
  scene.add(root);
  const views = new Map<string, THREE.Group>();
  const protos = new Map<string, THREE.Group>();
  const specById = new Map(NPC_SPECS.map((row) => [row.id, row.spec]));
  const lineGeo = new THREE.BufferGeometry();
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xff7ad9 }));
  line.visible = false;
  line.frustumCulled = false;
  line.name = "npc-debug-path";
  scene.add(line);

  const bodyFor = (meshId: string): THREE.Group => {
    let proto = protos.get(meshId);
    if (!proto) {
      const spec = specById.get(meshId);
      proto = spec ? weld(buildHuman(spec)) : new THREE.Group();
      proto.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });
      protos.set(meshId, proto);
    }
    return proto.clone(true);
  };

  const sync = () => {
    const live = new Set<string>();
    for (const npc of pop.npcs) {
      live.add(npc.id);
      let group = views.get(npc.id);
      if (!group) {
        const profile = PROFILES[npc.role];
        group = bodyFor(profile.meshId);
        group.name = `npc-${npc.role}`;
        const label = profile.meshStatus === "placeholder-reuse" ? `${profile.name} (placeholder mesh)` : profile.name;
        group.userData.label = label;
        group.userData.npcId = npc.id;
        group.userData.anim = "procedural";
        group.traverse((obj) => {
          obj.userData.label = label;
        });
        root.add(group);
        views.set(npc.id, group);
      }
      const walking =
        npc.state === "WALKING" || npc.state === "FLEEING" || npc.state === "CROSSING_ROAD" || npc.state === "RUNNING" || npc.state === "INVESTIGATING";
      const bob = walking ? Math.abs(Math.sin(npc.bob * 2.2)) * 0.045 : 0;
      group.position.set(npc.x, npc.y + bob, npc.z);
      group.rotation.y = npc.yaw + Math.PI;
      group.visible = npc.state !== "DESPAWNING";
      group.userData.anim = npc.anim;
    }
    for (const [id, group] of views) {
      if (live.has(id)) continue;
      root.remove(group);
      views.delete(id);
    }
    if (!pop.debug) {
      line.visible = false;
      return;
    }
    const sel = pop.nearest();
    if (!sel || sel.path.length < 2) {
      line.visible = false;
      return;
    }
    const pts: number[] = [sel.x, sel.y + 0.45, sel.z];
    for (let i = sel.pathI; i < sel.path.length; i++) pts.push(sel.path[i].x, sel.y + 0.45, sel.path[i].z);
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    lineGeo.computeBoundingSphere();
    line.visible = true;
  };

  return {
    population: pop,
    onChunk(key: string, chunk: ChunkFile) {
      pop.onChunk(key, chunk);
    },
    onUnload(key: string) {
      pop.onUnload(key);
      sync();
    },
    tick(dt: number, player: PlayerSample) {
      pop.player = player;
      pop.tick(dt);
      sync();
    },
    setQuality(quality: "low" | "medium" | "high") {
      pop.setQuality(quality);
    },
    interact() {
      return pop.interact();
    },
    get debug() {
      return pop.debug;
    },
    set debug(value: boolean) {
      pop.debug = value;
    },
    hudLine() {
      return pop.hudLine();
    },
    snapshot() {
      return pop.snapshot();
    },
    setMinutes(minutes: number) {
      pop.clock.setMinutes(minutes);
    },
    snatch() {
      return pop.scriptSnatch()?.id ?? null;
    },
    dispose() {
      pop.dispose();
      views.clear();
      for (const proto of protos.values()) {
        proto.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.userData.uniqueGeo) mesh.geometry?.dispose();
        });
      }
      protos.clear();
      scene.remove(root);
      scene.remove(line);
      lineGeo.dispose();
      (line.material as THREE.Material).dispose();
    },
  };
}

export type CityLife = ReturnType<typeof createCityLife>;
