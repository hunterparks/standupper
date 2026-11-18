import * as THREE from 'three';
import type { ResolvedTheme } from '#lib/types.ts';
import { FOREST_THEMES, type ForestTheme } from './forestThemes.ts';
import { createKit, type Kit } from './kit.ts';
import {
	buildChunk,
	buildTreeMeshes,
	CHUNK_LEN,
	chunkIndex,
	disposeChunk,
	newTreeBatches,
	pickTreeKind,
	plantTree
} from './chunk.ts';
import { createRainbow, createSky, Fireworks, Particles, sunDirection } from './effects.ts';
import {
	FONT_DISPLAY,
	FONT_MONO,
	plankGeometry,
	SignCanvas,
	type SignFace,
	signMaterial
} from './signs.ts';
import {
	easeInOut,
	pathMask,
	pathSlope,
	pathX,
	rng,
	SIGN_TREE_OFFSET,
	smoothstep,
	STATION_SPACING,
	stationSide,
	stationZ,
	terrainHeight,
	TRAILHEAD_Z
} from './terrain.ts';

export type ForestAction = 'next' | 'previous' | 'yeet' | 'bij';

export interface ForestOptions {
	theme: ResolvedTheme;
	/** The standup's accent color (hex), used for the Next plank and the timer. */
	accent: string;
	standupName: string;
	reducedMotion: boolean;
	/** Seconds to walk the distance between two neighboring sign trees. */
	walkSeconds: number;
	onAction: (action: ForestAction) => void;
}

type Anchor =
	{ kind: 'trailhead' } | { kind: 'station'; k: number } | { kind: 'finish'; k: number };

interface Pose {
	pos: THREE.Vector3;
	look: THREE.Vector3;
}

interface Trip {
	to: Anchor;
	fromPos: THREE.Vector3;
	fromLook: THREE.Vector3;
	fromOffset: THREE.Vector3;
	forward: boolean;
	t: number;
	duration: number;
	resolve: () => void;
}

const EYE = 1.7;
const FOV = 50;
const BOARD_W = 2.3;
const BOARD_H = 1.1;
const BOARD_Y = 2.45;
const WOOD = '#a0703f';
const WOOD_DARK = '#5a3a22';
const ROPE = '#cdb48a';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Camera height above the trail at z (on the centerline). */
function trailEye(z: number, out = new THREE.Vector3()): THREE.Vector3 {
	const x = pathX(z);
	return out.set(x, terrainHeight(x, z) - 0.1 * pathMask(x, z) + EYE, z);
}

/** Yaw that turns +z to face back down the trail at z (toward the approaching camera). */
const facingYaw = (z: number) => Math.atan2(pathSlope(z), 1);

function rope(from: THREE.Vector3, to: THREE.Vector3, mat: THREE.Material, radius = 0.012) {
	const len = from.distanceTo(to);
	const geo = new THREE.CylinderGeometry(radius, radius, len, 5, 1);
	geo.translate(0, -len / 2, 0);
	const mesh = new THREE.Mesh(geo, mat);
	mesh.position.copy(from);
	mesh.quaternion.setFromUnitVectors(
		new THREE.Vector3(0, -1, 0),
		_v.copy(to).sub(from).normalize()
	);
	return mesh;
}

// ---------- Stations: a sign tree per speaker ----------

class Station {
	readonly group = new THREE.Group();
	/** Frame at the sign tree's base, +z facing the camera's resting spot. */
	readonly frame = new THREE.Object3D();
	readonly lanternPos = new THREE.Vector3();
	name: string | null = null;
	private sign: SignCanvas;
	private board: THREE.Mesh;
	private disposables: { dispose(): void }[] = [];

