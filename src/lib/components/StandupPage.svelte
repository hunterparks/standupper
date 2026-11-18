<script lang="ts">
	import { goto } from '$app/navigation';
	import type { StandupSession, User } from '#lib/types.ts';
	import { StandupAppearance } from '#lib/themes.svelte.ts';
	import { prefetchJoke } from '#lib/jokes.ts';

	let { standupId }: { standupId: string } = $props();

	let session = $state<StandupSession | null>(null);
	let userQueue = $state<User[]>([]);
	let completedUserQueue = $state<User[]>([]);
	let loading = $state(true);
	let error = $state('');
	let progress = $state(0);
	let timer: ReturnType<typeof setInterval> | undefined;
	// svelte-ignore state_referenced_locally
	const appearance = new StandupAppearance(standupId, () => session?.standup);

	const finish = () => goto(`/complete/${standupId}`);

	const loadSession = async () => {
		try {
			const response = await fetch(`/api/standups/${standupId}/session`);
			if (!response.ok) {
				throw new Error('Failed to load session');
			}
			const data: StandupSession = await response.json();
			session = data;

			// Shuffle active users
			const activeUsers = data.users.filter((user) => !user.inactive);
			userQueue = [...activeUsers].sort(() => Math.random() - 0.5);
			if (userQueue.length > 0) startTimer();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load session';
		} finally {
			loading = false;
		}
	};

	loadSession();
	prefetchJoke();

	// Nobody (left) to speak: the standup is over.
	let finished = false;
	$effect(() => {
		if (!loading && !error && session && userQueue.length === 0 && !finished) {
			finished = true;
			finish();
		}
	});

	$effect(() => () => clearInterval(timer));

	const handleToggleInactive = async (user: User) => {
		try {
			const response = await fetch(`/api/users/${user.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ inactive: !user.inactive })
			});
			if (!response.ok) {
				throw new Error('Failed to update user');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update user';
		}
	};

	const startTimer = () => {
		clearInterval(timer);
		progress = 0;
		const startTime = Date.now();

		const durationMinutes = session?.standup.timer_duration_minutes ?? 1;
		// 0 = indeterminate mode; CSS handles the visual, no interval needed.
		if (durationMinutes === 0) return;
		const durationMs = durationMinutes * 60_000;

		timer = setInterval(() => {
			progress = Math.min(((Date.now() - startTime) / durationMs) * 100, 100);
			if (progress >= 100) clearInterval(timer);
		}, 100);
	};

	const handleNext = () => {
		if (userQueue.length <= 1) {
			// Last person, go to complete page
			finished = true;
			finish();
			return;
		}
		completedUserQueue = [...completedUserQueue, userQueue[0]];
		userQueue = userQueue.slice(1);
		startTimer();
	};

	// "Experience bij!": drop the current speaker from this standup and mark
	// them inactive for future ones.
	const handleBij = () => {
		const [current, ...rest] = userQueue;
		handleToggleInactive(current);
		userQueue = rest;
		startTimer();
	};

	// "Yeet": move the current speaker to the back of the line.
	const handleYeet = () => {
		if (userQueue.length <= 1) return;
		const [current, ...rest] = userQueue;
		userQueue = [...rest, current];
		startTimer();
	};

	const handlePrevious = () => {
		const previousUser = completedUserQueue.at(-1);
		if (!previousUser) return;
		completedUserQueue = completedUserQueue.slice(0, -1);
		userQueue = [previousUser, ...userQueue];
		startTimer();
	};

	const goHome = () => (window.location.href = '/');
</script>

{#if loading}
	<div class="color-green flex min-h-screen items-center justify-center">
		<p class="hud-label hud-label--bare blink">Loading standup…</p>
	</div>
{:else if error || !session}
	<div class="color-green flex min-h-screen items-center justify-center p-4">
		<div class="space-y-4 text-center">
			<div class="alert">{error || 'Session not found'}</div>
			<button onclick={goHome} class="btn btn-primary">Go Home</button>
		</div>
	</div>
{:else if userQueue.length > 0}
	{@const currentUser = userQueue[0]}
	{@const onDeckUser = userQueue[1]}
	{@const inTheHoleUser = userQueue[2]}
	{@const unlimited = session.standup.timer_duration_minutes === 0}
	<div class="{appearance.colorMeta.className} min-h-screen py-8">
		<div class="mx-auto max-w-2xl px-4">
			<div class="hud-frame season-badge fade-in">
				<div class="hud-panel p-6 sm:p-8">
					<!-- Header -->
					<div class="mb-8 text-center">
						<p class="hud-label hud-label--bare mb-2 flex items-center justify-center gap-2">
							<span class="dot" aria-hidden="true"></span>
							Standup in progress
						</p>
						<h1 class="display text-2xl">{session.standup.name}</h1>
					</div>

					<!-- Timer -->
					<div class="mb-8">
						<div class="mb-2 flex items-baseline justify-between">
							<span class="f-label mb-0">Airtime</span>
							<span class="mono text-sm font-bold">
								{unlimited ? '∞' : `${Math.round(progress)}%`}
							</span>
						</div>
						<div class="seg-track w-full">
							{#if unlimited}
								<div class="seg-fill seg-fill--indeterminate"></div>
							{:else}
								<div class="seg-fill" style:width="{progress}%"></div>
							{/if}
						</div>
					</div>

					<!-- Current Speaker -->
					<div class="hud-frame hud-frame--accent mb-8">
						<div class="hud-panel px-6 py-8 text-center">
							<p class="mb-3"><span class="hud-label">Now speaking</span></p>
							<h2 class="readout">{currentUser.name}</h2>
						</div>
					</div>

					<!-- Queue -->
					<div class="mb-8 space-y-2">
						<div class="queue-row">
							<span class="queue-pos">+1 ON DECK</span>
							{#if onDeckUser}
								<span class="font-medium">{onDeckUser.name}</span>
							{:else}
								<span class="t-faint">—</span>
							{/if}
						</div>
						<div class="queue-row queue-row--dim">
							<span class="queue-pos">+2 IN THE HOLE</span>
							{#if inTheHoleUser}
								<span class="font-medium">{inTheHoleUser.name}</span>
							{:else}
								<span class="t-faint">—</span>
							{/if}
						</div>
					</div>

					<!-- Action Buttons -->
					<div class="grid grid-cols-2 gap-3">
						{#if userQueue.length > 1}
							<button onclick={handleYeet} class="btn btn-warn">Yeet 🚀</button>
						{/if}
						<button onclick={handleBij} class="btn btn-danger">Experience bij!</button>
						<button onclick={handlePrevious} class="btn btn-ghost">← Previous</button>
						<button
							onclick={handleNext}
							class="btn btn-primary {userQueue.length <= 1 ? 'col-span-2' : ''}"
						>
							{userQueue.length === 1 ? 'Finish' : 'Next'} →
						</button>
					</div>
					<div class="mt-5 text-center">
						<a href="https://youtu.be/0ZbDKKmy1e4" target="_blank" class="hud-link text-xs italic">
							Bij who?
						</a>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
