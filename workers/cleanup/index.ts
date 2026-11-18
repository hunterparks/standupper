// Scheduled cleanup (was cleanup-old-standups.ts on Val Town): deletes
// standups nobody has opened in DAYS_TO_KEEP days. Users go with them via
// ON DELETE CASCADE. Runs as its own Worker because the SvelteKit adapter
// owns the main Worker's entry point.
import { deleteStandupsNotSeenSince } from '../../src/lib/server/db.ts';

const DAYS_TO_KEEP = 90;

interface Env {
	DB: D1Database;
}

export default {
	async scheduled(_controller, env) {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);
		const deleted = await deleteStandupsNotSeenSince(env.DB, cutoff.toISOString());
		console.log(`Deleted ${deleted} standups not accessed since ${cutoff.toISOString()}`);
	}
} satisfies ExportedHandler<Env>;
