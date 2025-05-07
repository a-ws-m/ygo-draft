<script lang="ts">
	import { onMount } from 'svelte';
	import * as draftStore from '$lib/stores/draftStore.svelte';
	import CardList from './CardList.svelte';
	import RulesModal from './RulesModal.svelte';
	import { handleCardSelection } from '$lib/utils/draftManager.svelte';

	// Rules modal state
	let showRulesModal = $state(false);

	// Get the player's index in the participants array
	const playerIndex = $derived(draftStore.store.participants.indexOf(draftStore.store.userId));

	// Get the current pack for this player
	const currentPack = $derived(playerIndex !== -1 ? draftStore.getCurrentPack(playerIndex) : null);

	// Calculate round display (1-indexed for display)
	const roundDisplay = $derived(draftStore.store.currentRound + 1);

	// Calculate total rounds
	const totalRounds = $derived(draftStore.store.rounds.length);

	// Calculate direction based on current round (even = clockwise, odd = counter-clockwise)
	const direction = $derived(
		draftStore.store.currentRound % 2 === 0 ? 'Clockwise' : 'Counter-clockwise'
	);

	// Select a card from the current pack
	async function selectCard(cardIndex) {
		if (draftStore.store.hasSelected) return;
		await handleCardSelection(cardIndex);
	}
	
	function toggleRulesModal() {
		showRulesModal = !showRulesModal;
	}
</script>

<RulesModal bind:isOpen={showRulesModal} draftMethod="rochester" />

{#if draftStore.store.playerFinished || draftStore.store.allFinished}
	<div class="flex flex-col space-y-4">
		<div class="rounded-md bg-white p-4 shadow-md">
			<h2 class="mb-4 text-2xl font-bold text-green-600">Draft Finished!</h2>
			<p class="mb-4 text-gray-700">
				You have completed your draft. You can now view your full drafted deck below.
			</p>

			<div class="rounded-md bg-white p-4 shadow-md">
				<h3 class="mb-2 text-lg font-medium text-gray-700">
					Your Drafted Deck ({draftStore.store.draftedDeck.length} cards)
				</h3>
				<CardList
					cube={draftStore.store.draftedDeck}
					border={true}
					showYdkDownload={true}
					showChart={true}
				/>
			</div>
		</div>
	</div>
{:else}
	<div class="flex flex-col space-y-4">
		<div class="rounded-md bg-white p-4 shadow-md">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center">
					<h2 class="text-xl font-bold text-gray-700">
						Rochester Draft - Round {roundDisplay}/{totalRounds}
					</h2>
					<button 
						class="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300"
						onclick={toggleRulesModal}
						title="View Draft Rules"
					>
						?
					</button>
				</div>
				<div class="flex items-center space-x-4">
					<span class="text-sm font-medium text-gray-600">
						Pack rotation: {direction}
					</span>
					<span class="text-sm font-medium text-gray-600">
						Waiting for {draftStore.store.numberOfPlayers - draftStore.store.selectedPlayers.length} players
					</span>
				</div>
			</div>

			{#if draftStore.store.hasSelected}
				<div class="mb-4 rounded-md border border-green-200 bg-green-50 p-4">
					<p class="text-green-700">
						You've made your selection for this round. Waiting for other players...
					</p>
				</div>
			{:else if currentPack && currentPack.length > 0}
				<div class="mb-4">
					<h3 class="mb-2 text-lg font-medium text-gray-700">
						Your Pack ({currentPack.length} cards)
					</h3>
					<CardList
						cube={currentPack}
						border={false}
						startListView={false}
						showDescription={true}
						clickable={!draftStore.store.hasSelected}
						onCardClick={selectCard}
					/>
				</div>
			{:else if !draftStore.store.allFinished}
				<div class="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4">
					<p class="text-gray-700">Waiting for pack update...</p>
				</div>
			{/if}
		</div>

		<!-- Drafted Deck -->
		<div class="rounded-md bg-white p-4 shadow-md">
			<h3 class="mb-2 text-lg font-medium text-gray-700">
				Your Drafted Deck ({draftStore.store.draftedDeck.length} cards)
			</h3>
			<CardList
				cube={draftStore.store.draftedDeck}
				border={true}
				showYdkDownload={true}
				showChart={true}
			/>
		</div>
	</div>
{/if}
