import * as THREE from 'three';
import type { ForestTheme } from './forestThemes.ts';
import { terrainHeight } from './terrain.ts';

// Sky, weather and celebrations. Everything here follows the camera.

export function sunDirection(theme: ForestTheme): THREE.Vector3 {
	const az = THREE.MathUtils.degToRad(theme.sun[0]);
	const el = THREE.MathUtils.degToRad(theme.sun[1]);
	return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export function createSky(theme: ForestTheme): THREE.Mesh {
	const geo = new THREE.SphereGeometry(450, 32, 16);
	const mat = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
		uniforms: {
			top: { value: new THREE.Color(theme.skyTop) },
			horizon: { value: new THREE.Color(theme.skyHorizon) },
			sunDir: { value: sunDirection(theme) },
			sunColor: { value: new THREE.Color(theme.sunDisc) },
			night: { value: theme.night ? 1 : 0 }
		},
		vertexShader: /* glsl */ `
			varying vec3 vDir;
			void main() {
				vDir = position;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 top;
			uniform vec3 horizon;
			uniform vec3 sunDir;
			uniform vec3 sunColor;
			uniform float night;
			varying vec3 vDir;

			float hash(vec3 p) {
				p = fract(p * 0.3183099 + 0.1);
				p *= 17.0;
				return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
			}

			void main() {
				vec3 d = normalize(vDir);
				float h = clamp(d.y, 0.0, 1.0);
				vec3 col = mix(horizon, top, pow(h, 0.55));

				float s = max(dot(d, normalize(sunDir)), 0.0);
				// Moon: small crisp disc and a cool halo. Sun: bigger glow.
				float disc = night > 0.5 ? smoothstep(0.9993, 0.9996, s) : smoothstep(0.9985, 0.9992, s);
				float glow = night > 0.5 ? pow(s, 60.0) * 0.25 : pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.5;
				col += sunColor * (disc * 1.6 + glow);

				if (night > 0.5 && d.y > 0.02) {
					vec3 p = d * 260.0;
					vec3 cell = floor(p);
					float r = hash(cell);
					if (r > 0.985) {
						float twinkle = 0.6 + 0.4 * sin(r * 1000.0);
						float star = smoothstep(0.35, 0.0, length(fract(p) - 0.5));
						col += vec3(star * twinkle * smoothstep(0.02, 0.25, d.y));
					}
				}

				gl_FragColor = vec4(col, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
	const sky = new THREE.Mesh(geo, mat);
	sky.renderOrder = -1;
	sky.frustumCulled = false;
	return sky;
}

export function createRainbow(): THREE.Mesh {
	const geo = new THREE.TorusGeometry(150, 9, 12, 96, Math.PI);
	const mat = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		fog: false,
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			varying vec2 vUv;
			vec3 band(float t) {
				return clamp(abs(mod(t * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
			}
			void main() {
				// v runs around the tube: 0 is the outer rim, 0.25 faces the viewer,
				// 0.5 the inner rim. Red outside, violet inside.
				float across = clamp(vUv.y * 2.0, 0.0, 1.0);
				float alpha = smoothstep(0.0, 0.18, across) * smoothstep(1.0, 0.82, across) * 0.3;
				gl_FragColor = vec4(band(across * 0.8), alpha);
				#include <colorspace_fragment>
			}
		`
	});
	const mesh = new THREE.Mesh(geo, mat);
	mesh.frustumCulled = false;
	return mesh;
}

// ---------- Particles ----------

interface Particle {
	x: number;
	y: number;
	z: number;
	vy: number;
	phase: number;
	sway: number;
	spin: THREE.Vector3;
	rot: THREE.Euler;
	scale: number;
}

const BOX_HALF_X = 20;
const BOX_AHEAD = 34;
const BOX_BEHIND = 6;

export class Particles {
	readonly mesh: THREE.InstancedMesh;
	private parts: Particle[] = [];
	private m = new THREE.Matrix4();
	private q = new THREE.Quaternion();
	private p = new THREE.Vector3();
	private s = new THREE.Vector3();