	constructor(
		private kit: Kit,
		readonly k: number,
		anisotropy: number
	) {
		const theme = kit.theme;
		const zs = stationZ(k);
		const side = stationSide(k);
		const px = pathX(zs);
		const tx = px + side * SIGN_TREE_OFFSET;
		const ty = terrainHeight(tx, zs);
		const r = rng(k * 104729 + 3);

		// The sign tree, and a partner across the trail for bunting
		const trees = newTreeBatches();
		const big = theme.snowy ? 'bare' : 'round';
		plantTree(kit, trees, big, tx, zs, 1.35, r, {
			trunkH: 5.8,
			branchStart: 0.72,
			// Boards hang a few cm off the bark; any lean pushes the trunk through them
			upright: true
		});
		const partnerX = px - side * (SIGN_TREE_OFFSET + 0.9);
		const partnerZ = zs - 3;
		const partnerKind = pickTreeKind(kit, r);
		plantTree(
			kit,
			trees,
			partnerKind === 'conifer' ? 'round' : partnerKind,
			partnerX,
			partnerZ,
			1.1,
			r,
			{
				trunkH: 4.6
			}
		);
		for (const m of buildTreeMeshes(kit, trees)) {
			this.group.add(m);
			this.disposables.push(m as THREE.InstancedMesh);
		}

		this.frame.position.set(tx, ty, zs);
		const facing = trailEye(zs + 5);
		this.frame.lookAt(facing.x, ty, facing.z);
		this.group.add(this.frame);

		// The name board, nailed to the trunk
		this.sign = new SignCanvas(BOARD_W, BOARD_H, anisotropy);
		this.disposables.push(this.sign);
		const geo = plankGeometry(BOARD_W, BOARD_H, 0.09);
		const faceMat = signMaterial(this.sign, theme.night ? 0.32 : 0.12);
		const edgeMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.9 });
		this.disposables.push(geo, faceMat, edgeMat);
		this.board = new THREE.Mesh(geo, [faceMat, edgeMat]);
		this.board.position.set(0, BOARD_Y, 0.36);
		this.board.rotation.z = (r() - 0.5) * 0.04;
		this.board.castShadow = true;
		this.board.receiveShadow = true;
		this.board.visible = false;
		this.frame.add(this.board);

		// A lantern on a bracket beside the board
		if (theme.night) {
			const lantern = new THREE.Group();
			const metal = new THREE.MeshStandardMaterial({
				color: '#2a2420',
				roughness: 0.5,
				metalness: 0.6
			});
			const glass = new THREE.MeshBasicMaterial({ color: '#ffc46b', toneMapped: false });
			const cap = new THREE.ConeGeometry(0.16, 0.12, 4);
			const glassGeo = new THREE.BoxGeometry(0.14, 0.2, 0.14);
			const base = new THREE.BoxGeometry(0.2, 0.03, 0.2);
			this.disposables.push(metal, glass, cap, glassGeo, base);
			const top = new THREE.Mesh(cap, metal);
			top.position.y = 0.16;
			top.rotation.y = Math.PI / 4;
			const bottom = new THREE.Mesh(base, metal);
			bottom.position.y = -0.11;
			lantern.add(new THREE.Mesh(glassGeo, glass), top, bottom);
			lantern.position.set(side * 1.45, BOARD_Y + 0.3, 0.45);
			const bracket = rope(
				new THREE.Vector3(side * 0.25, BOARD_Y + 0.75, 0.25),
				new THREE.Vector3(side * 1.45, BOARD_Y + 0.75, 0.45),
				metal,
				0.02
			);
			const hook = rope(
				new THREE.Vector3(side * 1.45, BOARD_Y + 0.75, 0.45),
				new THREE.Vector3(side * 1.45, BOARD_Y + 0.5, 0.45),
				metal,
				0.008
			);
			this.disposables.push(bracket.geometry, hook.geometry);
			this.frame.add(lantern, bracket, hook);
			lantern.updateMatrixWorld(true);
			this.frame.updateMatrixWorld(true);
			lantern.getWorldPosition(this.lanternPos);
		}

		if (theme.bunting) this.addBunting(tx, ty, zs, partnerX, partnerZ, theme, r);
	}

	private addBunting(
		tx: number,
		ty: number,
		tz: number,
		bx: number,
		bz: number,
		theme: ForestTheme,
		r: () => number
	) {
		const a = new THREE.Vector3(tx, ty + 4.6, tz);
		const b = new THREE.Vector3(bx, terrainHeight(bx, bz) + 4.4, bz);
		const sag = 0.9;
		const pts: THREE.Vector3[] = [];
		const n = 24;
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			const p = a.clone().lerp(b, t);
			p.y -= Math.sin(t * Math.PI) * sag;
			pts.push(p);
		}
		const curve = new THREE.CatmullRomCurve3(pts);
		const ropeMat = new THREE.MeshStandardMaterial({ color: ROPE, roughness: 1 });
		const ropeGeo = new THREE.TubeGeometry(curve, 32, 0.015, 4);
		this.disposables.push(ropeMat, ropeGeo);
		this.group.add(new THREE.Mesh(ropeGeo, ropeMat));

		const flag = new THREE.BufferGeometry();
		flag.setAttribute(
			'position',
			new THREE.BufferAttribute(new Float32Array([-0.17, 0, 0, 0.17, 0, 0, 0, -0.38, 0]), 3)
		);
		flag.computeVertexNormals();
		const flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
		const len = curve.getLength();
		const count = Math.floor(len / 0.42);
		const flags = new THREE.InstancedMesh(flag, flagMat, count);
		this.disposables.push(flag, flagMat, flags);
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const dir = b.clone().sub(a).setY(0).normalize();
		const yaw = Math.atan2(-dir.z, dir.x);
		const color = new THREE.Color();
		for (let i = 0; i < count; i++) {
			const p = curve.getPointAt((i + 0.5) / count);
			q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, yaw, 0, 'YXZ'));
			m.compose(p, q, new THREE.Vector3(1, 1, 1));
			flags.setMatrixAt(i, m);
			flags.setColorAt(i, color.set(theme.bunting![i % theme.bunting!.length]));
		}
		flags.castShadow = true;
		this.group.add(flags);
	}

	setFace(name: string | null, label: string) {
		this.name = name;
		this.board.visible = !!name;
		if (!name) return;
		this.sign.draw({
			seed: this.k + 11,
			wood: WOOD,
			lines: [
				{ text: label, font: `700 ${FONT_MONO}`, size: 0.12, y: 0.2, spacing: 6 },
				{ text: name.toUpperCase(), font: FONT_DISPLAY, size: 0.36, y: 0.52 }
			]
		});
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}

// ---------- Arches: trailhead and finish ----------

function buildArch(
	kit: Kit,
	face: SignFace,
	anisotropy: number,
	disposables: { dispose(): void }[]
) {
	const group = new THREE.Group();
	const bark = kit.mat.bark;
	const span = 2.5;
	for (const s of [-1, 1]) {
		const post = new THREE.Mesh(kit.geo.wood, bark);
		post.position.set(s * span, -0.3, 0);
		post.scale.set(0.2, 5, 0.2);
		post.castShadow = true;
		group.add(post);
	}
	const beam = new THREE.Mesh(kit.geo.wood, bark);
	beam.rotation.z = Math.PI / 2;
	beam.position.set(span + 0.5, 4.35, 0);
	beam.scale.set(0.17, span * 2 + 1, 0.17);
	beam.castShadow = true;
	group.add(beam);

	const w = 3.7;
	const h = 1.0;
	const sign = new SignCanvas(w, h, anisotropy);
	sign.draw(face);
	const geo = plankGeometry(w, h, 0.1);
	const faceMat = signMaterial(sign, kit.theme.night ? 0.35 : 0.12);
	const edgeMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.9 });
	const ropeMat = new THREE.MeshStandardMaterial({ color: ROPE, roughness: 1 });
	disposables.push(sign, geo, faceMat, edgeMat, ropeMat);
	const board = new THREE.Mesh(geo, [faceMat, edgeMat]);
	board.position.set(0, 3.45, 0.1);
	board.castShadow = true;
	group.add(board);
	for (const s of [-1, 1]) {
		const r = rope(
			new THREE.Vector3(s * 1.4, 4.3, 0.1),
			new THREE.Vector3(s * 1.4, 3.45 + h / 2, 0.1),
			ropeMat
		);
		disposables.push(r.geometry);
		group.add(r);
	}
	return group;
}

