<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Standup, StandupSession, UpdateStandupRequest, User } from '#lib/types.ts';
	import { ACCENT_COLORS, THEME_CHOICES } from '#lib/types.ts';
	import { COLOR_META, seasonalTheme, StandupAppearance, THEME_META } from '#lib/themes.svelte.ts';

	let { standupId }: { standupId: string } = $props();

	let session = $state<StandupSession | null>(null);
	let loading = $state(true);
	let error = $state('');
	let newUserName = $state('');
	let timerInput = $state('');
	let savingTimer = $state(false);
	let settingsOpen = $state(false);
	let addUserOpen = $state(false);
	// svelte-ignore state_referenced_locally
	const appearance = new StandupAppearance(standupId, () => session?.standup);

	const loadSession = async () => {
		try {
			const response = await fetch(`/api/standups/${standupId}/session`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error('Standup session not found');
				}
				throw new Error('Failed to load session');
			}
			const data: StandupSession = await response.json();
			session = data;
			timerInput = String(data.standup.timer_duration_minutes ?? 1);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load session';
		} finally {
			loading = false;
		}
	};

	loadSession();

	const setUsers = (fn: (users: User[]) => User[]) => {
		if (session) session = { ...session, users: fn(session.users) };
	};

	const handleSaveTimer = async (e: SubmitEvent) => {
		e.preventDefault();
		const parsed = Number(timerInput);
		if (!Number.isInteger(parsed) || parsed < 0) {
			error = 'Timer duration must be a non-negative whole number of minutes';
			return;
		}

		savingTimer = true;
		try {
			const response = await fetch(`/api/standups/${standupId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ timer_duration_minutes: parsed })
			});
			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: string };
				throw new Error(errorData.error || 'Failed to update settings');
			}
			const updated: Standup = await response.json();
			if (session) session = { ...session, standup: updated };
			timerInput = String(updated.timer_duration_minutes);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update settings';
		} finally {
			savingTimer = false;
		}
	};

	// Optimistically applies a color/theme change, rolling back on failure.
	const handleUpdateAppearance = async (patch: Pick<UpdateStandupRequest, 'color' | 'theme'>) => {
		if (!session) return;
		const prevStandup = session.standup;
		const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(
			(k) => patch[k] !== prevStandup[k]
		);
		if (!changed) return;

		session = { ...session, standup: { ...session.standup, ...patch } };

		try {
			const response = await fetch(`/api/standups/${standupId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!response.ok) {
				throw new Error('Failed to update appearance');
			}
			const updated: Standup = await response.json();
			if (session) session = { ...session, standup: updated };
		} catch (err) {
			if (session) session = { ...session, standup: prevStandup };
			error = err instanceof Error ? err.message : 'Failed to update appearance';
		}
	};

	const handleAddUser = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!newUserName.trim()) return;

		try {
			const response = await fetch('/api/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newUserName.trim(), standup_id: standupId })
			});
			if (!response.ok) {
				const errorData: { error?: string } = await response.json();
				throw new Error(errorData.error || 'Failed to add user');
			}
			newUserName = '';
			await loadSession();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to add user';
		}
	};

	const handleToggleInactive = async (user: User) => {
		const newInactive = !user.inactive;
		setUsers((users) =>
			users.map((u) =>
				u.id === user.id
					? { ...u, inactive: newInactive, starred: newInactive ? false : u.starred }
					: u
			)
		);

		try {
			const response = await fetch(`/api/users/${user.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ inactive: newInactive })
			});
			if (!response.ok) {
				throw new Error('Failed to update user');
			}
		} catch (err) {
			setUsers((users) =>
				users.map((u) => (u.id === user.id ? { ...u, inactive: user.inactive } : u))
			);
			error = err instanceof Error ? err.message : 'Failed to update user';
		}
	};

	const handleToggleStarred = async (user: User) => {
		const previousUsers = session?.users;
		const newStarred = !user.starred;
		setUsers((users) =>
			users.map((u) =>
				u.id === user.id ? { ...u, starred: newStarred } : newStarred ? { ...u, starred: false } : u
			)
		);

		try {
			const response = await fetch(`/api/users/${user.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ starred: newStarred })
			});
			if (!response.ok) {
				throw new Error('Failed to update user');
			}
		} catch (err) {
			if (previousUsers) setUsers(() => previousUsers);
			error = err instanceof Error ? err.message : 'Failed to update user';
		}
	};

	const handleBulkInactive = async (mode: 'all' | 'none' | 'invert') => {
		const previousUsers = session?.users;
		setUsers((users) =>
			users.map((u) => {
				const newInactive = mode === 'all' ? true : mode === 'none' ? false : !u.inactive;
				return { ...u, inactive: newInactive, starred: newInactive ? false : u.starred };
			})
		);

		try {
			const response = await fetch(`/api/standups/${standupId}/users/inactive`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode })
			});
			if (!response.ok) {
				throw new Error('Failed to update users');
			}
		} catch (err) {
			if (previousUsers) setUsers(() => previousUsers);
			error = err instanceof Error ? err.message : 'Failed to update users';
		}
	};

	const handleDeleteUser = async (userId: number) => {
		if (!confirm('Are you sure you want to delete this user?')) return;

		try {
			const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
			if (!response.ok) {
				throw new Error('Failed to delete user');
			}
			await loadSession();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete user';
		}
	};

	const handleStartStandup = () => {
		const activeUsers = session?.users.filter((user) => !user.inactive) || [];
		if (activeUsers.length === 0) {
			error = 'No active users to start standup';
			return;
		}
		goto(`/standup/${standupId}`);
	};

	const goHome = () => (window.location.href = '/');
