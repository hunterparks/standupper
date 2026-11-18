/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Read the sources as text: importing hooks.server.ts pulls in SvelteKit runtime modules.
import hooks from './hooks.server.ts?raw';
import appHtml from './app.html?raw';

describe('pre-paint theme script', () => {
	it('app.html contains the exact placeholders hooks.server.ts replaces', () => {
		const placeholders = [...hooks.matchAll(/_PLACEHOLDER = '([^']+)'/g)].map((m) => m[1]);
		expect(placeholders).toEqual(['/*SEASONAL_THEME_FN*/ null', '/*RESOLVED_THEMES*/ []']);
		for (const p of placeholders) expect(appHtml).toContain(p);
		expect(hooks).toContain('.replace(SEASONAL_THEME_PLACEHOLDER,');
		expect(hooks).toContain('.replace(RESOLVED_THEMES_PLACEHOLDER,');
	});
});
