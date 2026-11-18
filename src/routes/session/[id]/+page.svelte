<script lang="ts">
	import SessionPage from '#lib/components/SessionPage.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

{#key params.id}
	<SessionPage standupId={params.id} />
{/key}
