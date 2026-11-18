import { ACCENT_COLORS, THEME_CHOICES, WALK_SECONDS_DEFAULT } from '../types.ts';
import type {
	AccentColor,
	BulkUpdateInactiveRequest,
	CreateStandupRequest,
	CreateUserRequest,
	Standup,
	ThemeChoice,
	UpdateStandupRequest,
	UpdateUserRequest,
	User
} from '../types.ts';

interface StandupRow {
	id: string;
	name: string;
	last_login: string;
	timer_duration_minutes: number;
	color: string;
	theme: string;
	walk_seconds: number;
}

interface UserRow {
	id: number;
	name: string;
	standup_id: string;
	inactive: number;
	starred: number;
}

// The CHECK constraints already guarantee valid values; the fallbacks mirror
// the original app's defensive reads.
const toStandup = (row: StandupRow): Standup => ({
	id: row.id,
	name: row.name,
	last_login: row.last_login || new Date().toISOString(),
	timer_duration_minutes: row.timer_duration_minutes ?? 1,
	color: ACCENT_COLORS.includes(row.color as AccentColor) ? (row.color as AccentColor) : 'green',
	theme: THEME_CHOICES.includes(row.theme as ThemeChoice)
		? (row.theme as ThemeChoice)
		: 'automatic',
	walk_seconds: row.walk_seconds ?? WALK_SECONDS_DEFAULT
});

const toUser = (row: UserRow): User => ({
	id: row.id,
	name: row.name,
	standup_id: row.standup_id,
	inactive: Boolean(row.inactive),
	starred: Boolean(row.starred)
});

// ---------- Standups ----------

export async function createStandup(db: D1Database, data: CreateStandupRequest): Promise<Standup> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await db
		.prepare('INSERT INTO standups (id, name, last_login) VALUES (?, ?, ?)')
		.bind(id, data.name, now)
		.run();
	return {
		id,
		name: data.name,
		last_login: now,
		timer_duration_minutes: 1,
		color: 'green',
		theme: 'automatic',
		walk_seconds: WALK_SECONDS_DEFAULT
	};
}

export async function getStandup(db: D1Database, id: string): Promise<Standup | null> {
	const row = await db.prepare('SELECT * FROM standups WHERE id = ?').bind(id).first<StandupRow>();
	return row ? toStandup(row) : null;
}

export async function updateStandup(
	db: D1Database,
	id: string,
	data: UpdateStandupRequest
): Promise<Standup | null> {
	const updates: string[] = [];
	const values: unknown[] = [];

	if (data.timer_duration_minutes !== undefined) {
		updates.push('timer_duration_minutes = ?');
		values.push(data.timer_duration_minutes);
	}
	if (data.color !== undefined) {
		updates.push('color = ?');
		values.push(data.color);
	}
	if (data.theme !== undefined) {
		updates.push('theme = ?');
		values.push(data.theme);
	}
	if (data.walk_seconds !== undefined) {
		updates.push('walk_seconds = ?');
		values.push(data.walk_seconds);
	}
	if (updates.length === 0) return null;

	const row = await db
		.prepare(`UPDATE standups SET ${updates.join(', ')} WHERE id = ? RETURNING *`)
		.bind(...values, id)
		.first<StandupRow>();
	return row ? toStandup(row) : null;
}

export async function touchStandup(db: D1Database, id: string, now: string): Promise<void> {
	await db.prepare('UPDATE standups SET last_login = ? WHERE id = ?').bind(now, id).run();
}

/** Deletes standups not opened since `cutoff`; their users go via ON DELETE CASCADE. */
export async function deleteStandupsNotSeenSince(db: D1Database, cutoff: string): Promise<number> {
	const result = await db.prepare('DELETE FROM standups WHERE last_login < ?').bind(cutoff).run();
	return result.meta.changes;
}

// ---------- Users ----------

export async function createUser(db: D1Database, data: CreateUserRequest): Promise<User> {
	const row = await db
		.prepare('INSERT INTO users (name, standup_id) VALUES (?, ?) RETURNING *')
		.bind(data.name, data.standup_id)
		.first<UserRow>();
	if (!row) throw new Error('Failed to create user - no result returned');
	return toUser(row);
}

export async function getUsersByStandupId(db: D1Database, standupId: string): Promise<User[]> {
	const { results } = await db
		.prepare('SELECT * FROM users WHERE standup_id = ? ORDER BY name ASC')
		.bind(standupId)
		.all<UserRow>();
	return results.map(toUser);
}

export async function updateUser(
	db: D1Database,
	id: number,
	data: UpdateUserRequest
): Promise<User | null> {
	const updates: string[] = [];
	const values: unknown[] = [];

	if (data.name !== undefined) {
		updates.push('name = ?');
		values.push(data.name);
	}
	if (data.inactive !== undefined) {
		updates.push('inactive = ?');
		values.push(data.inactive ? 1 : 0);
	}
	if (data.starred !== undefined) {
		updates.push('starred = ?');
		values.push(data.starred ? 1 : 0);
	}
	// Marking a user inactive clears their star.
	if (data.inactive === true && data.starred === undefined) {
		updates.push('starred = 0');
	}
	if (updates.length === 0) return null;

	const statements: D1PreparedStatement[] = [];
	// At most one starred user per standup: clear the others first.
	if (data.starred === true) {
		statements.push(
			db
				.prepare(
					`UPDATE users SET starred = 0
					 WHERE standup_id = (SELECT standup_id FROM users WHERE id = ?) AND id != ?`
				)
				.bind(id, id)
		);
	}
	statements.push(
		db
			.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ? RETURNING *`)
			.bind(...values, id)
	);

	const results = await db.batch<UserRow>(statements);
	const row = results.at(-1)?.results[0];
	return row ? toUser(row) : null;
}

export async function bulkUpdateInactive(
	db: D1Database,
	standupId: string,
	mode: BulkUpdateInactiveRequest['mode']
): Promise<void> {
	const sql = {
		all: 'UPDATE users SET inactive = 1, starred = 0 WHERE standup_id = ?',
		none: 'UPDATE users SET inactive = 0 WHERE standup_id = ?',
		// Users going active -> inactive lose their star. The CASE reads the
		// pre-update value of `inactive`.
		invert: `UPDATE users
		         SET starred = CASE WHEN inactive = 0 THEN 0 ELSE starred END,
		             inactive = 1 - inactive
		         WHERE standup_id = ?`
	}[mode];
	await db.prepare(sql).bind(standupId).run();
}

export async function deleteUser(db: D1Database, id: number): Promise<boolean> {
	const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
	return result.meta.changes > 0;
}