</script>

{#if loading}
	<div class="color-green flex min-h-screen items-center justify-center">
		<p class="hud-label hud-label--bare blink">Loading session…</p>
	</div>
{:else if error && !session}
	<div class="color-green flex min-h-screen items-center justify-center p-4">
		<div class="space-y-4 text-center">
			<div class="alert">{error}</div>
			<button onclick={goHome} class="btn btn-primary">Go Home</button>
		</div>
	</div>
{:else}
	<div class="{appearance.colorMeta.className} min-h-screen py-8">
		<div class="mx-auto max-w-4xl px-4">
			<div class="hud-frame season-badge fade-in">
				<div class="hud-panel p-6">
					<div class="mb-6 flex items-start justify-between gap-4">
						<div>
							<p class="mb-3"><span class="hud-label">Lineup</span></p>
							<h1 class="display text-2xl">{session?.standup.name}</h1>
							<a
								class="hud-link text-xs"
								href="https://standupper.stup.dev/session/{standupId}"
								target="_blank"
							>
								ID: {standupId} ↗
							</a>
						</div>
						<button onclick={goHome} class="hud-link pt-1 text-xs whitespace-nowrap">← HOME</button>
					</div>

					{#if error}<div class="alert mb-4">{error}</div>{/if}

					<!-- Standup Settings -->
					<div class="hud-sub mb-4">
						<button
							type="button"
							onclick={() => (settingsOpen = !settingsOpen)}
							aria-expanded={settingsOpen}
							class="collapse-head flex w-full items-center justify-between px-4 py-3 text-left"
						>
							<span class="hud-label">Settings</span>
							<span
								class="t-dim transition-transform {settingsOpen ? 'rotate-180' : ''}"
								aria-hidden="true"
							>
								▾
							</span>
						</button>
						{#if settingsOpen}
							<form onsubmit={handleSaveTimer} class="px-4 pb-4">
								<label for="timer-duration" class="f-label">Timer duration (minutes)</label>
								<div class="flex gap-3">
									<input
										id="timer-duration"
										type="number"
										min={0}
										step={1}
										bind:value={() => timerInput, (v) => (timerInput = v == null ? '' : String(v))}
										class="field flex-1"
									/>
									<button
										type="submit"
										disabled={savingTimer ||
											timerInput === '' ||
											Number(timerInput) === (session?.standup.timer_duration_minutes ?? 1)}
										class="btn btn-primary"
									>
										{savingTimer ? 'Saving…' : 'Save'}
									</button>
								</div>
								<p class="mono t-faint mt-2 text-xs">Set to 0 for no time limit.</p>

								<!-- svelte-ignore a11y_label_has_associated_control -->
								<label class="f-label mt-5">Color</label>
								<div class="flex gap-3">
									{#each ACCENT_COLORS as c (c)}
										{@const selected = c === appearance.color}
										<button
											type="button"
											onclick={() => handleUpdateAppearance({ color: c })}
											aria-label="{c} color"
											aria-pressed={selected}
											title={c}
											class="swatch {selected ? 'swatch--on' : ''}"
											style:background-color={COLOR_META[c].hex}
										></button>
									{/each}
								</div>

								<!-- svelte-ignore a11y_label_has_associated_control -->
								<label class="f-label mt-5">Theme</label>
								<div class="seg-wrap">
									{#each THEME_CHOICES as t (t)}
										{@const selected = t === appearance.themeChoice}
										<button
											type="button"
											onclick={() => handleUpdateAppearance({ theme: t })}
											aria-pressed={selected}
											title={THEME_META[t].activeWhen}
											class="seg-btn {selected ? 'seg-btn--on' : ''}"
										>
											<span aria-hidden="true">{THEME_META[t].icon}</span>
											{THEME_META[t].label}
										</button>
									{/each}
								</div>
								{#if appearance.themeChoice === 'automatic'}
									<p class="mono t-faint mt-2 text-xs">
										{`Automatic chooses the currently-active alternate theme. Showing ${
											THEME_META[seasonalTheme()].label
										} right now.`}
									</p>
								{/if}
							</form>
						{/if}
					</div>

					<!-- Add User Form -->
					<div class="hud-sub mb-6">
						<button
							type="button"
							onclick={() => (addUserOpen = !addUserOpen)}
							aria-expanded={addUserOpen}
							class="collapse-head flex w-full items-center justify-between px-4 py-3 text-left"
						>
							<span class="hud-label">Add Teammate</span>
							<span
								class="t-dim transition-transform {addUserOpen ? 'rotate-180' : ''}"
								aria-hidden="true"
							>
								▾
							</span>
						</button>
						{#if addUserOpen}
							<form onsubmit={handleAddUser} class="px-4 pb-4">
								<div class="flex gap-3">
									<input
										type="text"
										bind:value={newUserName}
										placeholder="Name"
										class="field flex-1"
									/>
									<button type="submit" disabled={!newUserName.trim()} class="btn btn-primary">
										Add
									</button>
								</div>
							</form>
						{/if}
					</div>

					<!-- Users List -->
					<div class="mb-6">
						<div class="mb-3 flex flex-wrap items-center justify-between gap-4">
							<h3 class="hud-label">
								Roster [{String(session?.users.length || 0).padStart(2, '0')}]
							</h3>
							<div class="flex items-center gap-2">
								<span class="t-dim">🪑:</span>
								<div class="flex">
									<button onclick={() => handleBulkInactive('none')} class="seg-btn">None</button>
									<button onclick={() => handleBulkInactive('all')} class="seg-btn">All</button>
									<button onclick={() => handleBulkInactive('invert')} class="seg-btn">
										Invert
									</button>
								</div>
							</div>
						</div>
						{#if session?.users.length === 0}
							<p class="mono t-faint py-8 text-center text-sm">
								No one on the roster yet — add someone above.
							</p>
						{:else}
							<div
								class="grid gap-2"
								style="grid-template-columns: repeat(auto-fit, minmax(20ch, 1fr))"
							>
								{#each session?.users ?? [] as user (user.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
									<div
										onclick={() => handleToggleInactive(user)}
										class="group crew-chip {user.inactive ? 'crew-chip--inactive' : ''}"
									>
										<span class="font-medium {user.inactive ? 'user-inactive' : ''}">
											{user.name}
										</span>
										<div class="flex items-center gap-2">
											<button
												onclick={(e) => {
													e.stopPropagation();
													handleToggleStarred(user);
												}}
												class="transition-opacity {user.starred
													? 'opacity-100'
													: 't-faint opacity-0 group-hover:opacity-100 focus:opacity-100'}"
												title={user.starred
													? 'Starred — will deliver the joke'
													: 'Star to deliver the joke'}
											>
												{user.starred ? '⭐' : '☆'}
											</button>
											<button
												onclick={(e) => {
													e.stopPropagation();
													handleDeleteUser(user.id);
												}}
												class="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
												title="Delete user"
											>
												🗑️
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Start Standup Button -->
					<button
						onclick={handleStartStandup}
						disabled={!session?.users.some((user) => !user.inactive)}
						class="btn btn-primary btn-lg w-full"
					>
						Start Standup
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
