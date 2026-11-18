<script lang="ts">
	import { goto } from '$app/navigation';
	import type { StandupSession } from '#lib/types.ts';
	import { StandupAppearance } from '#lib/themes.svelte.ts';
	import { type Joke, takeJoke } from '#lib/jokes.ts';

	let { standupId }: { standupId: string } = $props();

	interface Toast {
		id: number;
		message: string;
		emoji: string;
	}

	let session = $state<StandupSession | null>(null);
	let loading = $state(true);
	let loadingJoke = $state(true);
	let joke = $state<(Joke & { provider: string }) | null>(null);
	let upVote = $state(false);
	let downVote = $state(false);
	let toast = $state<Toast | null>(null);
	// svelte-ignore state_referenced_locally
	const appearance = new StandupAppearance(standupId, () => session?.standup);

	const showToast = (message: string, emoji: string) => {
		toast = { id: Date.now(), message, emoji };
		setTimeout(() => (toast = null), 1600);
	};

	const loadSession = async () => {
		// Kick off the joke alongside the session instead of after it; it's
		// usually already prefetched by the standup page.
		const jokePromise = takeJoke();
		try {
			const response = await fetch(`/api/standups/${standupId}/session`);
			if (response.ok) {
				const data: StandupSession = await response.json();
				session = data;

				// The starred teammate tells the joke; otherwise a random active one.
				const activeUsers = data.users.filter((user) => !user.inactive);
				const starredUser = data.users.find((user) => user.starred);
				const provider =
					starredUser?.name ?? activeUsers[Math.floor(Math.random() * activeUsers.length)]?.name;
				const loadedJoke = await jokePromise;
				// With no one to tell it, show the error joke (as the original did).
				if (loadedJoke && provider) joke = { ...loadedJoke, provider };
			}
		} catch (err) {
			console.error('Failed to load session:', err);
		} finally {
			loading = false;
			loadingJoke = false;
		}
	};

	loadSession();

	const handleUpVote = () => {
		if (upVote || downVote) return;
		upVote = true;
		showToast('Thanks for the feedback!', '👍');
	};

	const handleDownVote = () => {
		if (upVote || downVote) return;
		downVote = true;
		showToast('Thanks for the feedback!', '👎');
	};
</script>

<div class="{appearance.colorMeta.className} flex min-h-screen items-center justify-center p-4">
	<!-- Toast Notification -->
	{#if toast}
		{#key toast.id}
			<div
				class="toast-animate hud-frame pointer-events-none fixed z-50 flex flex-col items-center gap-2 px-8 py-5"
				style="top: 50%; left: 50%; transform: translate(-50%, -50%)"
			>
				<span class="text-5xl">{toast.emoji}</span>
				<span class="mono t-dim text-sm">{toast.message}</span>
			</div>
		{/key}
	{/if}

	<div class="w-full max-w-md text-center">
		<div class="hud-frame season-badge slide-up">
			<div class="hud-panel p-8">
				<!-- Success Animation -->
				<div class="mb-6">
					<div class="mb-4 text-6xl">🎉</div>
					<p class="mb-3"><span class="hud-label">That's a wrap</span></p>
					<h1 class="display mb-2 text-3xl">Standup Complete</h1>
					<p class="mono t-dim text-sm">Everyone said their piece.</p>
				</div>

				<!-- Session Info -->
				{#if !loading && session}
					<div class="hud-sub mb-6 p-4">
						<h3 class="display mb-1 text-base">{session.standup.name}</h3>
						<p class="mono t-dim text-xs">
							{session.users.filter((user) => !user.inactive).length}
							teammates participated
						</p>
					</div>
				{/if}

				<!-- Joke -->
				<div class="hud-frame mb-6">
					<div class="hud-panel p-5 text-lg">
						<div class="mb-4"><span class="hud-label">Dad Joke Incoming</span></div>
						{#if loadingJoke}
							<div class="flex flex-col items-center gap-6">
								<div class="loader"></div>
							</div>
						{:else if joke}
							<div class="flex flex-col gap-5 text-left">
								<h4 class="mono t-dim text-sm">{joke.provider}~</h4>
								<p>{joke.setup}</p>
								<p class="t-accent">{joke.punchline}</p>
								<p class="mono t-faint text-xs italic">- {joke.author}</p>
							</div>
						{:else}
							<div class="flex flex-col gap-5 text-left">
								<h4 class="mono t-dim text-sm">Standupper~</h4>
								<p>There was an error loading the joke...</p>
								<p class="t-accent">I'm serious, this is not a joke!</p>
								<p class="mono t-faint text-xs italic">- Server</p>
							</div>
						{/if}
						<div class="mt-5 flex items-center justify-center">
							<a
								href="http://crocs.dad"
								target="_blank"
								rel="noopener noreferrer"
								class="hud-link flex items-center gap-2 text-xs"
							>
								<img src="https://crocs.dad/favicon.svg" alt="" class="h-8 w-8" />
								powered by crocs.dad
							</a>
						</div>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="grid grid-cols-2 gap-3">
					<button
						onclick={handleUpVote}
						disabled={upVote || downVote}
						class="btn w-full {upVote ? 'btn-warn' : 'btn-ghost'}"
					>
						▲
					</button>
					<button
						onclick={handleDownVote}
						disabled={upVote || downVote}
						class="btn w-full {downVote ? 'btn-purple' : 'btn-ghost'}"
					>
						▼
					</button>
					<button
						onclick={() => goto(`/session/${standupId}`)}
						class="btn btn-primary col-span-2 w-full"
					>
						Start Over
					</button>
					<button
						onclick={() => (window.location.href = '/')}
						class="btn btn-ghost col-span-2 w-full"
					>
						Go Home
					</button>
				</div>

				<!-- Fun Stats -->
				<div class="mono t-faint mt-6 text-xs">
					<p>Great job on another productive standup! 🚀</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.loader {
		--b: 10px;
		width: calc(12 * var(--b));
		aspect-ratio: 1;
		border-radius: 50%;
		background:
			repeating-radial-gradient(
					calc(2 * var(--b)) at top,
					transparent -1px,
					var(--ink) 0 calc(50% - 1px),
					transparent 50% calc(100% - 1px)
				)
				calc(50% + var(--b)) 100%,
			repeating-radial-gradient(
					calc(2 * var(--b)) at bottom,
					var(--ink) -1px,
					transparent 0 calc(50% - 1px),
					var(--ink) 50% calc(100% - 1px)
				)
				50% 0;
		background-size: 150% 50%;
		background-repeat: no-repeat;
		mask:
			radial-gradient(
					calc(1.5 * var(--b)) at calc(100% - var(--b) / 2) 0,
					#fff0 calc(100% / 3),
					#fff calc(100% / 3 + 1px) 110%,
					#fff0 0
				)
				calc(50% + var(--b) / 2) 100% / calc(3 * var(--b)) 50% exclude no-repeat,
			conic-gradient(#fff 0 0);
		animation: l20 1s infinite linear;
	}
	@keyframes l20 {
		100% {
			transform: rotate(1turn);
		}
	}
	@keyframes toast-in-out {
		0% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.85);
		}
		15% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
		75% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.85);
		}
	}
	.toast-animate {
		animation: toast-in-out 1.6s ease forwards;
	}
</style>
