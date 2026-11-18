import { json } from '@sveltejs/kit';
import { getStandup, getUsersByStandupId, touchStandup } from '#lib/server/db.ts';
import { db, fail } from '#lib/server/http.ts';
import type { StandupSession } from '#lib/types.ts';
import type { RequestHandler } from './$types';

// Loading a session counts as a visit, which keeps it safe from the 90-day cleanup.
export const GET: RequestHandler = async ({ params }) => {
	const standup = await getStandup(db(), params.id);
	if (!standup) return fail(404, 'Standup not found');

	const now = new Date().toISOString();
	const [, users] = await Promise.all([
		touchStandup(db(), params.id, now),
		getUsersByStandupId(db(), params.id)
	]);
	const session: StandupSession = { standup: { ...standup, last_login: now }, users };
	return json(session);
};
