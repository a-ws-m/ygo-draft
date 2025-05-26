<script lang="ts">
	import { onMount } from 'svelte';
	import * as draftStore from '$lib/stores/draftStore.svelte';
	import CardList from './CardList.svelte';
	import RulesModal from './RulesModal.svelte';
	import { handleCardSelection } from '$lib/utils/draftManager.svelte';
	import FeatherIcon from 'feather-icons';

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
	async function selectCard(cardIndex: number) {
		if (draftStore.store.hasSelected) return;
		await handleCardSelection(cardIndex);
	}

	function toggleRulesModal() {
		showRulesModal = !showRulesModal;
	}
</script>

<RulesModal bind:isOpen={showRulesModal} draftMethod="rochester" />

{#if draftStore.store.playerFinished || draftStore.store.allFinished}
	<div class="flex flex-col gap-4">
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title text-success">Draft Finished!</h2>
				<p class="text-base-content">
					You have completed your draft. You can now view your full drafted deck below.
				</p>

				<div class="card bg-base-100 shadow-md">
					<div class="card-body">
						<h3 class="card-title text-lg">
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
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center">
						<h2 class="card-title">
							Rochester Draft - Round {roundDisplay}/{totalRounds}
						</h2>
						<button
							class="btn btn-circle btn-xs btn-ghost ml-2"
							onclick={toggleRulesModal}
							title="View Draft Rules"
						>
							?
						</button>
					</div>
					<div class="flex items-center gap-4">
						<span class="badge badge-outline">
							Pack rotation: {direction}
						</span>
						<span class="badge badge-outline">
							Waiting for {draftStore.store.numberOfPlayers -
								draftStore.store.selectedPlayers.length} players
						</span>
					</div>
				</div>

				{#if draftStore.store.hasSelected}
					<div class="alert alert-success mb-4">
						<p>You've made your selection for this round. Waiting for other players...</p>
					</div>
				{:else if currentPack && currentPack.length > 0}
					<div class="mb-4">
						<h3 class="mb-2 text-lg font-medium">
							Your Pack ({currentPack.length} cards)
						</h3>
						<CardList
							cube={currentPack}
							border={false}
							showDescription={true}
							clickable={!draftStore.store.hasSelected}
							onCardClick={selectCard}
							preferredViewMode="carousel"
						/>
					</div>
				{:else if !draftStore.store.allFinished}
					<div class="alert alert-info mb-4">
						<p>Waiting for pack update...</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Drafted Deck -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h3 class="card-title text-lg">
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
{/if}
