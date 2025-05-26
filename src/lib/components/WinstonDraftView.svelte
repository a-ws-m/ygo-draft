<script lang="ts">
	import * as draftStore from '$lib/stores/draftStore.svelte';
	import CardList from './CardList.svelte';
	import WinstonPileSelector from './WinstonPileSelector.svelte';
	import feather from 'feather-icons';
	import { handleAcceptPile, handleDeclineCurrentPile } from '$lib/utils/winstonDraftLogic';
	import { canPlayerDeclineCurrentOption } from '$lib/utils/draftManager.svelte';

	// Determine if current user is the active player
	const isActivePlayer = $derived(
		draftStore.store.currentPlayer ===
			draftStore.store.participants.indexOf(draftStore.store.userId)
	);

	// Determine if player can decline the current pile
	const canDecline = $derived(canPlayerDeclineCurrentOption());
</script>

<div class="flex flex-col gap-4 p-6 lg:flex-row">
	<div class="border-base-300 flex-1 overflow-y-auto lg:border-r lg:pr-4">
		{#if isActivePlayer}
			<WinstonPileSelector />

			{#if draftStore.store.piles.length > draftStore.store.currentPileIndex}
				<CardList
					cube={draftStore.store.piles[draftStore.store.currentPileIndex]}
					border={false}
					showDescription={true}
				/>
				<div class="mt-2 flex justify-between">
					<button class="btn btn-success" onclick={handleAcceptPile}>Accept</button>
					{#if canDecline}
						<button class="btn btn-error" onclick={handleDeclineCurrentPile}>Decline</button>
					{/if}
				</div>
			{:else}
				<p class="text-base-content opacity-70">Loading pile data...</p>
			{/if}
		{:else}
			<div class="alert">
				<div class="flex-none">
					{@html feather.icons.clock.toSvg()}
				</div>
				<span>Waiting for the current player...</span>
			</div>
		{/if}
	</div>

	<div class="mt-4 w-full lg:mt-0 lg:w-1/4 lg:pl-4">
		<div class="card bg-base-100 shadow-lg">
			<div class="card-body">
				<h2 class="card-title">Your Drafted Deck</h2>
				<CardList
					cube={draftStore.store.draftedDeck}
					border={true}
					showYdkDownload={true}
					showChart={true}
				/>
			</div>
		</div>
	</div>
</div>
