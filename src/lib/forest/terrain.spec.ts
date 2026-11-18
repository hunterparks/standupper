import { describe, expect, it } from 'vitest';
import {
	isPlantable,
	PATH_HALF_WIDTH,
	pathX,
	rng,
	SIGN_TREE_OFFSET,
	stationSide,
	stationZ,
	TRAILHEAD_Z
} from './terrain.ts';

describe('forest layout', () => {
	it('spaces stations down the trail and alternates sides', () => {
		expect(stationZ(1)).toBeLessThan(stationZ(0));
		expect(stationZ(0)).toBeLessThan(TRAILHEAD_Z);
		expect(stationSide(0)).toBe(-stationSide(1));
	});

	it('never plants trees on the trail', () => {
		for (let z = -10; z > -600; z -= 1.7) {
			expect(isPlantable(pathX(z), z)).toBe(false);
			expect(isPlantable(pathX(z) + PATH_HALF_WIDTH + 0.5, z)).toBe(false);
		}
	});

	it('keeps a clearing around every sign tree', () => {
		for (let k = 0; k < 30; k++) {
			const z = stationZ(k);
			const x = pathX(z) + stationSide(k) * SIGN_TREE_OFFSET;
			for (const [dx, dz] of [
				[0, 0],
				[1.5, 2],
				[-1.5, -3]
			]) {
				expect(isPlantable(x + dx, z + dz)).toBe(false);
			}
		}
	});

	it('still plants the deep woods', () => {
		const z = stationZ(3) - 13;
		expect(isPlantable(pathX(z) + 20, z)).toBe(true);
	});

	it('has a deterministic RNG', () => {
		const a = rng(42);
		const b = rng(42);
		const xs = Array.from({ length: 5 }, a);
		expect(Array.from({ length: 5 }, b)).toEqual(xs);
		for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
	});
});
