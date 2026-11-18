export interface Joke {
	setup: string;
	punchline: string;
	author: string;
}

const JOKE_URL = 'https://crocs.dad/api/v1/jokes/random';

// A joke requested ahead of time (e.g. while the standup is running) so the
// completion page can show it without waiting on the network.
let prefetched: Promise<Joke | null> | null = null;

const fetchJoke = async (): Promise<Joke | null> => {
	try {
		const response = await fetch(JOKE_URL);
		if (!response.ok) return null;
		const data: { setup: string; punchline: string; author: string } = await response.json();
		return { setup: data.setup, punchline: data.punchline, author: data.author };
	} catch (error) {
		console.error('Failed to load joke:', error);
		return null;
	}
};

export const prefetchJoke = () => {
	prefetched ??= fetchJoke();
};

// Returns the prefetched joke if there is one (retrying once if it failed),
// otherwise fetches a fresh one. Consumes the prefetch so the next standup
// gets a new joke.
export const takeJoke = async (): Promise<Joke | null> => {
	const pending = prefetched;
	prefetched = null;
	return (pending && (await pending)) ?? fetchJoke();
};
