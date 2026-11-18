import type { ResolvedTheme } from '#lib/types.ts';

// How each site theme dresses the 3D forest. Colors are sRGB hex.

export type ParticleKind = 'leaves' | 'snow' | 'petals' | 'confetti' | 'fireflies' | 'motes';

export type Extra =
	| 'pumpkins' // jack-o'-lanterns when the scene is at night
	| 'mushrooms'
	| 'flowers'
	| 'clover'
	| 'hay'
	| 'candles'
	| 'rocks';

export interface ForestTheme {
	/** Sky gradient, zenith to horizon. Fog uses the horizon color. */
	skyTop: string;
	skyHorizon: string;
	fogNear: number;
	fogFar: number;
	/** Sun (or moon) direction as [azimuth°, elevation°]; azimuth 0 = straight down the trail. */
	sun: [number, number];
	sunColor: string;
	sunIntensity: number;
	/** Glowing disc in the sky (sun, or moon at night). */
	sunDisc: string;
	hemiSky: string;
	hemiGround: string;
	hemiIntensity: number;
	night: boolean;
	/** Ground colors: base, a second tone for patchy variation, and the dirt trail. */
	ground: [string, string];
	trail: string;
	/** Scattered leaves on the forest floor (autumn carpet). Empty for none. */
	groundLeaves: string[];
	/** Tree mix: relative weights for each tree shape. */
	trees: { round: number; conifer: number; bare: number };
	/** Canopy colors for round trees (picked randomly per tree). */
	foliage: string[];
	conifer: string[];
	bark: string;
	snowy: boolean;
	particles: { kind: ParticleKind; colors: string[]; count: number } | null;
	extras: Extra[];
	/** Pennant colors for bunting strung across the trail at each station. */
	bunting: string[] | null;
	fireworks: boolean;
	rainbow: boolean;
	/** Flower colors (for 'flowers', and marigold patches). */
	flowers: string[];
}

const AUTUMN_FOLIAGE = [
	'#d9541e',
	'#e8742a',
	'#f2a03d',
	'#c23b22',
	'#a8341c',
	'#e8b649',
	'#b8652a'
];
const AUTUMN_LEAVES = ['#c9481c', '#e07a2b', '#e9a23b', '#a63a1d', '#8c4a22', '#d8b04a'];

const base: ForestTheme = {
	skyTop: '#5d9bd6',
	skyHorizon: '#cfe3ea',
	fogNear: 18,
	fogFar: 120,
	sun: [-35, 38],
	sunColor: '#fff2d9',
	sunIntensity: 2.6,
	sunDisc: '#fff6dc',
	hemiSky: '#cfe6ff',
	hemiGround: '#4a5a32',
	hemiIntensity: 1.1,
	night: false,
	ground: ['#4f7a34', '#6b8f3a'],
	trail: '#9a7a52',
	groundLeaves: [],
	trees: { round: 6, conifer: 3, bare: 0 },
	foliage: ['#3f7d32', '#4f8f38', '#5f9c3c', '#356b2b'],
	conifer: ['#2c5a33', '#244d2c', '#356638'],
	bark: '#5b4130',
	snowy: false,
	particles: { kind: 'motes', colors: ['#fff6c8'], count: 140 },
	extras: ['rocks', 'mushrooms', 'flowers'],
	bunting: null,
	fireworks: false,
	rainbow: false,
	flowers: ['#ffffff', '#ffd84a', '#c9a0ff']
};