function placeOnTrail(obj: THREE.Object3D, z: number) {
	const x = pathX(z);
	obj.position.set(x, terrainHeight(x, z) - 0.1, z);
	obj.rotation.y = facingYaw(z);
}

class Campfire {
	readonly group = new THREE.Group();
	readonly light: THREE.PointLight;
	private flames: THREE.Mesh[] = [];
	private disposables: { dispose(): void }[] = [];

	constructor(kit: Kit) {
		for (let i = 0; i < 5; i++) {
			const log = new THREE.Mesh(kit.geo.wood, kit.mat.bark);
			const a = (i / 5) * Math.PI * 2;
			log.position.set(Math.cos(a) * 0.35, 0.05, Math.sin(a) * 0.35);
			log.scale.set(0.08, 0.9, 0.08);
			log.lookAt(0, 0.6, 0);
			log.rotateX(Math.PI / 2);
			log.castShadow = true;
			this.group.add(log);
		}
		const stones = new THREE.InstancedMesh(kit.geo.rock, kit.mat.rock, 10);
		const m = new THREE.Matrix4();
		for (let i = 0; i < 10; i++) {
			const a = (i / 10) * Math.PI * 2;
			m.compose(
				new THREE.Vector3(Math.cos(a) * 0.75, 0.05, Math.sin(a) * 0.75),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(i, i * 2, i * 3)),
				new THREE.Vector3(0.18, 0.13, 0.16)
			);
			stones.setMatrixAt(i, m);
		}
		this.disposables.push(stones);
		this.group.add(stones);
		const hot = new THREE.MeshBasicMaterial({
			color: '#ff8a1a',
			toneMapped: false,
			transparent: true,
			opacity: 0.9
		});
		const core = new THREE.MeshBasicMaterial({ color: '#ffe08a', toneMapped: false });
		this.disposables.push(hot, core);
		for (let i = 0; i < 5; i++) {
			const f = new THREE.Mesh(kit.geo.flame, i < 2 ? core : hot);
			f.position.set((Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3);
			this.flames.push(f);
			this.group.add(f);
		}
		this.light = new THREE.PointLight('#ff9a3a', 25, 18, 1.6);
		this.light.position.y = 0.9;
		this.group.add(this.light);
	}

