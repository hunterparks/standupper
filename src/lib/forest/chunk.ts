import * as THREE from 'three';
import type { Kit } from './kit.ts';
import {
	hash2,
	isPlantable,
	pathMask,
	pathX,
	rng,
	smoothstep,
	terrainHeight,
	valueNoise
} from './terrain.ts';

// The forest is generated in deterministic slabs ("chunks") along the trail,
// so walking forward (or back) always shows the same trees.

export const CHUNK_LEN = 40;
const HALF_WIDTH = 78;
const GROUND_STEP = 0.8;

/** Chunk c spans z in [-(c + 1) * CHUNK_LEN, -c * CHUNK_LEN]. */
export const chunkIndex = (z: number) => Math.floor(-z / CHUNK_LEN);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Accumulates instances, then becomes one InstancedMesh. */
class Batch {
	private matrices: number[] = [];
	private colors: number[] = [];

	add(pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3, color?: THREE.Color) {
		_m.compose(pos, quat, scale);
		this.matrices.push(..._m.elements);
		if (color) this.colors.push(color.r, color.g, color.b);
	}

	get size() {
		return this.matrices.length / 16;
	}

	build(
		geo: THREE.BufferGeometry,
		mat: THREE.Material,
		shadows: { cast?: boolean; receive?: boolean } = {}
	): THREE.InstancedMesh | null {
		const n = this.size;
		if (n === 0) return null;
		const mesh = new THREE.InstancedMesh(geo, mat, n);
		mesh.instanceMatrix.array.set(this.matrices);
		if (this.colors.length === n * 3) {
			mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.colors), 3);
		}
		mesh.castShadow = !!shadows.cast;
		mesh.receiveShadow = !!shadows.receive;
		mesh.computeBoundingSphere();
		return mesh;
	}
}

const pick = <T>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];

/** A theme color nudged in lightness/hue so repeated colors don't look stamped. */
function vary(hex: string, r: () => number, amount = 0.08): THREE.Color {
	const c = new THREE.Color(hex);
	const hsl = { h: 0, s: 0, l: 0 };
	c.getHSL(hsl);
	return c.setHSL(
		hsl.h + (r() - 0.5) * amount * 0.25,
		Math.min(1, hsl.s * (1 + (r() - 0.5) * amount)),
		Math.min(1, Math.max(0, hsl.l * (1 + (r() - 0.5) * amount * 2)))
	);
}

export interface TreeBatches {
	wood: Batch;
	blobs: Batch;
	cones: Batch;
	snow: Batch;
}

export function newTreeBatches(): TreeBatches {
	return { wood: new Batch(), blobs: new Batch(), cones: new Batch(), snow: new Batch() };
}

export function buildTreeMeshes(kit: Kit, b: TreeBatches): THREE.Object3D[] {
	const shadows = { cast: true, receive: true };
	return [
		b.wood.build(kit.geo.wood, kit.mat.bark, shadows),
		b.blobs.build(kit.geo.blob, kit.mat.foliage, shadows),
		b.cones.build(kit.geo.cone, kit.mat.foliage, shadows),
		b.snow.build(kit.geo.cone, kit.mat.snow, shadows)
	].filter((m): m is THREE.InstancedMesh => !!m);
}

export type TreeKind = 'round' | 'conifer' | 'bare';

