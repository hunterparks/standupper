import { json } from '@sveltejs/kit';
import { deleteUser, updateUser } from '#lib/server/db.ts';
import { db, fail } from '#lib/server/http.ts';
import type { UpdateUserRequest } from '#lib/types.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request }) => {
	const id = parseInt(params.id);
	const data: UpdateUserRequest = await request.json();
	if (isNaN(id)) return fail(400, 'Invalid user ID');

	const user = await updateUser(db(), id, data);
	return user ? json(user) : fail(404, 'User not found');
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) return fail(400, 'Invalid user ID');

	return (await deleteUser(db(), id)) ? json({ success: true }) : fail(404, 'User not found');
};
