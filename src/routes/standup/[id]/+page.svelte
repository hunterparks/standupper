<script lang="ts">
	import StandupPage from '#lib/components/StandupPage.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

{#key params.id}
	<StandupPage standupId={params.id} />
{/key}
