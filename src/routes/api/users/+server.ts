import { json } from '@sveltejs/kit';
import { createUser, getStandup } from '#lib/server/db.ts';
import { db, fail } from '#lib/server/http.ts';
import type { CreateUserRequest } from '#lib/types.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const data: CreateUserRequest = await request.json();
	if (!data.name || data.name.trim() === '') {
		return fail(400, 'User name is required');
	}
	if (!data.standup_id) {
		return fail(400, 'Standup ID is required');
	}
	// D1 enforces the foreign key, so report a missing standup instead of a 500.
	if (!(await getStandup(db(), data.standup_id))) {
		return fail(404, 'Standup not found');
	}
	return json(await createUser(db(), { name: data.name.trim(), standup_id: data.standup_id }));
};