/** Plants one tree into the batches. `size` ~1 is an ordinary tree. */
export function plantTree(
	kit: Kit,
	b: TreeBatches,
	kind: TreeKind,
	x: number,
	z: number,
	size: number,
	r: () => number,
	opts: { trunkH?: number; branchStart?: number; upright?: boolean } = {}
) {
	const sink = 0.15;
	const theme = kit.theme;
	const y = terrainHeight(x, z) - sink;
	const barkTint = _c.setScalar(0.85 + r() * 0.3).clone();
	// Draw the lean even when upright so the rest of the tree's rolls don't shift
	const tilt = opts.upright ? 0 : 0.08;
	const lean = (r() - 0.5) * tilt;
	_e.set(lean, r() * Math.PI * 2, (r() - 0.5) * tilt);
	_q.setFromEuler(_e);

	if (kind === 'round') {
		const trunkH = opts.trunkH ?? (2.6 + r() * 1.2) * size;
		const trunkR = 0.24 * size;
		b.wood.add(_p.set(x, y, z), _q, _s.set(trunkR, trunkH + 0.6 * size, trunkR), barkTint);
		const base = new THREE.Color(pick(r, theme.foliage));
		const blobs = 4 + Math.floor(r() * 3);
		for (let i = 0; i < blobs; i++) {
			const a = (i / blobs) * Math.PI * 2 + r();
			const spread = i === 0 ? 0 : (0.7 + r() * 0.6) * size;
			const rad = (i === 0 ? 1.7 : 1.05 + r() * 0.55) * size;
			const yy = y + trunkH + (i === 0 ? 0.9 : r() * 1.4) * size;
			_e.set(r() * 3, r() * 3, r() * 3);
			b.blobs.add(
				_p.set(x + Math.cos(a) * spread, yy, z + Math.sin(a) * spread),
				new THREE.Quaternion().setFromEuler(_e),
				_s.set(rad, rad * (0.8 + r() * 0.15), rad),
				vary(`#${base.getHexString()}`, r, 0.18)
			);
		}
	} else if (kind === 'conifer') {
		const trunkH = 1.3 * size;
		b.wood.add(_p.set(x, y, z), _q, _s.set(0.2 * size, trunkH + 1.2 * size, 0.2 * size), barkTint);
		const tiers = 3 + Math.floor(r() * 2);
		const color = pick(r, theme.conifer);
		let ty = y + trunkH * 0.8;
		let rad = (1.9 + r() * 0.5) * size;
		const tierH = (2.1 + r() * 0.4) * size;
		const spin = new THREE.Quaternion().setFromAxisAngle(UP, r() * Math.PI);
		for (let i = 0; i < tiers; i++) {
			const tint = vary(color, r, 0.12).multiplyScalar(1 + i * 0.05);
			b.cones.add(_p.set(x, ty, z), spin, _s.set(rad, tierH, rad), tint);
			if (theme.snowy) {
				b.snow.add(
					_p.set(x, ty + tierH * 0.42, z),
					spin,
					_s.set(rad * 0.62, tierH * 0.6, rad * 0.62),
					_c.setScalar(1)
				);
			}
			ty += tierH * 0.55;
			rad *= 0.74;
		}
	} else {
		// Bare: a trunk and a fan of crooked branches
		const trunkH = opts.trunkH ?? (3.6 + r() * 1.6) * size;
		const trunkR = 0.22 * size;
		const branchStart = opts.branchStart ?? 0.4;
		b.wood.add(_p.set(x, y, z), _q, _s.set(trunkR, trunkH, trunkR), barkTint);
		const branches = 5 + Math.floor(r() * 4);
		const dir = new THREE.Vector3();
		for (let i = 0; i < branches; i++) {
			const at = branchStart + r() * (0.95 - branchStart);
			const az = r() * Math.PI * 2;
			const tilt = 0.45 + r() * 0.6;
			dir.set(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
			const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
			const len = (1.2 + r() * 1.6) * size * (1.2 - at * 0.5);
			const br = trunkR * (0.35 + (1 - at) * 0.25);
			const bx = x;
			const by = y + trunkH * at;
			b.wood.add(_p.set(bx, by, z), q, _s.set(br, len, br), barkTint);
			// A twig off the end
			const tip = dir.clone().multiplyScalar(len * 0.62);
			const az2 = az + (r() - 0.5) * 1.6;
			dir.set(Math.cos(az2) * 0.7, 0.7 + r() * 0.3, Math.sin(az2) * 0.7).normalize();
			b.wood.add(
				_p.set(bx + tip.x, by + tip.y, z + tip.z),
				new THREE.Quaternion().setFromUnitVectors(UP, dir),
				_s.set(br * 0.55, len * 0.5, br * 0.55),
				barkTint
			);
		}
		// Halloween/autumn bare trees keep a few clinging leaves
		if (theme.groundLeaves.length && r() < 0.6) {
			const base = pick(r, theme.foliage);
			for (let i = 0; i < 3; i++) {
				const rad = (0.5 + r() * 0.5) * size;
				b.blobs.add(
					_p.set(
						x + (r() - 0.5) * 2.5 * size,
						y + trunkH * (0.75 + r() * 0.35),
						z + (r() - 0.5) * 2.5 * size
					),
					_q,
					_s.set(rad, rad * 0.8, rad),
					vary(base, r, 0.2)
				);
			}
		}
	}
}

export function pickTreeKind(kit: Kit, r: () => number): TreeKind {
	const { round, conifer, bare } = kit.theme.trees;
	const t = r() * (round + conifer + bare);
	return t < round ? 'round' : t < round + conifer ? 'conifer' : 'bare';
}

function buildGround(kit: Kit, z0: number, z1: number, cx: number): THREE.Mesh {
	const theme = kit.theme;
	const w = HALF_WIDTH * 2;
	const len = z0 - z1;
	const segX = Math.round(w / GROUND_STEP);
	const segZ = Math.round(len / GROUND_STEP);
	const geo = new THREE.PlaneGeometry(w, len, segX, segZ);
	geo.rotateX(-Math.PI / 2);
	geo.translate(cx, 0, (z0 + z1) / 2);

	const pos = geo.attributes.position;
	const normals = geo.attributes.normal;
	const colors = new Float32Array(pos.count * 3);
	const g0 = new THREE.Color(theme.ground[0]);
	const g1 = new THREE.Color(theme.ground[1]);
	const trail = new THREE.Color(theme.trail);
	const trailDark = trail.clone().multiplyScalar(0.78);
	const leafColors = theme.groundLeaves.map((h) => new THREE.Color(h));
	const col = new THREE.Color();
	const tmp = new THREE.Color();
	const n = new THREE.Vector3();
	const e = 0.3;

	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		const mask = pathMask(x, z);
		// The trail is worn a touch below the forest floor.
		const h = (wx: number, wz: number) => terrainHeight(wx, wz) - 0.1 * pathMask(wx, wz);
		pos.setY(i, h(x, z));
		n.set(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize();
		normals.setXYZ(i, n.x, n.y, n.z);

		const big = valueNoise(x * 0.07, z * 0.07);
		const small = valueNoise(x * 0.6 + 31, z * 0.6 - 17);
		col
			.copy(g0)
			.lerp(g1, big)
			.multiplyScalar(0.82 + 0.32 * small);
		if (leafColors.length) {
			// Patchy leaf litter baked into the ground color
			const litter = smoothstep(0.45, 0.8, valueNoise(x * 0.35 - 9, z * 0.35 + 4));
			const lc =
				leafColors[Math.floor(hash2(Math.floor(x * 2), Math.floor(z * 2)) * leafColors.length)];
			col.lerp(lc, litter * 0.55);
		}
		tmp
			.copy(trail)
			.lerp(trailDark, valueNoise(x * 1.3, z * 1.3))
			.multiplyScalar(0.92 + 0.16 * small);
		col.lerp(tmp, mask);
		colors[i * 3] = col.r;
		colors[i * 3 + 1] = col.g;
		colors[i * 3 + 2] = col.b;
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	geo.computeBoundingSphere();
	const mesh = new THREE.Mesh(geo, kit.mat.ground);
	mesh.receiveShadow = true;
	return mesh;
}

export function buildChunk(kit: Kit, c: number): THREE.Group {
	const theme = kit.theme;
	const q = kit.quality;
	const group = new THREE.Group();
	const z0 = -c * CHUNK_LEN;
	const z1 = z0 - CHUNK_LEN;
	const cx = pathX((z0 + z1) / 2);
	const r = rng(c * 7919 + 17);

	// Overlap neighbors by a hair so there are no seams.
	group.add(buildGround(kit, z0 + 0.05, z1 - 0.05, cx));

	// ---- Trees ----
	const trees = newTreeBatches();
	const planted: [number, number][] = [];
	const tryPlant = (x: number, z: number, minGap: number) => {
		if (!isPlantable(x, z)) return false;
		for (const [px, pz] of planted) {
			if ((px - x) ** 2 + (pz - z) ** 2 < minGap * minGap) return false;
		}
		planted.push([x, z]);
		return true;
	};
	const count = Math.round(170 * q);
	for (let i = 0; i < count; i++) {
		const z = z1 + r() * CHUNK_LEN;
		// Denser near the trail where it's seen up close
		const near = r() < 0.45;
		const dx = (near ? 4 + r() * 18 : 4 + r() * (HALF_WIDTH - 8)) * (r() < 0.5 ? -1 : 1);
		const x = pathX(z) + dx;
		if (!tryPlant(x, z, 2.6)) continue;
		const size = 0.8 + r() * 0.55 + (Math.abs(dx) > 25 ? 0.25 : 0);
		plantTree(kit, trees, pickTreeKind(kit, r), x, z, size, r);
	}
	for (const m of buildTreeMeshes(kit, trees)) group.add(m);

	// ---- Ground details ----
	const scatter = (
		n: number,
		minDx: number,
		maxDx: number,
		fn: (x: number, z: number, y: number) => void
	) => {
		for (let i = 0; i < n; i++) {
			const z = z1 + r() * CHUNK_LEN;
			const dx = (minDx + r() * (maxDx - minDx)) * (r() < 0.5 ? -1 : 1);
			const x = pathX(z) + dx;
			fn(x, z, terrainHeight(x, z) - 0.1 * pathMask(x, z));
		}
	};
	const quat = new THREE.Quaternion();

	// Rocks
	if (theme.extras.includes('rocks')) {
		const rocks = new Batch();
		scatter(Math.round(28 * q), 2.2, 30, (x, z, y) => {
			const s = 0.15 + r() ** 2 * 0.7;
			_e.set(r() * 3, r() * 3, r() * 3);
			rocks.add(
				_p.set(x, y + s * 0.2, z),
				quat.setFromEuler(_e),
				_s.set(s * 1.3, s * 0.7, s),
				_c.setScalar(0.8 + r() * 0.35)
			);
		});
		const m = rocks.build(kit.geo.rock, kit.mat.rock, { cast: true, receive: true });
		if (m) group.add(m);
	}

	// Leaf litter: flat leaves, thickest along the trail edges
	if (theme.groundLeaves.length) {
		const leaves = new Batch();
		const n = Math.round(1100 * q);
		for (let i = 0; i < n; i++) {
			const z = z1 + r() * CHUNK_LEN;
			const dx = (r() < 0.7 ? (r() * 2 - 1) * 5 : (r() * 2 - 1) * 22) * 1;
			const x = pathX(z) + dx;
			const y = terrainHeight(x, z) - 0.1 * pathMask(x, z) + 0.025 + r() * 0.02;
			_e.set((r() - 0.5) * 0.4, r() * Math.PI * 2, (r() - 0.5) * 0.4);
			const s = 0.16 + r() * 0.14;
			leaves.add(
				_p.set(x, y, z),
				quat.setFromEuler(_e),
				_s.set(s, s, s),
				vary(pick(r, theme.groundLeaves), r, 0.25)
			);
		}
		const m = leaves.build(kit.geo.leaf, kit.mat.leaf, { receive: true });
		if (m) group.add(m);
	}

	// Grass tufts (green themes only)
	if (!theme.snowy && !theme.groundLeaves.length) {
		const grass = new Batch();
		const base = new THREE.Color(theme.ground[1]).multiplyScalar(1.15);
		scatter(Math.round(700 * q), 1.4, 16, (x, z, y) => {
			const blades = 3;
			const tint = base.clone().multiplyScalar(0.8 + r() * 0.4);
			for (let k = 0; k < blades; k++) {
				_e.set((r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7);
				const h = 0.25 + r() * 0.35;
				grass.add(
					_p.set(x + (r() - 0.5) * 0.25, y - 0.02, z + (r() - 0.5) * 0.25),
					quat.setFromEuler(_e),
					_s.set(0.05, h, 0.05),
					tint
				);
			}
		});
		const m = grass.build(kit.geo.grass, kit.mat.grass, { receive: true });
		if (m) group.add(m);
	}

	const stems = new Batch();
	const heads = new Batch();
	const caps = new Batch();
	const glows = new Batch();

	if (theme.extras.includes('flowers')) {
		const stemColor = new THREE.Color('#3f6a2a');
		scatter(Math.round(320 * q), 1.6, 12, (x, z, y) => {
			const h = 0.18 + r() * 0.22;
			stems.add(_p.set(x, y, z), quat.identity(), _s.set(0.012, h, 0.012), stemColor);
			const s = 0.05 + r() * 0.05;
			heads.add(
				_p.set(x, y + h, z),
				quat.identity(),
				_s.set(s, s * 0.6, s),
				vary(pick(r, theme.flowers), r, 0.1)
			);
		});
	}

	if (theme.extras.includes('clover')) {
		const clover = new THREE.Color('#2f8a2a');
		scatter(Math.round(500 * q), 1.5, 14, (x, z, y) => {
			for (let k = 0; k < 3; k++) {
				const a = (k / 3) * Math.PI * 2;
				heads.add(
					_p.set(x + Math.cos(a) * 0.07, y + 0.06, z + Math.sin(a) * 0.07),
					quat.identity(),
					_s.set(0.07, 0.02, 0.07),
					vary('#2f9a35', r, 0.2)
				);
			}
			stems.add(_p.set(x, y, z), quat.identity(), _s.set(0.01, 0.06, 0.01), clover);
		});
	}

	if (theme.extras.includes('mushrooms')) {
		const stemColor = new THREE.Color('#efe6d2');
		const capColors = theme.night ? ['#c43a1a', '#8a5a3a'] : ['#c8321e', '#9a6a3a', '#d9a35a'];
		scatter(Math.round(36 * q), 2.5, 14, (x, z, y) => {
			const cluster = 1 + Math.floor(r() * 3);
			for (let k = 0; k < cluster; k++) {
				const mx = x + (r() - 0.5) * 0.5;
				const mz = z + (r() - 0.5) * 0.5;
				const h = 0.1 + r() * 0.14;
				const cr = 0.06 + r() * 0.07;
				stems.add(_p.set(mx, y, mz), quat.identity(), _s.set(cr * 0.3, h, cr * 0.3), stemColor);
				caps.add(
					_p.set(mx, y + h, mz),
					quat.identity(),
					_s.set(cr, cr * 0.7, cr),
					vary(pick(r, capColors), r)
				);
			}
		});
	}

	if (theme.extras.includes('hay')) {
		const hay = new Batch();
		const hayColor = new THREE.Color('#d9b56a');
		scatter(Math.round(5 * q), 2.6, 6, (x, z, y) => {
			_e.set(0, r() * Math.PI, 0);
			hay.add(
				_p.set(x, y - 0.05, z),
				quat.setFromEuler(_e),
				_s.set(1.1, 0.55, 0.6),
				hayColor.clone().multiplyScalar(0.9 + r() * 0.2)
			);
		});
		const m = hay.build(kit.geo.hay, kit.mat.plain, { cast: true, receive: true });
		if (m) group.add(m);
	}

	if (theme.extras.includes('candles')) {
		const wax = new THREE.Color('#f3ead8');
		scatter(Math.round(40 * q), 1.8, 3.2, (x, z, y) => {
			const cluster = 2 + Math.floor(r() * 3);
			for (let k = 0; k < cluster; k++) {
				const cxx = x + (r() - 0.5) * 0.35;
				const czz = z + (r() - 0.5) * 0.35;
				const h = 0.1 + r() * 0.2;
				stems.add(_p.set(cxx, y, czz), quat.identity(), _s.set(0.035, h, 0.035), wax);
				glows.add(_p.set(cxx, y + h, czz), quat.identity(), _s.set(0.025, 0.07, 0.025));
			}
		});
	}

	for (const m of [
		stems.build(kit.geo.stem, kit.mat.plain, { cast: true, receive: true }),
		heads.build(kit.geo.flower, kit.mat.plain, { receive: true }),
		caps.build(kit.geo.cap, kit.mat.plain, { cast: true, receive: true }),
		glows.build(kit.geo.flame, kit.mat.glow)
	]) {
		if (m) group.add(m);
	}

	if (theme.extras.includes('pumpkins')) {
		const pumpkins = new Batch();
		const pumpkinStems = new Batch();
		const stemColor = new THREE.Color('#5a6a2a');
		scatter(Math.round(7 * q), 2.0, 5, (x, z, y) => {
			const s = 0.35 + r() * 0.35;
			_e.set(0, r() * Math.PI, 0);
			quat.setFromEuler(_e);
			pumpkins.add(_p.set(x, y - 0.03, z), quat, _s.set(s, s, s), vary('#ffffff', r, 0.1));
			pumpkinStems.add(
				_p.set(x, y + s * 0.6, z),
				quat,
				_s.set(s * 0.06, s * 0.2, s * 0.06),
				stemColor
			);
		});
		const m = pumpkins.build(kit.geo.pumpkin, kit.mat.pumpkin, { cast: true, receive: true });
		const ms = pumpkinStems.build(kit.geo.stem, kit.mat.plain);
		if (m) group.add(m);
		if (ms) group.add(ms);
	}

	return group;
}

/** Frees a chunk's per-chunk GPU resources (shared kit geometry stays). */
export function disposeChunk(kit: Kit, group: THREE.Group) {
	const shared = new Set<THREE.BufferGeometry>(Object.values(kit.geo));
	group.traverse((o) => {
		if (o instanceof THREE.InstancedMesh) o.dispose();
		else if (o instanceof THREE.Mesh && !shared.has(o.geometry)) o.geometry.dispose();
	});
}
