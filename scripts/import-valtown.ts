// Val Town -> D1 data migration.
//
//   EXPORT_TOKEN=… node scripts/import-valtown.ts > /path/to/seed.sql
//   npx wrangler d1 execute standupper --remote --file /path/to/seed.sql
//
// Pulls both tables from the temporary /api/export route on the old val and
// prints SQL that replaces everything in D1. Safe to re-run (final re-sync).
// Values are normalised the same way the old app's read path did, so what
// people saw on Val Town is exactly what they'll see here. A summary goes to
// stderr.

import { ACCENT_COLORS, THEME_CHOICES } from '../src/lib/types.ts';
import type { AccentColor, ThemeChoice } from '../src/lib/types.ts';

const EXPORT_URL = process.env.EXPORT_URL ?? 'https://standupper.val.run/api/export';
const token = process.env.EXPORT_TOKEN;
if (!token) throw new Error('Set EXPORT_TOKEN');

type Row = Record<string, unknown>;

const res = await fetch(EXPORT_URL, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`Export failed: ${res.status} ${await res.text()}`);
const data = (await res.json()) as { exported_at: string; standups: Row[]; users: Row[] };

const sql = (v: string | number) =>
	typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`;
const bool = (v: unknown) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const now = new Date().toISOString();
const notes: string[] = [];

const standups = data.standups.map((r) => {
	const timer = r.timer_duration_minutes == null ? 1 : Number(r.timer_duration_minutes);
	// Old columns: `theme` held the accent color, `season_theme` the site theme.
	const color = ACCENT_COLORS.includes(r.theme as AccentColor) ? (r.theme as string) : 'green';
	const theme = THEME_CHOICES.includes(r.season_theme as ThemeChoice)
		? (r.season_theme as string)
		: 'automatic';
	if (color !== r.theme) notes.push(`standup ${r.id}: color ${JSON.stringify(r.theme)} -> green`);
	if (theme !== r.season_theme)
		notes.push(`standup ${r.id}: theme ${JSON.stringify(r.season_theme)} -> automatic`);
	if (!Number.isInteger(timer) || timer < 0)
		throw new Error(`standup ${r.id}: bad timer ${JSON.stringify(r.timer_duration_minutes)}`);
	return {
		id: String(r.id),
		name: String(r.name),
		last_login: (r.last_login as string) || now,
		timer_duration_minutes: timer,
		color,
		theme
	};
});

const standupIds = new Set(standups.map((s) => s.id));
// Users whose standup no longer exists were unreachable in the old app (the
// old DB didn't enforce the foreign key); D1 does, so they're left out.
const orphans = data.users.filter((u) => !standupIds.has(String(u.standup_id)));
const users = data.users
	.filter((u) => standupIds.has(String(u.standup_id)))
	.map((r) => ({
		id: Number(r.id),
		name: String(r.name),
		standup_id: String(r.standup_id),
		inactive: bool(r.inactive),
		starred: bool(r.starred)
	}));

const lines = ['PRAGMA defer_foreign_keys = true;', 'DELETE FROM users;', 'DELETE FROM standups;'];
for (const s of standups) {
	lines.push(
		`INSERT INTO standups (id, name, last_login, timer_duration_minutes, color, theme) VALUES (${[
			s.id,
			s.name,
			s.last_login,
			s.timer_duration_minutes,
			s.color,
			s.theme
		]
			.map(sql)
			.join(', ')});`
	);
}
for (const u of users) {
	lines.push(
		`INSERT INTO users (id, name, standup_id, inactive, starred) VALUES (${[
			u.id,
			u.name,
			u.standup_id,
			u.inactive,
			u.starred
		]
			.map(sql)
			.join(', ')});`
	);
}
console.log(lines.join('\n'));

console.error(
	[
		`exported_at: ${data.exported_at}`,
		`standups: ${standups.length}`,
		`users: ${users.length} (skipped ${orphans.length} orphaned: ${orphans.map((o) => `${o.id}->${o.standup_id}`).join(', ') || 'none'})`,
		...notes
	].join('\n')
);
