import { json } from '@sveltejs/kit';
import { getStandup, updateStandup } from '#lib/server/db.ts';
import { db, fail } from '#lib/server/http.ts';
import { ACCENT_COLORS, THEME_CHOICES, WALK_SECONDS_MAX, WALK_SECONDS_MIN } from '#lib/types.ts';
import type { UpdateStandupRequest } from '#lib/types.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const standup = await getStandup(db(), params.id);
	return standup ? json(standup) : fail(404, 'Standup not found');
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data: UpdateStandupRequest = await request.json();

	if (data.timer_duration_minutes !== undefined) {
		const v = data.timer_duration_minutes;
		if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
			return fail(400, 'timer_duration_minutes must be a non-negative integer');
		}
	}
	if (data.color !== undefined && !ACCENT_COLORS.includes(data.color)) {
		return fail(400, 'invalid color');
	}
	if (data.theme !== undefined && !THEME_CHOICES.includes(data.theme)) {
		return fail(400, 'invalid theme');
	}
	if (data.walk_seconds !== undefined) {
		const v = data.walk_seconds;
		if (
			typeof v !== 'number' ||
			!Number.isFinite(v) ||
			v < WALK_SECONDS_MIN ||
			v > WALK_SECONDS_MAX
		) {
			return fail(400, `walk_seconds must be between ${WALK_SECONDS_MIN} and ${WALK_SECONDS_MAX}`);
		}
	}

	const standup = await updateStandup(db(), params.id, data);
	return standup ? json(standup) : fail(404, 'Standup not found');
};
