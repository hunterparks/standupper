import type { AccentColor, ResolvedTheme, Standup, ThemeChoice } from './types.ts';
import { ACCENT_COLORS, THEME_CHOICES } from './types.ts';
import { seasonalTheme } from './season.ts';

export type { ResolvedTheme };
export { seasonalTheme };

// ---------- Accent colors ----------

/**
 * Each accent color is a CSS class (`.color-*` in style.css) that sets
 * `--accent` for everything inside it, plus the raw hex used for the
 * color-picker swatches.
 */
export interface ColorMeta {
	className: string;
	hex: string;
}

export const COLOR_META: Record<AccentColor, ColorMeta> = {
	green: { className: 'color-green', hex: '#3ecf6e' },
	red: { className: 'color-red', hex: '#ff6b6b' },
	blue: { className: 'color-blue', hex: '#5aa9ff' },
	yellow: { className: 'color-yellow', hex: '#ffc900' },
	purple: { className: 'color-purple', hex: '#c084fc' }
};

export function getColor(c: AccentColor | undefined): ColorMeta {
	return COLOR_META[c ?? 'green'] ?? COLOR_META.green;
}

// ---------- Site themes ----------

export interface ThemeMeta {
	label: string;
	icon: string;
	/** When Automatic picks this theme (shown as the picker tooltip). Keep in sync with season.ts. */
	activeWhen: string;
}

export const THEME_META: Record<ThemeChoice, ThemeMeta> = {
	automatic: {
		label: 'Automatic',
		icon: '📅',
		activeWhen: 'Switches themes to match the calendar'
	},
	standard: { label: 'Standard', icon: '▪️', activeWhen: 'Whenever no other theme is active' },
	'new-year': { label: 'New Year', icon: '🎆', activeWhen: 'Jan 1–7' },
	valentines: { label: "Valentine's", icon: '💘', activeWhen: 'Feb 10–14' },
	'st-patricks': { label: "St. Patrick's", icon: '☘️', activeWhen: 'Mar 14–17' },
	spring: { label: 'Spring', icon: '🌷', activeWhen: 'Mar 20 – Apr 30' },
	'cinco-de-mayo': { label: 'Cinco de Mayo', icon: '🪅', activeWhen: 'May 1–5' },
	usa: {
		label: 'USA',
		icon: '🇺🇸',
		activeWhen: 'Memorial Day week, Jun 29 – Jul 5, and Labor Day week'
	},
	summer: {
		label: 'Summer',
		icon: '☀️',
		activeWhen: 'Jun 21 – Aug 31 (except the 4th of July stretch)'
	},
	halloween: { label: 'Halloween', icon: '🎃', activeWhen: 'Oct 31' },
	'day-of-the-dead': { label: 'Día de los Muertos', icon: '💀', activeWhen: 'Nov 1–2' },
	autumn: {
		label: 'Autumn',
		icon: '🍂',
		activeWhen: 'November (except Nov 1–2 and Thanksgiving week)'
	},
	thanksgiving: { label: 'Thanksgiving', icon: '🦃', activeWhen: 'Mon–Fri of Thanksgiving week' },
	winter: { label: 'Winter', icon: '🎄', activeWhen: 'December' }
};

export function resolveTheme(choice: ThemeChoice, now: Date = new Date()): ResolvedTheme {
	return choice === 'automatic' ? seasonalTheme(now) : choice;
}

/** Applies the theme to <html data-theme>, where style.css picks it up. Call during component init. */
export function useSiteTheme(choice: () => ThemeChoice): void {
	$effect(() => {
		document.documentElement.dataset.theme = resolveTheme(choice());
	});
}

// ---------- Per-standup appearance (cached locally) ----------

// The color key predates themes, so it keeps its old name. Same keys as the
// Val Town version, so cached settings survive the move (same origin).
const colorKey = (standupId: string) => `standupper:theme:${standupId}`;
const themeKey = (standupId: string) => `standupper:sitetheme:${standupId}`;

function loadCached<T extends string>(key: string, allowed: T[]): T | undefined {
	try {
		const v = localStorage.getItem(key);
		if (v && (allowed as string[]).includes(v)) return v as T;
	} catch {
		// localStorage unavailable (private mode, etc.) — fall through
	}
	return undefined;
}

function saveCached(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// ignore
	}
}

/**
 * The accent color and site theme for a standup. Seeds from localStorage so
 * navigations within an existing standup don't flash the defaults before the
 * session payload arrives, then follows the server value (writing it back to
 * the cache). Also applies the theme to the page. Construct during component init.
 */
export class StandupAppearance {
	color = $state<AccentColor>('green');
	themeChoice = $state<ThemeChoice>('automatic');
	colorMeta = $derived(getColor(this.color));
	resolvedTheme = $derived(resolveTheme(this.themeChoice));

	constructor(standupId: string, standup: () => Standup | undefined) {
		this.color = loadCached(colorKey(standupId), ACCENT_COLORS) ?? 'green';
		this.themeChoice = loadCached(themeKey(standupId), THEME_CHOICES) ?? 'automatic';

		$effect(() => {
			const s = standup();
			if (s?.color && s.color !== this.color) {
				this.color = s.color;
				saveCached(colorKey(standupId), s.color);
			}
			if (s?.theme && s.theme !== this.themeChoice) {
				this.themeChoice = s.theme;
				saveCached(themeKey(standupId), s.theme);
			}
		});

		$effect(() => {
			document.documentElement.dataset.theme = this.resolvedTheme;
		});
	}
}
