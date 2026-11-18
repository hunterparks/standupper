import { describe, expect, it } from 'vitest';
import { seasonalTheme } from './season.ts';

// Local-time dates; month is 1-based here for readability.
const on = (y: number, m: number, d: number) => seasonalTheme(new Date(y, m - 1, d));

describe('seasonalTheme', () => {
	it.each([
		[2026, 1, 1, 'new-year'],
		[2026, 1, 8, 'standard'],
		[2026, 2, 14, 'valentines'],
		[2026, 3, 17, 'st-patricks'],
		[2026, 3, 20, 'spring'],
		[2026, 5, 5, 'cinco-de-mayo'],
		[2026, 5, 25, 'usa'], // Memorial Day 2026
		[2026, 5, 29, 'usa'], // Friday of Memorial Day week
		[2026, 5, 30, 'standard'],
		[2026, 6, 21, 'summer'],
		[2026, 7, 4, 'usa'],
		[2026, 9, 7, 'usa'], // Labor Day 2026
		[2026, 10, 31, 'halloween'],
		[2026, 11, 2, 'day-of-the-dead'],
		[2026, 11, 17, 'autumn'],
		[2026, 11, 23, 'thanksgiving'], // Monday of Thanksgiving week (Nov 26)
		[2026, 11, 27, 'thanksgiving'],
		[2026, 11, 28, 'autumn'],
		[2026, 12, 25, 'winter']
	])('%i-%i-%i is %s', (y, m, d, theme) => {
		expect(on(y, m, d)).toBe(theme);
	});

	it('is self-contained so it can be inlined into the page shell', () => {
		const inlined = new Function(`return (${seasonalTheme.toString()})`)();
		expect(inlined(new Date(2026, 9, 31))).toBe('halloween');
	});
});
