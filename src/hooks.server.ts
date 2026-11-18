import type { Handle } from '@sveltejs/kit/hooks';
import { seasonalTheme } from '#lib/season.ts';
import { THEME_CHOICES } from '#lib/types.ts';

// Splice the real seasonal rules into the inline theme script in app.html so
// the theme is right on first paint without a second copy of the date logic.
// Must match src/app.html exactly (checked by hooks.server.spec.ts).
const SEASONAL_THEME_PLACEHOLDER = '/*SEASONAL_THEME_FN*/ null';
const RESOLVED_THEMES_PLACEHOLDER = '/*RESOLVED_THEMES*/ []';

const SEASONAL_THEME_FN = `(${seasonalTheme.toString()})`;
const RESOLVED_THEMES = JSON.stringify(THEME_CHOICES.filter((t) => t !== 'automatic'));

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace(SEASONAL_THEME_PLACEHOLDER, () => SEASONAL_THEME_FN)
				.replace(RESOLVED_THEMES_PLACEHOLDER, () => RESOLVED_THEMES)
	});
