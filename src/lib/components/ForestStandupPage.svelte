<script lang="ts">
	// The 3D standup: a walk down a forest trail, one sign tree per speaker.
	// Deliberately standalone; it shares only the API and themes with the
	// regular standup page.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { StandupSession, User } from '#lib/types.ts';
	import { StandupAppearance, THEME_META } from '#lib/themes.svelte.ts';
	import { prefetchJoke } from '#lib/jokes.ts';
	import { FOREST_THEMES } from '#lib/forest/forestThemes.ts';
	import type { ForestAction, ForestScene } from '#lib/forest/scene.ts';

	let { standupId }: { standupId: string } = $props();

	let session = $state<StandupSession | null>(null);
	let userQueue = $state<User[]>([]);
	let completedUserQueue = $state<User[]>([]);
	let error = $state('');
	let ready = $state(false);
	let walking = $state(true);
	let finishing = $state(false);
	let fadeOut = $state(false);
	let step = 0;
	let progress = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let forest: ForestScene | null = null;
	let stage: HTMLDivElement;
	// svelte-ignore state_referenced_locally
	const appearance = new StandupAppearance(standupId, () => session?.standup);

	const forestTheme = $derived(FOREST_THEMES[appearance.resolvedTheme]);
	const reducedMotion =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	const loadSession = async () => {
		const response = await fetch(`/api/standups/${standupId}/session`);
		if (!response.ok) throw new Error('Failed to load session');
		const data: StandupSession = await response.json();
		session = data;
		const activeUsers = data.users.filter((user) => !user.inactive);
		userQueue = [...activeUsers].sort(() => Math.random() - 0.5);
		completedUserQueue = [];
		return data;
	};

	onMount(() => {
		let cancelled = false;
		prefetchJoke();

		(async () => {
			try {
				const data = await loadSession();
				if (cancelled) return;
				if (userQueue.length === 0) {
					goto(`/complete/${standupId}`, { replaceState: true });
					return;
				}

				const [{ ForestScene }, { loadSignFonts }] = await Promise.all([
					import('#lib/forest/scene.ts'),
					import('#lib/forest/signs.ts')
				]);
				await loadSignFonts();
				if (cancelled) return;

				try {
					forest = new ForestScene(stage, {
						theme: appearance.resolvedTheme,
						accent: appearance.colorMeta.hex,
						standupName: data.standup.name,
						reducedMotion,
						walkSeconds: data.standup.walk_seconds,
						onAction: handleAction
					});
				} catch (err) {
					console.error(err);
					throw new Error("Your browser couldn't start 3D graphics (WebGL).");
				}
				forest.setLineup(step, names(), false);
				ready = true;

				// A moment at the trailhead, then off to the first speaker.
				await wait(reducedMotion ? 300 : 1600);
				if (cancelled) return;
				await walkTo(step);
			} catch (err) {
				if (!cancelled) error = err instanceof Error ? err.message : 'Failed to start standup';
			}
		})();

		return () => {
			cancelled = true;
			clearInterval(timer);
			forest?.dispose();
			forest = null;
		};
	});

	const names = () => userQueue.map((u) => u.name);

	const startTimer = () => {
		clearInterval(timer);
		progress = 0;
		const durationMinutes = session?.standup.timer_duration_minutes ?? 1;
		if (durationMinutes === 0) {
			forest?.setProgress(null);
			return;
		}
		forest?.setProgress(0);
		const startTime = Date.now();
		const durationMs = durationMinutes * 60_000;
		timer = setInterval(() => {
			progress = Math.min((Date.now() - startTime) / durationMs, 1);
			forest?.setProgress(progress);
			if (progress >= 1) clearInterval(timer);
		}, 100);
	};

	const walkTo = async (k: number) => {
		clearInterval(timer);
		walking = true;
		forest?.setLineup(k, names(), completedUserQueue.length > 0);
		await forest?.goToStation(k);
		walking = false;
		startTimer();
	};

	const finish = async () => {
		if (finishing) return;
		finishing = true;
		walking = true;
		clearInterval(timer);
		forest?.setLineup(step + 1, [], false);
		await forest?.goToFinish();
		await wait(reducedMotion ? 200 : 1300);
		fadeOut = true;
		await wait(reducedMotion ? 100 : 700);
		goto(`/complete/${standupId}`);
	};

	const markInactive = async (user: User) => {
		try {
			const response = await fetch(`/api/users/${user.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ inactive: true })
			});
			if (!response.ok) throw new Error('Failed to update user');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update user';
		}
	};

	const handleNext = () => {
		if (userQueue.length <= 1) return finish();
		completedUserQueue = [...completedUserQueue, userQueue[0]];
		userQueue = userQueue.slice(1);
		step += 1;
		walkTo(step);
	};

	// "Experience bij!": drop the current speaker from this standup and mark
	// them inactive for future ones.
	const handleBij = () => {
		const [current, ...rest] = userQueue;
		markInactive(current);
		userQueue = rest;
		if (rest.length === 0) return finish();
		step += 1;
		walkTo(step);
	};

	// "Yeet": send the current speaker to the back of the line.
	const handleYeet = () => {
		if (userQueue.length <= 1) return;
		const [current, ...rest] = userQueue;
		userQueue = [...rest, current];
		step += 1;
		walkTo(step);
	};

	const handlePrevious = () => {
		const previousUser = completedUserQueue.at(-1);
		if (!previousUser || step === 0) return;
		completedUserQueue = completedUserQueue.slice(0, -1);
		userQueue = [previousUser, ...userQueue];
		step -= 1;
		walkTo(step);
	};

	function handleAction(action: ForestAction) {
		if (walking || finishing || !ready) return;
		if (action === 'next') handleNext();
		else if (action === 'previous') handlePrevious();
		else if (action === 'yeet') handleYeet();
		else if (action === 'bij') handleBij();
	}

	const onKeydown = (e: KeyboardEvent) => {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		// Let focused buttons handle Enter/Space themselves.
		if (e.target instanceof Element && e.target.closest('button, a, input')) return;
		const key = e.key.toLowerCase();
		const action: ForestAction | undefined =
			key === 'arrowright' || key === 'enter' || key === ' '
				? 'next'
				: key === 'arrowleft'
					? 'previous'
					: key === 'y'
						? 'yeet'
						: key === 'b'
							? 'bij'
							: undefined;
		if (action) {
			e.preventDefault();
			handleAction(action);
		}
	};

	const current = $derived(userQueue[0]);
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:head>
	<title>{session ? `${session.standup.name} · 3D Standup` : '3D Standup'} - Standupper</title>
</svelte:head>

<div
	class="forest"
	style:--sky-top={forestTheme.skyTop}
	style:--sky-horizon={forestTheme.skyHorizon}
	style:--accent={appearance.colorMeta.hex}
>
	<div class="stage" bind:this={stage}></div>

	{#if !ready && !error}
		<div class="veil">
			<p class="veil-text">Walking into the woods…</p>
		</div>
	{/if}

	{#if error}
		<div class="veil">
			<div class="panel">
				<p class="panel-text">{error}</p>
				<div class="panel-actions">
					<a class="chip" href="/standup/{standupId}">Use the regular standup</a>
					<a class="chip chip--quiet" href="/session/{standupId}">Back to lineup</a>
				</div>
			</div>
		</div>
	{/if}

	{#if ready && session}
		<header class="hud hud-top">
			<div class="tag">
				<span aria-hidden="true">{THEME_META[appearance.resolvedTheme].icon}</span>
				<span class="tag-name">{session.standup.name}</span>
			</div>
			<a class="chip chip--quiet" href="/session/{standupId}" title="Leave the trail">✕</a>
		</header>

		<footer class="hud hud-bottom">
			<span class="hint">
				<kbd>→</kbd> next · <kbd>←</kbd> back · <kbd>Y</kbd> yeet · <kbd>B</kbd> bij
			</span>
			<a href="https://youtu.be/0ZbDKKmy1e4" target="_blank" class="hint hint-link">Bij who?</a>
		</footer>

		<!-- The planks in the scene are canvas; mirror them for keyboard & screen readers. -->
		<div class="sr-only">
			<p aria-live="polite">
				{finishing ? 'Standup complete' : current ? `Now speaking: ${current.name}` : ''}
			</p>
			<button onclick={() => handleAction('previous')} disabled={completedUserQueue.length === 0}>
				Previous
			</button>
			{#if userQueue.length > 1}
				<button onclick={() => handleAction('yeet')}>Yeet</button>
			{/if}
			<button onclick={() => handleAction('bij')}>Experience bij</button>
			<button onclick={() => handleAction('next')}>
				{userQueue.length <= 1 ? 'Finish' : 'Next'}
			</button>
		</div>
	{/if}

	<div class="fade" class:fade--on={fadeOut}></div>
</div>

<style>
	.forest {
		position: fixed;
		inset: 0;
		z-index: 10;
		overflow: hidden;
		background: linear-gradient(var(--sky-top), var(--sky-horizon));
		font-family: var(--font-body);
		color: #fff8ec;
	}

	.stage {
		position: absolute;
		inset: 0;
	}

	.veil {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: linear-gradient(var(--sky-top), var(--sky-horizon));
	}

	.veil-text {
		font-family: var(--font-mono);
		font-weight: 700;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		font-size: 0.8rem;
		color: #2a170c;
		background: rgba(255, 248, 236, 0.85);
		padding: 0.5rem 0.9rem;
		border-radius: 999px;
		animation: breathe 1.6s ease-in-out infinite;
	}

	@keyframes breathe {
		50% {
			opacity: 0.55;
		}
	}

	.panel {
		max-width: 26rem;
		background: rgba(30, 18, 10, 0.82);
		backdrop-filter: blur(8px);
		border-radius: 14px;
		padding: 1.25rem;
		text-align: center;
	}

	.panel-text {
		margin-bottom: 1rem;
	}

	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
	}

	.hud {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 16px;
		pointer-events: none;
	}

	.hud > :global(*) {
		pointer-events: auto;
	}

	.hud-top {
		top: 0;
	}

	.hud-bottom {
		bottom: 0;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.45rem 0.8rem;
		border-radius: 999px;
		background: rgba(30, 18, 10, 0.45);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		font-size: 0.85rem;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
	}

	.tag-name {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.02em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.25rem;
		height: 2.25rem;
		padding: 0 0.85rem;
		border-radius: 999px;
		background: var(--accent);
		color: #2a170c;
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 0.8rem;
		text-decoration: none;
		transition: transform 0.15s ease;
	}

	.chip--quiet {
		background: rgba(30, 18, 10, 0.45);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #fff8ec;
		padding: 0;
	}

	.panel .chip--quiet {
		padding: 0 0.85rem;
	}

	.chip:hover {
		transform: translateY(-1px);
	}

	.chip:focus-visible,
	.hint-link:focus-visible {
		outline: 2px solid #fff8ec;
		outline-offset: 2px;
	}

	.hint {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: rgba(255, 248, 236, 0.85);
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	}

	.hint-link {
		font-style: italic;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	kbd {
		font-family: inherit;
		padding: 0 0.3em;
		border: 1px solid rgba(255, 248, 236, 0.5);
		border-radius: 4px;
	}

	@media (pointer: coarse) {
		.hint:not(.hint-link) {
			visibility: hidden;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.fade {
		position: absolute;
		inset: 0;
		background: var(--sky-horizon);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.7s ease;
	}

	.fade--on {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.veil-text {
			animation: none;
		}
	}
</style>