	update(t: number) {
		this.flames.forEach((f, i) => {
			const flick = 0.75 + 0.25 * Math.sin(t * (9 + i * 2.3) + i * 7) * Math.sin(t * 5.1 + i);
			const s = i < 2 ? 0.16 : 0.24;
			f.scale.set(s * (0.9 + 0.2 * flick), (i < 2 ? 0.55 : 0.9) * flick, s * (0.9 + 0.2 * flick));
			f.rotation.y = t * (i % 2 ? 1 : -1);
		});
		this.light.intensity = 22 + 6 * Math.sin(t * 13) * Math.sin(t * 7.3);
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}

// ---------- The controls that hang from the current speaker's sign ----------

interface Plank {
	action: ForestAction;
	pivot: THREE.Group;
	mesh: THREE.Mesh;
	material: THREE.MeshStandardMaterial;
	baseGlow: number;
	enabled: boolean;
	hover: number;
	kick: number;
	kickVel: number;
}

interface PlankSpec {
	action: ForestAction;
	lines: SignFace['lines'];
	paint?: string;
	enabled: boolean;
}

/** Board-local bounds of everything hung on the tree, for camera framing. */
interface Bounds {
	halfW: number;
	top: number;
	bottom: number;
}

class Controls {
	readonly group = new THREE.Group();
	planks: Plank[] = [];
	bounds: Bounds = { halfW: 1.6, top: 1.45, bottom: -1.2 };
	private plankDisposables: { dispose(): void }[] = [];
	private disposables: { dispose(): void }[] = [];
	private arrows: {
		mesh: THREE.Mesh;
		sign: SignCanvas;
		geos: Record<string, THREE.BufferGeometry>;
		w: number;
		h: number;
	}[] = [];
	private fill: THREE.Mesh;
	private fillMat: THREE.MeshStandardMaterial;
	private progress: number | null = 0;
	private shown = 0;
	private drop = 1;
	private ropeMat = new THREE.MeshStandardMaterial({ color: ROPE, roughness: 1 });
	private edgeMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.9 });
	private layoutKey = '';
	private dir: -1 | 1 = 1;

	constructor(
		private kit: Kit,
		private accent: string,
		private anisotropy: number
	) {
		this.disposables.push(this.ropeMat, this.edgeMat);

		// Timer: a groove routed into the board, filling with the accent color
		const grooveGeo = new THREE.BoxGeometry(1.9, 0.09, 0.02);
		const grooveMat = new THREE.MeshStandardMaterial({ color: '#2a170c', roughness: 1 });
		const groove = new THREE.Mesh(grooveGeo, grooveMat);
		groove.position.set(0, BOARD_Y - 0.36, 0.36 + 0.05);
		const fillGeo = new THREE.BoxGeometry(1, 0.065, 0.024);
		fillGeo.translate(0.5, 0, 0);
		this.fillMat = new THREE.MeshStandardMaterial({
			color: accent,
			emissive: new THREE.Color(accent),
			emissiveIntensity: 0.55,
			roughness: 0.5
		});
		this.fill = new THREE.Mesh(fillGeo, this.fillMat);
		this.fill.position.set(-0.94, BOARD_Y - 0.36, 0.36 + 0.055);
		this.fill.scale.x = 0.0001;
		this.group.add(groove, this.fill);
		this.disposables.push(grooveGeo, grooveMat, fillGeo, this.fillMat);

		// Two arrow signs above the board point on down the trail
		for (const [w, h] of [
			[1.8, 0.3],
			[1.62, 0.27]
		]) {
			const sign = new SignCanvas(w, h, anisotropy);
			const geos = { '1': plankGeometry(w, h, 0.07, 1), '-1': plankGeometry(w, h, 0.07, -1) };
			const mat = signMaterial(sign, kit.theme.night ? 0.32 : 0.12);
			const mesh = new THREE.Mesh(geos['1'], [mat, this.edgeMat]);
			mesh.castShadow = true;
			this.group.add(mesh);
			this.arrows.push({ mesh, sign, geos, w, h });
			this.disposables.push(sign, geos['1'], geos['-1'], mat);
		}
	}

	/** Point the arrows toward the trail (dir is +1 = the camera's right). */
	setDirection(dir: -1 | 1) {
		this.dir = dir;
		const ys = [BOARD_Y + 0.92, BOARD_Y + 1.3];
		const xs = [0.3, 0.45];
		this.arrows.forEach((a, i) => {
			a.mesh.geometry = a.geos[String(dir) as '1' | '-1'];
			a.mesh.position.set(dir * xs[i], ys[i], 0.3 - i * 0.04);
			a.mesh.rotation.z = dir * (i === 0 ? 0.03 : -0.04);
		});
	}

	setQueue(onDeck: string | undefined, inTheHole: string | undefined) {
		const entries = [
			['ON DECK', onDeck],
			['IN THE HOLE', inTheHole]
		] as const;
		this.arrows.forEach((a, i) => {
			const [label, name] = entries[i];
			a.mesh.visible = !!name;
			if (!name) return;
			a.sign.draw({
				seed: 40 + i,
				wood: '#b0804c',
				arrow: this.dir,
				margin: 0.05,
				lines: [
					{
						text: `${label}  ·  ${name.toUpperCase()}`,
						font: FONT_DISPLAY,
						size: 0.46,
						y: 0.53,
						spacing: 1
					}
				]
			});
		});
	}

	setPlanks(specs: PlankSpec[], portrait: boolean) {
		const key = JSON.stringify({ specs, portrait });
		if (key === this.layoutKey) return;
		this.layoutKey = key;

		for (const p of this.planks) this.group.remove(p.pivot);
		for (const d of this.plankDisposables) d.dispose();
		this.plankDisposables = [];
		this.planks = [];

		const cols = portrait ? 2 : specs.length;
		const gap = 0.08;
		const w = portrait ? (BOARD_W - gap) / 2 : Math.min(0.78, (3.3 - gap * (cols - 1)) / cols);
		const h = portrait ? 0.4 : 0.38;
		const rowGap = 0.1;
		const pivotY = BOARD_Y - BOARD_H / 2 + 0.04;
		const rows = Math.ceil(specs.length / cols);

		specs.forEach((spec, i) => {
			const row = Math.floor(i / cols);
			const inRow = Math.min(cols, specs.length - row * cols);
			const col = i % cols;
			// A lone plank on the last row spans the full width.
			const pw = portrait && inRow === 1 ? BOARD_W : w;
			const rowWidth = inRow * pw + (inRow - 1) * gap;
			const x = -rowWidth / 2 + pw / 2 + col * (pw + gap);
			const drop = 0.22 + row * (h + rowGap);

			const sign = new SignCanvas(pw, h, this.anisotropy);
			sign.draw({
				seed: 90 + i,
				wood: WOOD,
				paint: spec.paint,
				margin: 0.1,
				lines: spec.lines
			});
			const geo = plankGeometry(pw, h, 0.06);
			const glow = (this.kit.theme.night ? 0.3 : 0.1) * (spec.enabled ? 1 : 0.35);
			const material = signMaterial(sign, glow);
			if (!spec.enabled) material.color.setScalar(0.45);
			this.plankDisposables.push(sign, geo, material);

			const pivot = new THREE.Group();
			pivot.position.set(x, pivotY, 0.36 + 0.07 + row * 0.03);
			const mesh = new THREE.Mesh(geo, [material, this.edgeMat]);
			mesh.position.y = -drop - h / 2;
			mesh.castShadow = true;
			mesh.userData.action = spec.action;
			pivot.add(mesh);
			for (const s of [-1, 1]) {
				const rx = s * (pw / 2 - Math.min(0.1, pw * 0.15));
				const r = rope(
					new THREE.Vector3(rx, 0, -0.01),
					new THREE.Vector3(rx, -drop, -0.01),
					this.ropeMat
				);
				this.plankDisposables.push(r.geometry);
				pivot.add(r);
			}
			this.group.add(pivot);
			this.planks.push({
				action: spec.action,
				pivot,
				mesh,
				material,
				baseGlow: glow,
				enabled: spec.enabled,
				hover: 0,
				kick: 0,
				kickVel: 0
			});
		});

		const bottomLocal = -(0.22 + (rows - 1) * (h + rowGap) + h) + (pivotY - BOARD_Y);
		const planksHalfW = portrait ? BOARD_W / 2 : (cols * w + (cols - 1) * gap) / 2;
		this.bounds = { halfW: Math.max(planksHalfW, 1.3), top: 1.45, bottom: bottomLocal };
	}

	setProgress(p: number | null) {
		this.progress = p;
	}

	press(plank: Plank) {
		plank.kickVel -= 2.2;
	}

	/** Swing the planks in from above when arriving at a new tree. */
	show() {
		this.group.visible = true;
		this.shown = 0;
		this.drop = 0;
	}

	hide() {
		this.group.visible = false;
	}

	update(dt: number, t: number, hovered: Plank | null) {
		if (!this.group.visible) return;
		this.shown = Math.min(1, this.shown + dt * 1.6);
		this.drop = this.shown;

		// Timer fill
		if (this.progress === null) {
			const span = 0.35;
			const x = (Math.sin(t * 1.6) * 0.5 + 0.5) * (1.88 - span);
			this.fill.position.x = -0.94 + x;
			this.fill.scale.x = span;
			this.fillMat.emissiveIntensity = 0.55;
		} else {
			this.fill.position.x = -0.94;
			const target = Math.max(0.0001, this.progress * 1.88);
			this.fill.scale.x += (target - this.fill.scale.x) * Math.min(1, dt * 6);
			// Gently pulse once time is up
			this.fillMat.emissiveIntensity =
				this.progress >= 1 ? 0.55 + 0.45 * Math.sin(t * 5) ** 2 : 0.55;
		}

		this.planks.forEach((p, i) => {
			const target = p === hovered && p.enabled ? 1 : 0;
			p.hover += (target - p.hover) * Math.min(1, dt * 12);
			// Damped spring for presses
			p.kickVel += (-p.kick * 60 - p.kickVel * 9) * dt;
			p.kick += p.kickVel * dt;
			// Arrival: drop in from above with a little overshoot
			const e = 1 - (1 - this.drop) ** 3;
			const settle = Math.sin(this.drop * Math.PI * 2.5) * (1 - this.drop) * 0.4;
			p.pivot.rotation.x = Math.sin(t * 1.3 + i * 1.7) * 0.03 + p.kick + settle - p.hover * 0.12;
			p.pivot.rotation.z = Math.sin(t * 0.9 + i) * 0.015;
			p.pivot.scale.setScalar(0.001 + e * 0.999);
			p.mesh.position.z = p.hover * 0.05;
			p.material.emissiveIntensity = p.baseGlow + p.hover * 0.22;
		});
	}

	dispose() {
		for (const d of [...this.disposables, ...this.plankDisposables]) d.dispose();
	}
}

