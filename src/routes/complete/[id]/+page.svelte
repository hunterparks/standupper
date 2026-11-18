<script lang="ts">
	import CompletePage from '#lib/components/CompletePage.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

{#key params.id}
	<CompletePage standupId={params.id} />
{/key}