export const FOREST_THEMES: Record<ResolvedTheme, ForestTheme> = {
	standard: base,

	autumn: {
		...base,
		skyTop: '#6f8fc4',
		skyHorizon: '#f6cf9c',
		fogNear: 14,
		fogFar: 105,
		sun: [-30, 16],
		sunColor: '#ffc27a',
		sunIntensity: 3.1,
		sunDisc: '#ffe1a8',
		hemiSky: '#ffd9b0',
		hemiGround: '#6b3a1c',
		hemiIntensity: 1.0,
		ground: ['#7a5a2c', '#8f6a2e'],
		trail: '#a6825a',
		groundLeaves: AUTUMN_LEAVES,
		trees: { round: 8, conifer: 2, bare: 1 },
		foliage: AUTUMN_FOLIAGE,
		conifer: ['#3a5a30', '#2f4d2a'],
		bark: '#4a3326',
		particles: { kind: 'leaves', colors: AUTUMN_LEAVES, count: 260 },
		extras: ['rocks', 'mushrooms', 'pumpkins']
	},

	thanksgiving: {
		...base,
		skyTop: '#7d93b8',
		skyHorizon: '#f2c48f',
		fogNear: 14,
		fogFar: 105,
		sun: [-25, 12],
		sunColor: '#ffb870',
		sunIntensity: 3.0,
		sunDisc: '#ffd79a',
		hemiSky: '#ffd2a8',
		hemiGround: '#5f3418',
		hemiIntensity: 1.0,
		ground: ['#7b5f2f', '#93733a'],
		trail: '#a88655',
		groundLeaves: AUTUMN_LEAVES,
		trees: { round: 8, conifer: 2, bare: 2 },
		foliage: ['#b8461f', '#cf6a28', '#d99a3a', '#8f3a1c', '#a8652a'],
		conifer: ['#3a5a30', '#2f4d2a'],
		bark: '#45301f',
		particles: { kind: 'leaves', colors: AUTUMN_LEAVES, count: 220 },
		extras: ['rocks', 'pumpkins', 'hay']
	},

	halloween: {
		...base,
		skyTop: '#0e0a1f',
		skyHorizon: '#3b2350',
		fogNear: 6,
		fogFar: 70,
		sun: [25, 30],
		sunColor: '#9fb4ff',
		sunIntensity: 0.9,
		sunDisc: '#f3efd8',
		hemiSky: '#5a4a8a',
		hemiGround: '#1a1020',
		hemiIntensity: 0.55,
		night: true,
		ground: ['#2b2430', '#3a2c2a'],
		trail: '#4f4036',
		groundLeaves: ['#5c2a14', '#7a3a18', '#3d2a1c'],
		trees: { round: 2, conifer: 2, bare: 7 },
		foliage: ['#a8461c', '#6b2a14', '#d06a1e'],
		conifer: ['#1c2a22', '#162019'],
		bark: '#231a1c',
		particles: { kind: 'fireflies', colors: ['#a6ff6a', '#ffb347'], count: 90 },
		extras: ['pumpkins', 'rocks', 'mushrooms']
	},

	'day-of-the-dead': {
		...base,
		skyTop: '#3a1e5c',
		skyHorizon: '#f08a5d',
		fogNear: 12,
		fogFar: 90,
		sun: [-20, 6],
		sunColor: '#ff9a5a',
		sunIntensity: 2.2,
		sunDisc: '#ffc28a',
		hemiSky: '#ff9ac8',
		hemiGround: '#3a1a2a',
		hemiIntensity: 0.9,
		night: true,
		ground: ['#4a3a2a', '#5b4430'],
		trail: '#8a6a4a',
		groundLeaves: ['#f59a1a', '#ffb300', '#e8581e'],
		trees: { round: 6, conifer: 2, bare: 2 },
		foliage: ['#2f6b3a', '#3d7a40', '#e8581e', '#c43b8a'],
		conifer: ['#24452c'],
		bark: '#3a2a22',
		particles: { kind: 'petals', colors: ['#ff9a1a', '#ffb300', '#ff6fb5'], count: 160 },
		extras: ['flowers', 'candles', 'rocks'],
		bunting: ['#e5197e', '#ff8a00', '#7c3aed', '#00a9a5', '#ffd400', '#2ecc71'],
		flowers: ['#ff8a00', '#ffb300', '#ff6a00']
	},

	winter: {
		...base,
		skyTop: '#8aa6c4',
		skyHorizon: '#e3ebf2',
		fogNear: 10,
		fogFar: 90,
		sun: [-40, 20],
		sunColor: '#e8f0ff',
		sunIntensity: 2.0,
		sunDisc: '#fbfdff',
		hemiSky: '#e6f0ff',
		hemiGround: '#9fb0c4',
		hemiIntensity: 1.3,
		ground: ['#eef3f8', '#dde6ef'],
		trail: '#c9d2dc',
		trees: { round: 0, conifer: 9, bare: 2 },
		foliage: ['#2b4a3a'],
		conifer: ['#1f4433', '#244d3a', '#2a5641'],
		bark: '#4a3a30',
		snowy: true,
		particles: { kind: 'snow', colors: ['#ffffff'], count: 600 },
		extras: ['rocks']
	},

	'new-year': {
		...base,
		skyTop: '#060a1e',
		skyHorizon: '#1f2a52',
		fogNear: 10,
		fogFar: 85,
		sun: [30, 35],
		sunColor: '#b8c8ff',
		sunIntensity: 0.9,
		sunDisc: '#f5f3e6',
		hemiSky: '#4a5a9a',
		hemiGround: '#2a3048',
		hemiIntensity: 0.7,
		night: true,
		ground: ['#d8e0ec', '#c4cee0'],
		trail: '#a9b2c4',
		trees: { round: 0, conifer: 9, bare: 1 },
		conifer: ['#1a3a2c', '#1f4433'],
		bark: '#3a2e28',
		snowy: true,
		particles: { kind: 'snow', colors: ['#ffffff', '#ffe08a'], count: 350 },
		extras: ['rocks', 'candles'],
		bunting: ['#ffd700', '#f5f5f5', '#c0c0c0'],
		fireworks: true
	},

	valentines: {
		...base,
		skyTop: '#f39ab8',
		skyHorizon: '#ffe0e6',
		fogNear: 16,
		fogFar: 110,
		sun: [-30, 25],
		sunColor: '#ffd8e0',
		sunIntensity: 2.5,
		sunDisc: '#fff0f4',
		hemiSky: '#ffd0dc',
		hemiGround: '#5a3040',
		ground: ['#5f8a45', '#7a9a4a'],
		trail: '#b28a78',
		trees: { round: 8, conifer: 1, bare: 0 },
		foliage: ['#ff8fb1', '#ffb3c8', '#e8577e', '#ffd1dc', '#d63a64'],
		particles: { kind: 'petals', colors: ['#ff8fb1', '#ff4d7a', '#ffd1dc'], count: 240 },
		extras: ['flowers', 'rocks'],
		bunting: ['#e8577e', '#ffffff', '#ff8fb1'],
		flowers: ['#ff4d7a', '#ffffff', '#ff8fb1']
	},

	'st-patricks': {
		...base,
		skyTop: '#4f97d8',
		skyHorizon: '#d8f0e0',
		sun: [-45, 34],
		ground: ['#3f8a3a', '#56a046'],
		trail: '#8e7a52',
		trees: { round: 7, conifer: 3, bare: 0 },
		foliage: ['#2f8a3a', '#3fa047', '#1f7a35', '#5cb85c'],
		conifer: ['#1f5a30', '#22683a'],
		particles: { kind: 'confetti', colors: ['#1f9a4a', '#5cd65c', '#ffd700'], count: 160 },
		extras: ['clover', 'rocks', 'mushrooms'],
		bunting: ['#169b62', '#ffffff', '#ff883e'],
		rainbow: true
	},

	spring: {
		...base,
		skyTop: '#6fb0e8',
		skyHorizon: '#e6f3f0',
		sun: [-30, 40],
		ground: ['#6aa24a', '#86b85a'],
		trail: '#a58c66',
		trees: { round: 8, conifer: 2, bare: 0 },
		foliage: ['#ffc1d9', '#ffd6e6', '#f7a8c8', '#8cc66a', '#a6d47a', '#ffffff'],
		particles: { kind: 'petals', colors: ['#ffc1d9', '#ffe3ee', '#ffffff'], count: 240 },
		extras: ['flowers', 'rocks', 'mushrooms'],
		flowers: ['#ff8fb8', '#ffe066', '#b69cff', '#ffffff', '#7cc6ff']
	},

	'cinco-de-mayo': {
		...base,
		skyTop: '#3f9be0',
		skyHorizon: '#f6e9c8',
		sun: [-30, 42],
		sunColor: '#fff0c8',
		ground: ['#7a8f3a', '#9aa04a'],
		trail: '#c09060',
		trees: { round: 7, conifer: 1, bare: 0 },
		foliage: ['#4f8f38', '#5f9c3c', '#6fa84a', '#3f7d32'],
		particles: {
			kind: 'confetti',
			colors: ['#e5197e', '#ff8a00', '#00a9a5', '#ffd400', '#2ecc71'],
			count: 200
		},
		extras: ['flowers', 'rocks'],
		bunting: ['#e5197e', '#ff8a00', '#7c3aed', '#00a9a5', '#ffd400', '#2ecc71'],
		flowers: ['#ff4d4d', '#ffd400', '#ff8a00']
	},

	usa: {
		...base,
		skyTop: '#1e2a5a',
		skyHorizon: '#e98b6a',
		fogNear: 14,
		fogFar: 100,
		sun: [-20, 5],
		sunColor: '#ffb07a',
		sunIntensity: 2.2,
		sunDisc: '#ffd2a0',
		hemiSky: '#b0a8d8',
		hemiGround: '#2a3020',
		hemiIntensity: 0.85,
		night: true,
		ground: ['#3f6a30', '#4f7a38'],
		trail: '#8a7458',
		trees: { round: 6, conifer: 4, bare: 0 },
		particles: { kind: 'fireflies', colors: ['#fff3a0'], count: 90 },
		extras: ['rocks', 'flowers'],
		bunting: ['#b22234', '#ffffff', '#3c3b6e'],
		fireworks: true,
		flowers: ['#ffffff', '#b22234', '#3c6ee0']
	},

	summer: {
		...base,
		skyTop: '#3b8ee0',
		skyHorizon: '#d6eef5',
		sun: [-25, 55],
		sunColor: '#fff6e0',
		sunIntensity: 3.0,
		ground: ['#4f8a30', '#66a03a'],
		trail: '#b39466',
		trees: { round: 8, conifer: 3, bare: 0 },
		foliage: ['#2f7a2a', '#3f8f30', '#4fa03a', '#2a6a28'],
		particles: { kind: 'motes', colors: ['#fff6c8', '#ffffff'], count: 160 },
		extras: ['flowers', 'rocks', 'mushrooms'],
		flowers: ['#ffd400', '#ff8a3d', '#ffffff', '#ff5a8a']
	}
};
