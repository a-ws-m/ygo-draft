<script lang="ts">
	import * as draftStore from '$lib/stores/draftStore.svelte';

	// Function to get display text for last accepted pile
	function getLastAcceptedPileText(pileIndex: number): string {
		if (pileIndex === draftStore.store.numberOfPiles) {
			return 'Deck';
		}
		return (pileIndex + 1).toString();
	}
</script>

<div class="mb-4">
	<div class="flex items-center space-x-3 p-0.5">
		{#each draftStore.store.piles as pile, index}
			<div class="relative">
				<div
					class={`flex h-10 w-10 items-center justify-center rounded-md text-sm font-medium ${
						index === draftStore.store.currentPileIndex
							? 'bg-primary text-primary-content'
							: 'bg-base-300 text-base-content'
					} overflow-visible`}
					title={`Pile ${index + 1}: ${pile.length} cards${draftStore.store.lastAcceptedPile === index ? ' (Last Accepted)' : ''}`}
				>
					{pile.length}
				</div>
			</div>
		{/each}
		<div class="badge badge-lg">
			<span class="mr-1">Deck:</span>
			{draftStore.store.deck?.length || 0}
		</div>
		{#if draftStore.store.lastAcceptedPile !== null}
			<div class="badge badge-lg">
				<span class="mr-1">Last Accepted:</span>
				{getLastAcceptedPileText(draftStore.store.lastAcceptedPile)}
			</div>
		{/if}
	</div>
</div>
