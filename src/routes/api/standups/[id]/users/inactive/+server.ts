import { json } from '@sveltejs/kit';
import { bulkUpdateInactive } from '#lib/server/db.ts';
import { db, fail } from '#lib/server/http.ts';
import type { BulkUpdateInactiveRequest } from '#lib/types.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request }) => {
	const data: BulkUpdateInactiveRequest = await request.json();
	if (!['all', 'none', 'invert'].includes(data.mode)) {
		return fail(400, 'mode must be "all", "none", or "invert"');
	}
	await bulkUpdateInactive(db(), params.id, data.mode);
	return json({ success: true });
};