// ---------- The scene ----------

export class ForestScene {
	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera: THREE.PerspectiveCamera;
	private kit: Kit;
	private theme: ForestTheme;
	private sun: THREE.DirectionalLight;
	private fill: THREE.DirectionalLight;
	private sunDir: THREE.Vector3;
	private sky: THREE.Mesh;
	private rainbow: THREE.Mesh | null = null;
	private particles: Particles | null = null;
	private fireworks: Fireworks | null = null;
	private lanternLight: THREE.PointLight | null = null;
	private chunks = new Map<number, THREE.Group>();
	private stations = new Map<number, Station>();
	private controls: Controls;
	private finishArch: THREE.Group;
	private campfire: Campfire;
	private disposables: { dispose(): void }[] = [];
	private anchor: Anchor = { kind: 'trailhead' };
	private trip: Trip | null = null;
	private look = new THREE.Vector3();
	private pointer = new THREE.Vector2(0, 0);
	private pointerSmooth = new THREE.Vector2(0, 0);
	private raycaster = new THREE.Raycaster();
	private hovered: Plank | null = null;
	private pressed: Plank | null = null;
	private step = 0;
	private lastTime = performance.now();
	private elapsed = 0;
	private resizeObserver: ResizeObserver;
	private anisotropy: number;
	private names: string[] = [];
	private canPrevious = false;
	private disposed = false;