	constructor(
		private kind: NonNullable<ForestTheme['particles']>['kind'],
		colors: string[],
		count: number,
		leafGeo: THREE.BufferGeometry
	) {
		let geo: THREE.BufferGeometry;
		let mat: THREE.Material;
		const glowy = kind === 'fireflies' || kind === 'motes';
		if (kind === 'leaves') {
			geo = leafGeo;
			mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
		} else if (kind === 'snow') {
			geo = new THREE.IcosahedronGeometry(1, 0);
			mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
		} else if (glowy) {
			geo = new THREE.SphereGeometry(1, 6, 4);
			mat = new THREE.MeshBasicMaterial({
				transparent: true,
				opacity: kind === 'motes' ? 0.45 : 0.95,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				toneMapped: false
			});
		} else {
			// petals & confetti: small flat cards
			geo =
				kind === 'petals'
					? new THREE.CircleGeometry(1, 7).scale(1, 0.65, 1)
					: new THREE.PlaneGeometry(1, 0.55);
			mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 });
		}
		this.mesh = new THREE.InstancedMesh(geo, mat, count);
		this.mesh.frustumCulled = false;
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

		const color = new THREE.Color();
		for (let i = 0; i < count; i++) {
			color.set(colors[i % colors.length]);
			if (kind === 'fireflies') color.multiplyScalar(2.2);
			this.mesh.setColorAt(i, color);
			this.parts.push(this.spawn(0, 0, 0, true));
		}
	}

	private spawn(cx: number, cy: number, cz: number, anywhere: boolean): Particle {
		const k = this.kind;
		const low = k === 'fireflies';
		const top = low ? 3.5 : k === 'motes' ? 6 : 14;
		return {
			x: cx + (Math.random() * 2 - 1) * BOX_HALF_X,
			y: cy + (anywhere || low || k === 'motes' ? Math.random() * top : top + Math.random() * 3),
			z: cz - BOX_AHEAD + Math.random() * (BOX_AHEAD + BOX_BEHIND),
			vy:
				k === 'snow'
					? 0.7 + Math.random() * 0.5
					: k === 'leaves'
						? 0.55 + Math.random() * 0.6
						: k === 'petals'
							? 0.35 + Math.random() * 0.4
							: k === 'confetti'
								? 0.8 + Math.random() * 0.6
								: 0.05 + Math.random() * 0.1,
			phase: Math.random() * Math.PI * 2,
			sway: 0.3 + Math.random() * 0.9,
			spin: new THREE.Vector3(Math.random() * 2.5, Math.random() * 2.5, Math.random() * 2.5),
			rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
			scale:
				k === 'leaves'
					? 0.14 + Math.random() * 0.12
					: k === 'snow'
						? 0.018 + Math.random() * 0.025
						: k === 'petals'
							? 0.05 + Math.random() * 0.04
							: k === 'confetti'
								? 0.06 + Math.random() * 0.04
								: k === 'fireflies'
									? 0.035 + Math.random() * 0.03
									: 0.012 + Math.random() * 0.018
		};
	}

	update(dt: number, t: number, cam: THREE.Vector3) {
		const k = this.kind;
		const baseY = terrainHeight(cam.x, cam.z) - 1;
		for (let i = 0; i < this.parts.length; i++) {
			let p = this.parts[i];
			// Keep particles in a box that travels with the camera.
			if (p.z - cam.z > BOX_BEHIND) p.z -= BOX_AHEAD + BOX_BEHIND;
			else if (cam.z - p.z > BOX_AHEAD) p.z += BOX_AHEAD + BOX_BEHIND;
			if (p.x - cam.x > BOX_HALF_X) p.x -= BOX_HALF_X * 2;
			else if (cam.x - p.x > BOX_HALF_X) p.x += BOX_HALF_X * 2;

			let scale = p.scale;
			if (k === 'fireflies' || k === 'motes') {
				p.x += Math.sin(t * 0.4 + p.phase) * dt * 0.3 * p.sway;
				p.z += Math.cos(t * 0.33 + p.phase * 1.3) * dt * 0.3 * p.sway;
				p.y += Math.sin(t * 0.6 + p.phase * 2) * dt * 0.15 + (k === 'motes' ? p.vy * dt * 0.3 : 0);
				const ground = terrainHeight(p.x, p.z);
				if (k === 'fireflies') {
					p.y = Math.min(Math.max(p.y, ground + 0.3), ground + 3.5);
					// Blink
					const blink = Math.max(0, Math.sin(t * 1.7 + p.phase * 5));
					scale *= 0.2 + blink ** 3 * 1.1;
				} else if (p.y > ground + 7) {
					p.y = ground + 0.5;
				}
			} else {
				p.y -= p.vy * dt;
				const flutter = k === 'snow' ? 0.35 : 1;
				p.x += Math.sin(t * p.sway + p.phase) * dt * 0.6 * flutter + dt * 0.25;
				p.z += Math.cos(t * p.sway * 0.7 + p.phase) * dt * 0.3 * flutter;
				p.rot.x += p.spin.x * dt;
				p.rot.y += p.spin.y * dt;
				p.rot.z += p.spin.z * dt;
				const ground = terrainHeight(p.x, p.z);
				if (p.y < Math.max(ground, baseY) - 0.1) {
					p = this.parts[i] = this.spawn(cam.x, Math.max(cam.y, ground), cam.z, false);
				}
			}

			this.q.setFromEuler(p.rot);
			this.m.compose(this.p.set(p.x, p.y, p.z), this.q, this.s.setScalar(scale));
			this.mesh.setMatrixAt(i, this.m);
		}
		this.mesh.instanceMatrix.needsUpdate = true;
	}

	dispose() {
		if (this.kind !== 'leaves') this.mesh.geometry.dispose();
		(this.mesh.material as THREE.Material).dispose();
		this.mesh.dispose();
	}
}

