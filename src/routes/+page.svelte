<script lang="ts">
	import { goto } from '$app/navigation';
	import { useSiteTheme } from '#lib/themes.svelte.ts';
	import type { Standup } from '#lib/types.ts';

	let standupName = $state('');
	let sessionId = $state('');
	let loading = $state(false);
	let error = $state('');
	useSiteTheme(() => 'automatic');

	const handleCreateStandup = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!standupName.trim()) return;

		loading = true;
		error = '';
		try {
			const response = await fetch('/api/standups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: standupName.trim() })
			});
			if (!response.ok) {
				const errorData: { error?: string } = await response.json();
				throw new Error(errorData.error || 'Failed to create standup');
			}
			const standup: Standup = await response.json();
			goto(`/session/${standup.id}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create standup';
		} finally {
			loading = false;
		}
	};

	const handleJoinStandup = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!sessionId.trim()) return;

		loading = true;
		error = '';
		try {
			const response = await fetch(`/api/standups/${sessionId.trim()}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error('Standup session not found');
				}
				const errorData: { error?: string } = await response.json();
				throw new Error(errorData.error || 'Failed to join standup');
			}
			goto(`/session/${sessionId.trim()}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join standup';
		} finally {
			loading = false;
		}
	};
</script>

<div class="color-green flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-md space-y-6">
		<header class="fade-in text-center">
			<p class="mb-4">
				<span class="hud-label">Daily Standup</span>
			</p>
			<h1 class="display text-5xl">STAND<span class="t-accent">UPPER</span></h1>
			<p class="mono t-dim mt-3 text-sm">Stand up. Say your bit. Sit down.</p>
		</header>

		{#if error}<div class="alert">{error}</div>{/if}

		<div class="space-y-5">
			<!-- Create New Standup -->
			<div class="hud-frame season-badge">
				<div class="hud-panel p-6">
					<div class="hud-label mb-5">New Session</div>
					<form onsubmit={handleCreateStandup} class="space-y-4">
						<div>
							<label for="standup-name" class="f-label">Standup Name</label>
							<input
								id="standup-name"
								type="text"
								bind:value={standupName}
								placeholder="e.g., Frontend Team Daily"
								class="field"
								disabled={loading}
							/>
						</div>
						<button
							type="submit"
							disabled={!standupName.trim() || loading}
							class="btn btn-primary w-full"
						>
							{loading ? 'Creating…' : 'Create Standup'}
						</button>
					</form>
				</div>
			</div>

			<!-- Join Existing Standup -->
			<div class="hud-frame">
				<div class="hud-panel p-6">
					<div class="hud-label mb-5">Existing Session</div>
					<form onsubmit={handleJoinStandup} class="space-y-4">
						<div>
							<label for="session-id" class="f-label">Session ID</label>
							<input
								id="session-id"
								type="text"
								bind:value={sessionId}
								placeholder="Enter session ID"
								class="field"
								disabled={loading}
							/>
						</div>
						<button
							type="submit"
							disabled={!sessionId.trim() || loading}
							class="btn btn-ghost w-full"
						>
							{loading ? 'Joining…' : 'Join Standup'}
						</button>
					</form>
				</div>
			</div>
		</div>
	</div>
</div>