	constructor(
		private container: HTMLElement,
		private opts: ForestOptions
	) {
		this.theme = FOREST_THEMES[opts.theme] ?? FOREST_THEMES.standard;
		const theme = this.theme;
		const coarse = matchMedia('(pointer: coarse)').matches;
		const quality = coarse || Math.min(innerWidth, innerHeight) < 600 ? 0.6 : 1;

		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			powerPreference: 'high-performance'
		});
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.75 : 2));
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.toneMapping = THREE.NeutralToneMapping;
		this.renderer.toneMappingExposure = theme.night ? 1.15 : 1.0;
		this.renderer.domElement.style.display = 'block';
		this.renderer.domElement.style.touchAction = 'none';
		container.appendChild(this.renderer.domElement);
		this.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

		this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 600);
		this.scene.fog = new THREE.Fog(theme.skyHorizon, theme.fogNear, theme.fogFar);
		this.scene.background = new THREE.Color(theme.skyHorizon);

		this.kit = createKit(theme, quality);

		// Sky & light
		this.sky = createSky(theme);
		this.scene.add(this.sky);
		this.disposables.push(this.sky.geometry, this.sky.material as THREE.Material);
		this.sunDir = sunDirection(theme);

		this.scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity));
		this.sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
		this.sun.castShadow = true;
		const size = quality < 1 ? 1024 : 2048;
		this.sun.shadow.mapSize.set(size, size);
		const sc = this.sun.shadow.camera;
		sc.left = -34;
		sc.right = 34;
		sc.top = 34;
		sc.bottom = -34;
		sc.near = 1;
		sc.far = 220;
		this.sun.shadow.bias = -0.0004;
		this.sun.shadow.normalBias = 0.04;
		this.scene.add(this.sun, this.sun.target);

		// A soft light from the viewer so sign faces read even when backlit
		this.fill = new THREE.DirectionalLight(
			theme.night ? '#c8d0ff' : '#fff4e6',
			theme.night ? 0.45 : 0.7
		);
		this.scene.add(this.fill, this.fill.target);

		if (theme.night) {
			this.lanternLight = new THREE.PointLight('#ffb35a', 6, 9, 1.6);
			this.scene.add(this.lanternLight);
		}

		if (theme.rainbow) {
			this.rainbow = createRainbow();
			this.scene.add(this.rainbow);
			this.disposables.push(this.rainbow.geometry, this.rainbow.material as THREE.Material);
		}
		if (theme.particles && !opts.reducedMotion) {
			const count = Math.round(theme.particles.count * (quality < 1 ? 0.6 : 1));
			this.particles = new Particles(
				theme.particles.kind,
				theme.particles.colors,
				count,
				this.kit.geo.leaf
			);
			this.scene.add(this.particles.mesh);
		}
		if (theme.fireworks && !opts.reducedMotion) {
			this.fireworks = new Fireworks();
			this.scene.add(this.fireworks.group);
		}

		// Trailhead
		const trailhead = buildArch(
			this.kit,
			{
				seed: 3,
				wood: WOOD,
				lines: [
					{ text: 'TRAILHEAD', font: `700 ${FONT_MONO}`, size: 0.15, y: 0.22, spacing: 10 },
					{ text: opts.standupName.toUpperCase(), font: FONT_DISPLAY, size: 0.4, y: 0.6 }
				]
			},
			this.anisotropy,
			this.disposables
		);
		placeOnTrail(trailhead, TRAILHEAD_Z);
		this.scene.add(trailhead);

		// Finish line (moved as the lineup changes)
		this.finishArch = buildArch(
			this.kit,
			{
				seed: 5,
				wood: WOOD,
				lines: [
					{ text: 'END OF THE TRAIL', font: `700 ${FONT_MONO}`, size: 0.15, y: 0.22, spacing: 8 },
					{ text: 'STANDUP COMPLETE', font: FONT_DISPLAY, size: 0.36, y: 0.6 }
				]
			},
			this.anisotropy,
			this.disposables
		);
		this.scene.add(this.finishArch);
		this.campfire = new Campfire(this.kit);
		this.disposables.push(this.campfire);
		this.scene.add(this.campfire.group);

		this.controls = new Controls(this.kit, opts.accent, this.anisotropy);
		this.disposables.push(this.controls);
		this.controls.hide();
		this.scene.add(this.controls.group);

		// Start at the trailhead
		const pose = this.anchorPose(this.anchor);
		this.camera.position.copy(pose.pos);
		this.look.copy(pose.look);
		this.updateChunks();

		// Events
		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(container);
		this.resize();
		const el = this.renderer.domElement;
		el.addEventListener('pointermove', this.onPointerMove);
		el.addEventListener('pointerdown', this.onPointerDown);
		el.addEventListener('pointerup', this.onPointerUp);
		el.addEventListener('pointerleave', this.onPointerLeave);

		this.renderer.setAnimationLoop(this.frame);
	}

	// ----- Public API -----

	/**
	 * Show the lineup: `names[0]` speaks at station `step`, the rest wait at the
	 * stations after it, and the trail ends right after the last one.
	 */
	setLineup(step: number, names: string[], canPrevious: boolean) {
		this.step = step;
		this.names = names;
		this.canPrevious = canPrevious;
		this.ensureStations();

		const labels = ['NOW SPEAKING', 'ON DECK', 'IN THE HOLE'];
		for (const [k, st] of this.stations) {
			const i = k - step;
			if (i < 0) st.setFace(st.name, 'ALREADY SPOKE');
			else if (i < names.length) st.setFace(names[i], labels[i] ?? 'COMING UP');
			else st.setFace(null, '');
		}

		const finishK = step + names.length;
		const fz = stationZ(finishK) - 2;
		placeOnTrail(this.finishArch, fz);
		placeOnTrail(this.campfire.group, fz - 7);

		this.controls.setDirection(stationSide(step) === -1 ? 1 : -1);
		this.controls.setQueue(names[1], names[2]);
		this.layoutPlanks();
	}

	/** Walk to speaker station k. Resolves on arrival. */
	goToStation(k: number): Promise<void> {
		return this.travel({ kind: 'station', k });
	}

	/** Walk to the end of the trail (call setLineup with no names first). */
	goToFinish(): Promise<void> {
		return this.travel({ kind: 'finish', k: this.step });
	}

	/** Timer progress 0–1, or null for an untimed (indeterminate) standup. */
	setProgress(p: number | null) {
		this.controls.setProgress(p);
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.renderer.setAnimationLoop(null);
		this.resizeObserver.disconnect();
		const el = this.renderer.domElement;
		el.removeEventListener('pointermove', this.onPointerMove);
		el.removeEventListener('pointerdown', this.onPointerDown);
		el.removeEventListener('pointerup', this.onPointerUp);
		el.removeEventListener('pointerleave', this.onPointerLeave);
		this.trip?.resolve();
		for (const [, c] of this.chunks) disposeChunk(this.kit, c);
		for (const [, s] of this.stations) s.dispose();
		for (const d of this.disposables) d.dispose();
		this.particles?.dispose();
		this.fireworks?.dispose();
		this.kit.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}

	// ----- Layout & camera -----

	private get portrait() {
		return this.camera.aspect < 1;
	}

	private layoutPlanks() {
		const n = this.names.length;
		const specs: PlankSpec[] = [
			{
				action: 'previous',
				enabled: this.canPrevious,
				lines: [{ text: '◀ BACK', font: FONT_DISPLAY, size: 0.42, y: 0.54 }]
			}
		];
		if (n > 1) {
			specs.push({
				action: 'yeet',
				enabled: true,
				paint: '#ffc900',
				lines: [{ text: 'YEET 🚀', font: FONT_DISPLAY, size: 0.42, y: 0.54 }]
			});
		}
		specs.push(
			{
				action: 'bij',
				enabled: true,
				paint: '#ff6b6b',
				lines: [
					{ text: 'EXPERIENCE', font: `700 ${FONT_MONO}`, size: 0.2, y: 0.3, spacing: 2 },
					{ text: 'BIJ!', font: FONT_DISPLAY, size: 0.38, y: 0.66 }
				]
			},
			{
				action: 'next',
				enabled: true,
				paint: this.opts.accent,
				lines: [{ text: n <= 1 ? 'FINISH ▶' : 'NEXT ▶', font: FONT_DISPLAY, size: 0.42, y: 0.54 }]
			}
		);
		this.controls.setPlanks(specs, this.portrait);
	}

	/** How far back to stand to fit a box of half-width hw and half-height hh. */
	private fitDistance(hw: number, hh: number, min: number) {
		const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
		return Math.max(min, (hw * 1.2) / (tan * this.camera.aspect), (hh * 1.45) / tan);
	}

	private anchorPose(a: Anchor): Pose {
		if (a.kind === 'station') {
			const st = this.stations.get(a.k);
			const b = this.controls.bounds;
			const frame = st?.frame ?? this.fallbackFrame(a.k);
			frame.updateMatrixWorld();
			const centerY = BOARD_Y + (b.top + b.bottom) / 2;
			const look = frame.localToWorld(new THREE.Vector3(0, centerY, 0.36));
			const normal = _v2.set(0, 0, 1).transformDirection(frame.matrixWorld).setY(0).normalize();
			const dist = this.fitDistance(b.halfW + 0.15, (b.top - b.bottom) / 2, 4.6);
			const pos = look.clone().addScaledVector(normal, dist);
			const ground = terrainHeight(pos.x, pos.z) - 0.1 * pathMask(pos.x, pos.z);
			pos.y = Math.max(ground + EYE, look.y - dist * 0.14);
			return { pos, look };
		}
		const z = a.kind === 'trailhead' ? TRAILHEAD_Z : stationZ(a.k) - 2;
		const x = pathX(z);
		const look = new THREE.Vector3(x, terrainHeight(x, z) + 3.1, z);
		const dist = this.fitDistance(3.2, 2.6, 7.5);
		const pos = trailEye(z + dist);
		pos.y += 0.3;
		return { pos, look };
	}

	private fallbackFrame(k: number) {
		const o = new THREE.Object3D();
		const zs = stationZ(k);
		const x = pathX(zs) + stationSide(k) * SIGN_TREE_OFFSET;
		o.position.set(x, terrainHeight(x, zs), zs);
		const f = trailEye(zs + 5);
		o.lookAt(f.x, o.position.y, f.z);
		return o;
	}

	private travel(to: Anchor): Promise<void> {
		this.trip?.resolve();
		this.controls.hide();
		this.hovered = null;
		this.renderer.domElement.style.cursor = '';

		const toPose = this.anchorPose(to);
		const fromPos = this.camera.position.clone();
		const forward = toPose.pos.z < fromPos.z;
		const dist = Math.abs(toPose.pos.z - fromPos.z);
		this.updateChunks(toPose.pos.z);

		const per = this.opts.walkSeconds;
		const duration = this.opts.reducedMotion
			? Math.min(0.6, per)
			: Math.max(per * 0.45, (dist / STATION_SPACING) * per);
		return new Promise((resolve) => {
			this.trip = {
				to,
				fromPos,
				fromLook: this.look.clone(),
				fromOffset: fromPos.clone().sub(trailEye(fromPos.z)),
				forward,
				t: 0,
				duration,
				resolve
			};
		});
	}

	private arrive(to: Anchor) {
		this.anchor = to;
		if (to.kind === 'station') {
			const st = this.stations.get(to.k);
			if (st) {
				st.frame.add(this.controls.group);
				this.controls.show();
				if (this.lanternLight) this.lanternLight.position.copy(st.lanternPos);
			}
		}
	}

	private updateCamera(dt: number, t: number) {
		const trip = this.trip;
		if (trip) {
			trip.t = Math.min(1, trip.t + dt / trip.duration);
			const e = easeInOut(trip.t);
			const toPose = this.anchorPose(trip.to);
			const z = THREE.MathUtils.lerp(trip.fromPos.z, toPose.pos.z, e);
			const toOffset = toPose.pos.clone().sub(trailEye(toPose.pos.z));
			const offset = trip.fromOffset.clone().lerp(toOffset, e);
			const pos = trailEye(z).add(offset);
			// Footsteps
			const walk = Math.sin(trip.t * Math.PI);
			if (!this.opts.reducedMotion) {
				pos.y += Math.sin(trip.t * trip.duration * 8.5) * 0.045 * walk;
				pos.x += Math.sin(trip.t * trip.duration * 4.25) * 0.03 * walk;
			}
			this.camera.position.copy(pos);

			if (trip.forward) {
				const ahead = trailEye(z - 10).setY(trailEye(z - 10).y - 0.25);
				const wFrom = 1 - smoothstep(0, 0.3, trip.t);
				const wTo = smoothstep(0.6, 1, trip.t);
				this.look
					.copy(ahead)
					.multiplyScalar(1 - wFrom - wTo)
					.addScaledVector(trip.fromLook, wFrom)
					.addScaledVector(toPose.look, wTo);
			} else {
				this.look.copy(trip.fromLook).lerp(toPose.look, e);
			}

			if (trip.t >= 1) {
				this.trip = null;
				this.arrive(trip.to);
				trip.resolve();
			}
		} else {
			const pose = this.anchorPose(this.anchor);
			const k = 1 - Math.exp(-dt * 5);
			this.camera.position.lerp(pose.pos, k);
			this.look.lerp(pose.look, k);
			if (!this.opts.reducedMotion) this.camera.position.y += Math.sin(t * 0.9) * 0.012;
		}

		// A little parallax from the pointer
		this.pointerSmooth.lerp(this.pointer, Math.min(1, dt * 3));
		const right = _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
		const target = _v2
			.copy(this.look)
			.addScaledVector(right, this.pointerSmooth.x * 0.25)
			.add(new THREE.Vector3(0, this.pointerSmooth.y * 0.15, 0));
		this.camera.lookAt(target);
	}

	// ----- World management -----

	private updateChunks(alsoZ?: number) {
		const z = this.camera.position.z;
		const lo = Math.min(z, alsoZ ?? z);
		const hi = Math.max(z, alsoZ ?? z);
		const first = chunkIndex(hi + 30);
		const last = chunkIndex(lo - 150);
		for (let c = first; c <= last; c++) {
			if (!this.chunks.has(c)) {
				const chunk = buildChunk(this.kit, c);
				this.chunks.set(c, chunk);
				this.scene.add(chunk);
			}
		}
		for (const [c, chunk] of this.chunks) {
			if (c < first - 1 || c > last + 1) {
				this.scene.remove(chunk);
				disposeChunk(this.kit, chunk);
				this.chunks.delete(c);
			}
		}
	}

	private ensureStations() {
		const lo = Math.max(0, this.step - 2);
		const hi = this.step + 6;
		for (let k = lo; k <= hi; k++) {
			if (!this.stations.has(k)) {
				const st = new Station(this.kit, k, this.anisotropy);
				this.stations.set(k, st);
				this.scene.add(st.group);
			}
		}
		for (const [k, st] of this.stations) {
			if (k < lo - 1 || k > hi + 1) {
				if (this.controls.group.parent === st.frame) this.scene.add(this.controls.group);
				this.scene.remove(st.group);
				st.dispose();
				this.stations.delete(k);
			}
		}
	}

	// ----- Input -----

	private setPointer(e: PointerEvent) {
		const rect = this.renderer.domElement.getBoundingClientRect();
		this.pointer.set(
			((e.clientX - rect.left) / rect.width) * 2 - 1,
			-((e.clientY - rect.top) / rect.height) * 2 + 1
		);
	}

	private pick(): Plank | null {
		if (this.trip || !this.controls.group.visible) return null;
		this.raycaster.setFromCamera(this.pointer, this.camera);
		const hits = this.raycaster.intersectObjects(
			this.controls.planks.map((p) => p.mesh),
			false
		);
		const hit = hits[0]?.object;
		return this.controls.planks.find((p) => p.mesh === hit) ?? null;
	}

	private onPointerMove = (e: PointerEvent) => {
		this.setPointer(e);
		this.hovered = this.pick();
		this.renderer.domElement.style.cursor = this.hovered?.enabled ? 'pointer' : '';
	};

	private onPointerDown = (e: PointerEvent) => {
		this.setPointer(e);
		this.pressed = this.pick();
		this.hovered = this.pressed;
	};

	private onPointerUp = (e: PointerEvent) => {
		this.setPointer(e);
		const plank = this.pick();
		if (plank && plank === this.pressed && plank.enabled) {
			this.controls.press(plank);
			this.opts.onAction(plank.action);
		}
		this.pressed = null;
		// Touch has no hover; don't leave a plank lit after a tap.
		if (e.pointerType !== 'mouse') {
			this.hovered = null;
			this.pointer.set(0, 0);
		}
	};

	private onPointerLeave = () => {
		this.hovered = null;
		this.pointer.set(0, 0);
	};

	private resize() {
		const w = this.container.clientWidth;
		const h = this.container.clientHeight;
		if (!w || !h) return;
		this.renderer.setSize(w, h);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.layoutPlanks();
	}

	// ----- Frame loop -----

	private frame = () => {
		const now = performance.now();
		const dt = Math.min(0.05, (now - this.lastTime) / 1000);
		this.lastTime = now;
		this.elapsed += dt;
		const t = this.elapsed;
		this.kit.time.value = t;

		this.updateCamera(dt, t);

		const cam = this.camera.position;
		const forward = _v.set(0, 0, -1).applyQuaternion(this.camera.quaternion).setY(0).normalize();

		// Sky dome & sky objects ride with the camera
		this.sky.position.copy(cam);
		if (this.rainbow) {
			this.rainbow.position
				.copy(cam)
				.addScaledVector(forward, 260)
				.add(new THREE.Vector3(-60, -25, 0));
			this.rainbow.lookAt(cam.x, this.rainbow.position.y, cam.z);
		}

		// Shadows follow the area in front of the camera
		const focus = new THREE.Vector3().copy(cam).addScaledVector(forward, 14);
		this.sun.target.position.copy(focus);
		this.sun.position.copy(focus).addScaledVector(this.sunDir, 100);
		this.fill.position.copy(cam).add(new THREE.Vector3(0, 2, 0));
		this.fill.target.position.copy(this.look);

		this.particles?.update(dt, t, cam);
		this.fireworks?.update(dt, cam, forward);
		this.campfire.update(t);
		if (this.lanternLight)
			this.lanternLight.intensity = 5 + 0.8 * Math.sin(t * 11) * Math.sin(t * 6.7);
		this.controls.update(dt, t, this.hovered);

		this.renderer.render(this.scene, this.camera);
	};
}