// ---------- Fireworks ----------

interface Burst {
	points: THREE.Points;
	velocities: Float32Array;
	age: number;
	life: number;
}

const BURST_SIZE = 110;
const FIREWORK_COLORS = [
	'#ff4d4d',
	'#ffd700',
	'#4da6ff',
	'#ffffff',
	'#7CFC00',
	'#ff66cc',
	'#ff9a1a'
];

export class Fireworks {
	readonly group = new THREE.Group();
	private bursts: Burst[] = [];
	private next = 0.5;

	constructor(private colors: string[] = FIREWORK_COLORS) {
		for (let i = 0; i < 7; i++) {
			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_SIZE * 3), 3));
			const mat = new THREE.PointsMaterial({
				size: 0.9,
				transparent: true,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				fog: false,
				toneMapped: false
			});
			const points = new THREE.Points(geo, mat);
			points.visible = false;
			points.frustumCulled = false;
			this.group.add(points);
			this.bursts.push({ points, velocities: new Float32Array(BURST_SIZE * 3), age: 0, life: 0 });
		}
	}

	private launch(cam: THREE.Vector3, forward: THREE.Vector3) {
		const b = this.bursts.find((b) => !b.points.visible);
		if (!b) return;
		const dist = 70 + Math.random() * 40;
		const side = (Math.random() - 0.5) * 90;
		const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
		b.points.position
			.copy(cam)
			.addScaledVector(forward, dist)
			.addScaledVector(right, side)
			.setY(cam.y + 30 + Math.random() * 25);
		(b.points.material as THREE.PointsMaterial).color
			.set(this.colors[Math.floor(Math.random() * this.colors.length)])
			.multiplyScalar(1.8);
		const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
		const speed = 9 + Math.random() * 6;
		for (let i = 0; i < BURST_SIZE; i++) {
			const u = Math.random() * 2 - 1;
			const a = Math.random() * Math.PI * 2;
			const r = Math.sqrt(1 - u * u);
			const s = speed * (0.85 + Math.random() * 0.15);
			b.velocities[i * 3] = r * Math.cos(a) * s;
			b.velocities[i * 3 + 1] = u * s;
			b.velocities[i * 3 + 2] = r * Math.sin(a) * s;
			pos.setXYZ(i, 0, 0, 0);
		}
		pos.needsUpdate = true;
		b.age = 0;
		b.life = 2.2 + Math.random() * 0.8;
		b.points.visible = true;
	}

	update(dt: number, cam: THREE.Vector3, forward: THREE.Vector3) {
		this.next -= dt;
		if (this.next <= 0) {
			this.launch(cam, forward);
			this.next = 0.6 + Math.random() * 1.8;
		}
		for (const b of this.bursts) {
			if (!b.points.visible) continue;
			b.age += dt;
			if (b.age > b.life) {
				b.points.visible = false;
				continue;
			}
			const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
			const drag = Math.exp(-1.6 * dt);
			for (let i = 0; i < BURST_SIZE; i++) {
				b.velocities[i * 3] *= drag;
				b.velocities[i * 3 + 1] = b.velocities[i * 3 + 1] * drag - 3.2 * dt;
				b.velocities[i * 3 + 2] *= drag;
				pos.setXYZ(
					i,
					pos.getX(i) + b.velocities[i * 3] * dt,
					pos.getY(i) + b.velocities[i * 3 + 1] * dt,
					pos.getZ(i) + b.velocities[i * 3 + 2] * dt
				);
			}
			pos.needsUpdate = true;
			const mat = b.points.material as THREE.PointsMaterial;
			mat.opacity = Math.min(1, (1 - b.age / b.life) * 1.6);
		}
	}

	dispose() {
		for (const b of this.bursts) {
			b.points.geometry.dispose();
			(b.points.material as THREE.Material).dispose();
		}
	}
}
