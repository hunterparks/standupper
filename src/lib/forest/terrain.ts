// Pure math for the 3D standup forest: the meandering path, the terrain
// height field, and deterministic randomness. No three.js in here so the
// layout rules can be unit tested.

/** Distance (world units) between consecutive speaker stations along the path. */
export const STATION_SPACING = 26;
/** z of the first speaker's sign tree. The path runs from z = 0 toward -z. */
export const FIRST_STATION_Z = -26;
/** z of the trailhead arch the camera starts in front of. */
export const TRAILHEAD_Z = -2;
/** Half-width of the trail; nothing is planted inside it. */
export const PATH_HALF_WIDTH = 1.5;
/** How far beside the path centerline each sign tree's trunk stands. */
export const SIGN_TREE_OFFSET = 3.1;

/** z of the sign tree for station k (k = 0 is the first speaker). */
export const stationZ = (k: number) => FIRST_STATION_Z - k * STATION_SPACING;

/** Which side of the path station k's sign tree stands on: -1 left, +1 right. */
export const stationSide = (k: number) => (k % 2 === 0 ? -1 : 1);

/** The path centerline's x for a given z: a few layered sines so it wanders. */
export function pathX(z: number): number {
	return (
		5.5 * Math.sin(z * 0.043) + 2.6 * Math.sin(z * 0.107 + 1.3) + 0.9 * Math.sin(z * 0.23 + 0.4)
	);
}

/** d(pathX)/dz, for orienting things along the path. */
export function pathSlope(z: number): number {
	return (
		5.5 * 0.043 * Math.cos(z * 0.043) +
		2.6 * 0.107 * Math.cos(z * 0.107 + 1.3) +
		0.9 * 0.23 * Math.cos(z * 0.23 + 0.4)
	);
}

/**
 * Ground height. Gentle rolling hills, rising away from the path so the trail
 * sits in a shallow valley (which frames the camera's view nicely).
 */
export function terrainHeight(x: number, z: number): number {
	const dx = x - pathX(z);
	const rolling =
		0.9 * Math.sin(x * 0.06 + z * 0.035) +
		0.6 * Math.sin(z * 0.08 - x * 0.03) * Math.cos(x * 0.05) +
		0.25 * Math.sin(x * 0.21 + z * 0.17);
	const valley = Math.min(dx * dx * 0.0035, 7);
	return rolling + valley;
}

/** How much a point is "on the trail" (1 at the centerline, 0 off it). */
export function pathMask(x: number, z: number): number {
	const d = Math.abs(x - pathX(z));
	// The edge wobbles a little so the trail doesn't look ruled.
	const edge = PATH_HALF_WIDTH + 0.25 * Math.sin(z * 0.9) + 0.15 * Math.sin(z * 2.3 + x);
	return 1 - smoothstep(edge - 0.6, edge + 0.35, d);
}

export function smoothstep(a: number, b: number, x: number): number {
	const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
	return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Deterministic hash noise in [0, 1) for a 2D lattice point. */
export function hash2(x: number, y: number): number {
	let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0, 1). */
export function valueNoise(x: number, y: number): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = x - xi;
	const yf = y - yi;
	const u = xf * xf * (3 - 2 * xf);
	const v = yf * yf * (3 - 2 * yf);
	const a = hash2(xi, yi);
	const b = hash2(xi + 1, yi);
	const c = hash2(xi, yi + 1);
	const d = hash2(xi + 1, yi + 1);
	return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/**
 * Whether a tree may be planted at (x, z): off the trail, and clear of the
 * sign trees, their bunting partners, and the trailhead arch.
 */
export function isPlantable(x: number, z: number, clearance = 0): boolean {
	const dx = x - pathX(z);
	if (Math.abs(dx) < PATH_HALF_WIDTH + 2.2 + clearance) return false;
	// The trailhead arch and the open ground the camera starts on.
	if (z > TRAILHEAD_Z - 4 && Math.abs(dx) < 9) return false;
	// Each station keeps a little clearing around its sign tree and partner.
	const k = Math.round((FIRST_STATION_Z - z) / STATION_SPACING);
	if (k >= 0) {
		const sz = stationZ(k);
		if (Math.abs(z - sz) < 4.5 + clearance && Math.abs(dx) < 7.5) return false;
	}
	return true;
}
