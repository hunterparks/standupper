import type { ResolvedTheme } from './types.ts';

/**
 * The site-wide seasonal theme for a date, in the viewer's local time.
 *
 * The server also inlines this function's source into index.html (see
 * backend/index.ts) so the theme is applied before first paint. Keep it
 * self-contained: no imports or references to anything outside its body.
 *
 * Earlier checks win, so short holidays override the longer seasons.
 */
export function seasonalTheme(now: Date = new Date()): ResolvedTheme {
	const year = now.getFullYear();
	const today = new Date(year, now.getMonth(), now.getDate());
	// Month and day as one number, e.g. 317 = March 17
	const md = (now.getMonth() + 1) * 100 + now.getDate();
	const between = (from: number, to: number) => md >= from && md <= to;

	// The nth `weekday` (0 = Sunday) of `month` (0 = January); n = -1 means the last one
	const nthWeekday = (month: number, weekday: number, n: number) => {
		if (n < 0) {
			const last = new Date(year, month + 1, 0);
			return new Date(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7));
		}
		const first = new Date(year, month, 1);
		return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
	};

	// Monday through Friday of the week containing `day`
	const inWorkWeekOf = (day: Date) => {
		const monday = new Date(year, day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
		const friday = new Date(year, monday.getMonth(), monday.getDate() + 4);
		return today >= monday && today <= friday;
	};

	const memorialDay = nthWeekday(4, 1, -1); // last Monday in May
	const laborDay = nthWeekday(8, 1, 1); // first Monday in September
	const thanksgiving = nthWeekday(10, 4, 4); // fourth Thursday in November

	if (between(101, 107)) return 'new-year';
	if (between(210, 214)) return 'valentines';
	if (between(314, 317)) return 'st-patricks';
	if (between(320, 430)) return 'spring';
	if (between(501, 505)) return 'cinco-de-mayo';
	if (inWorkWeekOf(memorialDay) || between(629, 705) || inWorkWeekOf(laborDay)) return 'usa';
	if (between(621, 831)) return 'summer';
	if (md === 1031) return 'halloween';
	if (between(1101, 1102)) return 'day-of-the-dead';
	if (inWorkWeekOf(thanksgiving)) return 'thanksgiving';
	if (between(1101, 1130)) return 'autumn';
	if (between(1201, 1231)) return 'winter';
	return 'standard';
}
