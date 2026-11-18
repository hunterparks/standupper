import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';

export const db = (): D1Database => env.DB;

/** Error responses use the original API's `{ error }` shape. */
export const fail = (status: number, error: string) => json({ error }, { status });
