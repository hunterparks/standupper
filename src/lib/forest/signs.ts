import * as THREE from 'three';
import { rng } from './terrain.ts';

// Wooden signs: canvas-painted plank textures with carved lettering, and the
// extruded plank / arrow meshes they go on.

/** Canvas pixels per world unit for sign faces. */
const PX_PER_UNIT = 440;

export const FONT_DISPLAY = '"Archivo Black", "Arial Black", sans-serif';
export const FONT_MONO = '"Space Mono", ui-monospace, monospace';

export interface SignLine {
	text: string;
	font: string;
	/** Max font size as a fraction of the sign height. */
	size: number;
	/** Vertical center as a fraction of the sign height (0 = top). */
	y: number;
	/** Letter spacing in px (canvas letterSpacing). */
	spacing?: number;
}

export interface SignFace {
	lines: SignLine[];
	/** Painted planks get a coat of color over the grain; bare wood otherwise. */
	paint?: string;
	wood?: string;
	ink?: string;
	seed?: number;
	/** Fraction of the width kept clear on each side. */
	margin?: number;
	/** Arrow-shaped sign pointing this way (the point eats into the right/left). */
	arrow?: -1 | 1;
}

export async function loadSignFonts(): Promise<void> {
	if (!('fonts' in document)) return;
	const loads = Promise.all([
		document.fonts.load(`80px ${FONT_DISPLAY}`),
		document.fonts.load(`700 40px ${FONT_MONO}`)
	]);
	// Don't hold the scene hostage to a slow font CDN.
	await Promise.race([loads, new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
}

function shade(hex: string, amount: number): string {
	const c = new THREE.Color(hex);
	const hsl = { h: 0, s: 0, l: 0 };
	c.getHSL(hsl);
	c.setHSL(hsl.h, hsl.s, Math.min(Math.max(hsl.l + amount, 0), 1));
	return `#${c.getHexString()}`;
}

/** A canvas + texture pair sized for a sign of w × h world units, redrawable. */
export class SignCanvas {
	readonly canvas: HTMLCanvasElement;
	readonly texture: THREE.CanvasTexture;
	private ctx: CanvasRenderingContext2D;
	private lastKey = '';

	constructor(
		readonly w: number,
		readonly h: number,
		maxAnisotropy = 4
	) {
		this.canvas = document.createElement('canvas');
		this.canvas.width = Math.round(w * PX_PER_UNIT);
		this.canvas.height = Math.round(h * PX_PER_UNIT);
		this.ctx = this.canvas.getContext('2d')!;
		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.texture.anisotropy = maxAnisotropy;
	}

	draw(face: SignFace): void {
		const key = JSON.stringify(face);
		if (key === this.lastKey) return;
		this.lastKey = key;

		const { ctx, canvas } = this;
		const W = canvas.width;
		const H = canvas.height;
		const rand = rng(face.seed ?? 7);
		const wood = face.wood ?? '#9a6a3f';
		const ink = face.ink ?? '#2a170c';

		// Grain base
		const base = face.paint ?? wood;
		const grad = ctx.createLinearGradient(0, 0, 0, H);
		grad.addColorStop(0, shade(base, 0.04));
		grad.addColorStop(0.5, base);
		grad.addColorStop(1, shade(base, -0.06));
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, W, H);

		// Grain lines: long wavy strokes, darker on bare wood
		ctx.save();
		ctx.globalAlpha = face.paint ? 0.12 : 0.28;
		ctx.strokeStyle = shade(wood, -0.18);
		for (let i = 0; i < Math.round(H / 7); i++) {
			const y0 = rand() * H;
			const amp = 2 + rand() * 6;
			const freq = 0.004 + rand() * 0.01;
			const phase = rand() * 10;
			ctx.lineWidth = 0.6 + rand() * 1.8;
			ctx.beginPath();
			for (let x = 0; x <= W; x += 12) {
				const y = y0 + Math.sin(x * freq + phase) * amp;
				if (x === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();
		}
		// A knot or two
		for (let i = 0; i < 2; i++) {
			if (rand() < 0.4) continue;
			const kx = rand() * W;
			const ky = rand() * H;
			const kr = 6 + rand() * 12;
			for (let r = kr; r > 1; r -= 3) {
				ctx.beginPath();
				ctx.ellipse(kx, ky, r * 1.8, r, 0, 0, Math.PI * 2);
				ctx.stroke();
			}
		}
		ctx.restore();

		// Worn paint: speckle the grain back through near the edges
		if (face.paint) {
			ctx.save();
			ctx.fillStyle = wood;
			for (let i = 0; i < 160; i++) {
				const edge = rand() < 0.5;
				const x = edge ? (rand() < 0.5 ? rand() * W * 0.06 : W - rand() * W * 0.06) : rand() * W;
				const y = edge ? rand() * H : rand() < 0.5 ? rand() * H * 0.1 : H - rand() * H * 0.1;
				ctx.globalAlpha = 0.25 + rand() * 0.4;
				ctx.beginPath();
				ctx.ellipse(x, y, 1 + rand() * 6, 1 + rand() * 3, rand() * 3, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.restore();
		}

		// Darkened, weathered border
		const vignette = ctx.createRadialGradient(
			W / 2,
			H / 2,
			Math.min(W, H) * 0.3,
			W / 2,
			H / 2,
			Math.max(W, H) * 0.65
		);
		vignette.addColorStop(0, 'rgba(0,0,0,0)');
		vignette.addColorStop(1, 'rgba(30,12,0,0.35)');
		ctx.fillStyle = vignette;
		ctx.fillRect(0, 0, W, H);

		// Nail heads in the corners (not on arrows, whose point is a corner)
		ctx.fillStyle = 'rgba(40,30,25,0.85)';
		const nail = Math.max(4, H * 0.03);
		const nx = W * 0.035 + nail;
		const ny = H * 0.12;
		const nails = face.arrow
			? face.arrow > 0
				? [[nx, H / 2]]
				: [[W - nx, H / 2]]
			: [
					[nx, ny],
					[W - nx, ny],
					[nx, H - ny],
					[W - nx, H - ny]
				];
		for (const [x, y] of nails) {
			ctx.beginPath();
			ctx.arc(x, y, nail, 0, Math.PI * 2);
			ctx.fill();
		}

		// Carved text: dark letters with a light lip underneath
		const margin = (face.margin ?? 0.07) * W;
		const arrowInset = face.arrow ? H * 0.45 : 0;
		const left = margin + (face.arrow === -1 ? arrowInset : 0);
		const right = W - margin - (face.arrow === 1 ? arrowInset : 0);
		const maxW = right - left;
		const cx = (left + right) / 2;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		for (const line of face.lines) {
			if (!line.text) continue;
			let size = line.size * H;
			// `line.font` may lead with a weight ("700 …"), which must precede the size.
			const [, weight = '', family] = line.font.match(/^(\d{3}\s+)?(.*)$/)!;
			const font = (px: number) => `${weight}${px}px ${family}`;
			ctx.letterSpacing = `${line.spacing ?? 0}px`;
			ctx.font = font(size);
			const measured = ctx.measureText(line.text).width;
			if (measured > maxW) {
				size *= maxW / measured;
				ctx.font = font(size);
			}
			const y = line.y * H;
			const lip = Math.max(1, size * 0.045);
			ctx.fillStyle = 'rgba(255,240,215,0.35)';
			ctx.fillText(line.text, cx, y + lip);
			ctx.fillStyle = ink;
			ctx.fillText(line.text, cx, y);
		}
		ctx.letterSpacing = '0px';

		this.texture.needsUpdate = true;
	}

	dispose(): void {
		this.texture.dispose();
	}
}

/** A plank outline: rounded rectangle, or an arrow pointing ±x. */
function plankShape(w: number, h: number, arrow?: -1 | 1): THREE.Shape {
	const s = new THREE.Shape();
	const x0 = -w / 2;
	const x1 = w / 2;
	const y0 = -h / 2;
	const y1 = h / 2;
	if (arrow) {
		const tip = h * 0.45;
		if (arrow > 0) {
			s.moveTo(x0, y0);
			s.lineTo(x1 - tip, y0);
			s.lineTo(x1, 0);
			s.lineTo(x1 - tip, y1);
			s.lineTo(x0, y1);
		} else {
			s.moveTo(x1, y0);
			s.lineTo(x1, y1);
			s.lineTo(x0 + tip, y1);
			s.lineTo(x0, 0);
			s.lineTo(x0 + tip, y0);
		}
		s.closePath();
		return s;
	}
	const r = Math.min(w, h) * 0.12;
	s.moveTo(x0 + r, y0);
	s.lineTo(x1 - r, y0);
	s.quadraticCurveTo(x1, y0, x1, y0 + r);
	s.lineTo(x1, y1 - r);
	s.quadraticCurveTo(x1, y1, x1 - r, y1);
	s.lineTo(x0 + r, y1);
	s.quadraticCurveTo(x0, y1, x0, y1 - r);
	s.lineTo(x0, y0 + r);
	s.quadraticCurveTo(x0, y0, x0 + r, y0);
	return s;
}

/**
 * An extruded plank whose front face maps the full [0,1] texture. Group 0 is
 * the faces (front and back), group 1 the edges.
 */
export function plankGeometry(w: number, h: number, depth: number, arrow?: -1 | 1) {
	const bevel = Math.min(depth * 0.3, 0.02);
	const geo = new THREE.ExtrudeGeometry(plankShape(w, h, arrow), {
		depth: depth - bevel * 2,
		bevelEnabled: true,
		bevelThickness: bevel,
		bevelSize: bevel,
		bevelSegments: 1,
		curveSegments: 4
	});
	geo.translate(0, 0, -(depth - bevel * 2) / 2);
	const pos = geo.attributes.position;
	const uv = geo.attributes.uv;
	for (let i = 0; i < pos.count; i++) {
		uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
	}
	uv.needsUpdate = true;
	return geo;
}

/** Front-face material for a sign, slightly self-lit so it reads in shade and at night. */
export function signMaterial(sign: SignCanvas, glow: number): THREE.MeshStandardMaterial {
	return new THREE.MeshStandardMaterial({
		map: sign.texture,
		emissiveMap: sign.texture,
		emissive: new THREE.Color('#ffffff'),
		emissiveIntensity: glow,
		roughness: 0.85
	});
}
