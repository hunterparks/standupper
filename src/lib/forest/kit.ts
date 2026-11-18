import * as THREE from 'three';
import type { ForestTheme } from './forestThemes.ts';

// Shared geometries and materials for everything the forest instances. One
// Kit per scene; chunks and stations borrow from it and never dispose it.

export interface Kit {
	theme: ForestTheme;
	/** 0.5 (phones) to 1 (desktop): scales instance counts. */
	quality: number;
	time: { value: number };
	geo: {
		/** Unit tapered cylinder, base at y = 0, height 1, bottom radius 1. */
		wood: THREE.BufferGeometry;
		blob: THREE.BufferGeometry;
		cone: THREE.BufferGeometry;
		leaf: THREE.BufferGeometry;
		rock: THREE.BufferGeometry;
		stem: THREE.BufferGeometry;
		cap: THREE.BufferGeometry;
		flower: THREE.BufferGeometry;
		clover: THREE.BufferGeometry;
		pumpkin: THREE.BufferGeometry;
		hay: THREE.BufferGeometry;
		flame: THREE.BufferGeometry;
		grass: THREE.BufferGeometry;
	};
	mat: {
		bark: THREE.MeshStandardMaterial;
		foliage: THREE.MeshStandardMaterial;
		snow: THREE.MeshStandardMaterial;
		leaf: THREE.MeshStandardMaterial;
		rock: THREE.MeshStandardMaterial;
		plain: THREE.MeshStandardMaterial;
		pumpkin: THREE.MeshStandardMaterial;
		glow: THREE.MeshBasicMaterial;
		ground: THREE.MeshStandardMaterial;
		grass: THREE.MeshStandardMaterial;
	};
	dispose(): void;
}

/** A small maple-ish leaf lying in the XZ plane, about 1 unit across. */
function leafGeometry(): THREE.BufferGeometry {
	const s = new THREE.Shape();
	const n = 40;
	for (let i = 0; i <= n; i++) {
		const a = (i / n) * Math.PI * 2;
		// Five lobes, a notch at the stem
		const lobes = 0.62 + 0.38 * Math.abs(Math.cos(a * 2.5)) ** 0.7;
		const notch = 1 - 0.35 * Math.exp(-((a - Math.PI * 1.5) ** 2) * 18);
		const r = 0.5 * lobes * notch;
		const x = Math.cos(a) * r;
		const y = Math.sin(a) * r;
		if (i === 0) s.moveTo(x, y);
		else s.lineTo(x, y);
	}
	const geo = new THREE.ShapeGeometry(s);
	geo.rotateX(-Math.PI / 2);
	return geo;
}

function pumpkinGeometry(): THREE.BufferGeometry {
	const geo = new THREE.SphereGeometry(0.5, 20, 12);
	const p = geo.attributes.position;
	const v = new THREE.Vector3();
	for (let i = 0; i < p.count; i++) {
		v.fromBufferAttribute(p, i);
		const a = Math.atan2(v.z, v.x);
		const rib = 1 - 0.07 * Math.abs(Math.sin(a * 4));
		v.x *= rib * 1.15;
		v.z *= rib * 1.15;
		v.y *= 0.78;
		// Dimple at the top
		if (v.y > 0.3) v.y -= (v.y - 0.3) * 0.6;
		p.setXYZ(i, v.x, v.y, v.z);
	}
	geo.translate(0, 0.36, 0);
	geo.computeVertexNormals();
	return geo;
}

/** Gentle wind sway for canopies, keyed off each instance's position. */
function addSway(mat: THREE.Material, time: { value: number }, amount: number) {
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = time;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nuniform float uTime;')
			.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
				#ifdef USE_INSTANCING
					vec3 swayOrigin = instanceMatrix[3].xyz;
					float swayPhase = uTime * 1.1 + swayOrigin.x * 0.21 + swayOrigin.z * 0.17;
					float sway = sin(swayPhase) + 0.4 * sin(swayPhase * 2.3 + 1.7);
					transformed.x += sway * ${amount.toFixed(3)} * (position.y + 0.6);
					transformed.z += cos(swayPhase * 0.8) * ${(amount * 0.6).toFixed(3)} * (position.y + 0.6);
				#endif`
			);
	};
	mat.customProgramCacheKey = () => `sway${amount}`;
}

export function createKit(theme: ForestTheme, quality: number): Kit {
	const time = { value: 0 };

	const wood = new THREE.CylinderGeometry(0.62, 1, 1, 7, 1);
	wood.translate(0, 0.5, 0);

	const blob = new THREE.IcosahedronGeometry(1, 1);
	// Lumpy, so clusters of blobs read as foliage rather than balls.
	{
		const p = blob.attributes.position;
		const v = new THREE.Vector3();
		for (let i = 0; i < p.count; i++) {
			v.fromBufferAttribute(p, i);
			const k = 1 + 0.12 * Math.sin(v.x * 5.1 + v.y * 3.7) * Math.cos(v.z * 4.3);
			p.setXYZ(i, v.x * k, v.y * k, v.z * k);
		}
		blob.computeVertexNormals();
	}

	const cone = new THREE.ConeGeometry(1, 1, 8, 1);
	cone.translate(0, 0.5, 0);

	const rock = new THREE.DodecahedronGeometry(1, 0);
	const stem = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
	stem.translate(0, 0.5, 0);
	const cap = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
	const flower = new THREE.IcosahedronGeometry(1, 0);
	const clover = new THREE.SphereGeometry(1, 6, 4);
	const hay = new THREE.BoxGeometry(1, 1, 1);
	hay.translate(0, 0.5, 0);
	const flame = new THREE.ConeGeometry(1, 1, 6, 1);
	flame.translate(0, 0.5, 0);
	const grass = new THREE.ConeGeometry(1, 1, 3, 1);
	grass.translate(0, 0.5, 0);

	const flat = { flatShading: true, roughness: 0.9, metalness: 0 };
	const foliage = new THREE.MeshStandardMaterial({ ...flat, roughness: 0.8 });
	addSway(foliage, time, 0.05);
	const grassMat = new THREE.MeshStandardMaterial({ ...flat, side: THREE.DoubleSide });
	addSway(grassMat, time, 0.08);

	const mat = {
		bark: new THREE.MeshStandardMaterial({ ...flat, color: theme.bark }),
		foliage,
		snow: new THREE.MeshStandardMaterial({ ...flat, color: '#f6f9ff', roughness: 0.7 }),
		leaf: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }),
		rock: new THREE.MeshStandardMaterial({ ...flat, color: theme.snowy ? '#8b929c' : '#7d7a72' }),
		plain: new THREE.MeshStandardMaterial({ ...flat }),
		pumpkin: new THREE.MeshStandardMaterial({
			roughness: 0.6,
			color: '#e8741c',
			emissive: new THREE.Color(theme.night ? '#ff7a10' : '#000000'),
			emissiveIntensity: theme.night ? 0.9 : 0
		}),
		glow: new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false }),
		ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
		grass: grassMat
	};

	const geo = {
		wood,
		blob,
		cone,
		leaf: leafGeometry(),
		rock,
		stem,
		cap,
		flower,
		clover,
		pumpkin: pumpkinGeometry(),
		hay,
		flame,
		grass
	};

	return {
		theme,
		quality,
		time,
		geo,
		mat,
		dispose() {
			for (const g of Object.values(geo)) g.dispose();
			for (const m of Object.values(mat)) m.dispose();
		}
	};
}
