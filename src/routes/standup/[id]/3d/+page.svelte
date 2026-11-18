<script lang="ts">
	import ForestStandupPage from '#lib/components/ForestStandupPage.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

{#key params.id}
	<ForestStandupPage standupId={params.id} />
{/key}
