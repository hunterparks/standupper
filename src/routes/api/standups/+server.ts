import { json } from '@sveltejs/kit';
import { createStandup } from '#lib/server/db.ts';
import { db, fail } from '#lib/server/http.ts';
import type { CreateStandupRequest } from '#lib/types.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const data: CreateStandupRequest = await request.json();
	if (!data.name || data.name.trim() === '') {
		return fail(400, 'Standup name is required');
	}
	return json(await createStandup(db(), { name: data.name.trim() }));
};
