<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import CardList from '$lib/components/CardList.svelte';
	import RulesModal from '$lib/components/RulesModal.svelte';
	import LoginPrompt from '$lib/components/LoginPrompt.svelte';
	import * as draftStore from '$lib/stores/draftStore.svelte';
	import { store as authStore } from '$lib/stores/authStore.svelte';
	import {
		loadAsyncDraftPack,
		pickCardInAsyncDraft,
		loadPickedCards,
		getAsyncDraftDetails,
		isAsyncDraftCompleted,
		updateDraftStatus,
		joinAsyncDraft
	} from '$lib/utils/asyncDraftManager';
	import feather from 'feather-icons';

	// Draft state
	let draftId = $state('');
	let isLoading = $state(true);
	let loadError = $state(null);
	let showRulesModal = $state(false);
	let linkCopied = $state(false);
	let shareableUrl = $state('');

	// Async draft specific state
	let currentPack = $state([]);
	let picksRemaining = $state(0);
	let packNumber = $state(0);
	let totalPacks = $state(0);
	let pickedCardsInPack = $state<number[]>([]);
	let draftCompleted = $state(false);
	let packSize = $state(0);
	let picksPerPack = $state(0);
	let targetDeckSize = $state(0);
	let currentPickCount = $state(0);
	let participants = $state<string[]>([]);
	let isParticipant = $state(false);
	let joiningDraft = $state(false);
	let selectedCards = $state<{ card: any; index: number }[]>([]);
	let isConfirming = $state(false);

	// Toast notification
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state('success');

	// Interval reference
	let refreshInterval = $state(null);

	function showToastNotification(message, type = 'success') {
		toastMessage = message;
		toastType = type;
		showToast = true;

		setTimeout(() => {
			showToast = false;
		}, 3000);
	}

	function toggleRulesModal() {
		showRulesModal = !showRulesModal;
	}

	function copyShareableLink() {
		navigator.clipboard
			.writeText(shareableUrl)
			.then(() => {
				linkCopied = true;
				setTimeout(() => {
					linkCopied = false;
				}, 3000);
			})
			.catch((err) => {
				console.error('Could not copy text: ', err);
			});
	}

	function toggleCardSelection(card) {
		const isSelected = selectedCards.some((selected) => selected.index === card.card_index);

		if (isSelected) {
			// Remove card from selection
			selectedCards = selectedCards.filter((selected) => selected.index !== card.card_index);
		} else {
			// Add card to selection if we haven't reached the maximum
			if (selectedCards.length < picksRemaining) {
				selectedCards = [...selectedCards, { card, index: card.card_index }];
			}
		}
	}

	async function confirmSelections() {
		if (selectedCards.length !== picksRemaining) {
			showToastNotification(`Please select exactly ${picksRemaining} cards.`, 'error');
			return;
		}

		isConfirming = true;
		try {
			// Update all selected cards
			for (const selection of selectedCards) {
				await pickCardInAsyncDraft(draftId, draftStore.store.userId, selection.index);

				// Add to drafted deck
				draftStore.store.draftedDeck = [...draftStore.store.draftedDeck, selection.card];
				currentPickCount++;
			}

			// Show toast notification
			showToastNotification(`Added ${selectedCards.length} cards to your deck!`);

			// Update picks remaining
			picksRemaining = 0;
			selectedCards = [];

			// Load next pack
			await loadCurrentPack();

			// Check if draft is completed
			if (currentPickCount >= targetDeckSize) {
				draftCompleted = true;
				// Update draft status to mark this user as completed
				await updateDraftStatus(draftId, draftStore.store.userId);
			}
		} catch (error) {
			console.error('Error confirming selections:', error);
			loadError = error.message;
			showToastNotification(`Error: ${error.message}`, 'error');
		} finally {
			isConfirming = false;
		}
	}

	async function loadCurrentPack() {
		if (draftCompleted || !isParticipant) return;

		try {
			// Reset picked cards in current pack
			pickedCardsInPack = [];
			selectedCards = [];

			// If no picks remaining in the current pack, move to the next pack
			if (picksRemaining <= 0) {
				// Move to the next pack
				packNumber++;

				if (packNumber > totalPacks) {
					// All packs processed, draft is complete
					draftCompleted = true;
					return;
				}

				picksRemaining = picksPerPack;
			}

			// Get cards for the current pack
			currentPack = await loadAsyncDraftPack(
				draftId,
				draftStore.store.userId,
				packNumber,
				packSize
			);

			// If pack is empty or has fewer cards than picks remaining, try to load the next pack
			if (currentPack.length === 0 || currentPack.length < picksRemaining) {
				// Move to the next pack
				packNumber++;

				if (packNumber > totalPacks) {
					// All packs processed, draft is complete
					draftCompleted = true;
					return;
				}

				picksRemaining = picksPerPack;

				// Load the next pack
				currentPack = await loadAsyncDraftPack(
					draftId,
					draftStore.store.userId,
					packNumber,
					packSize
				);

				if (currentPack.length === 0) {
					// No more cards available
					draftCompleted = true;
				}
			}
		} catch (error) {
			console.error('Error loading current pack:', error);
			loadError = error.message;
		}
	}

	async function loadDraftData() {
		isLoading = true;
		loadError = null;

		try {
			let { data: draft, error: draftError } = await supabase
				.from('drafts')
				.select('*')
				.eq('id', draftId)
				.single();

			if (draftError) {
				throw new Error('Failed to fetch draft data: ' + draftError.message);
			}

			// Get async draft details
			let draftDetails = await getAsyncDraftDetails(draftId);

			packSize = draftDetails.packSize;
			picksPerPack = draftDetails.picksPerPack;
			targetDeckSize = draftDetails.targetDeckSize;
			totalPacks = draftDetails.totalPacks;
			packNumber = draftDetails.currentPackNumber;
			picksRemaining = draftDetails.picksRemainingInPack;
			participants = draftDetails.participants;

			// Check if current user is a participant
			isParticipant = participants.includes(draftStore.store.userId);

			let draftInfo = {
				id: draftId,
				draftMethod: draft.draft_method,
				poolSize: draft.pool_size,
				numberOfPlayers: draft.number_of_players,
				connectedUsers: draft.connected_users,
				packSize: draft.pack_size,
				draftStarted: draft.status === 'active',
				draftedDeckSize:
					draft.drafted_deck_size || Math.floor(draft.pool_size / draft.number_of_players)
			};

			draftStore.initializeDraft(draftInfo);

			if (isParticipant) {
				// Load drafted cards if any
				await loadDraftedCards();

				// Load the first pack or continue from where the user left off
				await loadCurrentPack();
			}
		} catch (error) {
			console.error('Error loading draft:', error);
			loadError = error.message;
		} finally {
			isLoading = false;
		}
	}

	async function joinDraft() {
		if (!draftId || !draftStore.store.userId) return;

		joiningDraft = true;
		try {
			await joinAsyncDraft(draftId);
			showToastNotification('Successfully joined draft!', 'success');
			await loadDraftData(); // Reload draft data after joining
		} catch (error) {
			console.error('Error joining draft:', error);
			showToastNotification(`Error: ${error.message}`, 'error');
		} finally {
			joiningDraft = false;
		}
	}

	async function loadDraftedCards() {
		try {
			// Get cards that have already been picked by this user
			let draftedCards = await loadPickedCards(draftId, draftStore.store.userId);

			// Update drafted deck and current pick count
			draftStore.store.draftedDeck = draftedCards || [];
			currentPickCount = draftedCards?.length || 0;

			// Check if draft is completed
			draftCompleted = await isAsyncDraftCompleted(
				draftId,
				draftStore.store.userId,
				targetDeckSize
			);
		} catch (error) {
			console.error('Error loading drafted cards:', error);
			throw error;
		}
	}

	async function setupDraft() {
		let newDraftId = new URLSearchParams(window.location.search).get('id') || '';

		if (!newDraftId) {
			loadError = 'No draft ID provided. Please check the URL.';
			isLoading = false;
			return;
		}

		draftId = newDraftId;
		shareableUrl = `${window.location.origin}${window.location.pathname}?id=${draftId}`;

		draftStore.store.userId = authStore.session?.user?.id || '';
		console.log('User ID:', draftStore.store.userId);

		if (!draftStore.store.userId) {
			loadError = 'You must be logged in to participate in a draft.';
			isLoading = false;
			return;
		}

		await loadDraftData();
	}

	function startRefreshInterval() {
		if (!refreshInterval && !draftCompleted && isParticipant) {
			refreshInterval = setInterval(async () => {
				if (!draftCompleted && currentPack.length > 0) {
					await loadCurrentPack();
				}
			}, 30000); // Refresh every 30 seconds
		}
	}

	onMount(() => {
		if (authStore.session) {
			setupDraft().then(() => {
				startRefreshInterval();
			});
		} else {
			isLoading = false;
		}
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});
</script>

<svelte:head>
	<title>YGO Async Draft {draftId}</title>
	<meta name="description" content="Yu-Gi-Oh! Asynchronous Draft Experience" />
</svelte:head>

<RulesModal isOpen={showRulesModal} draftMethod="asynchronous" />

<div class="bg-base-200 min-h-screen">
	{#if isLoading}
		<div class="flex items-center justify-center p-8">
			<span class="loading loading-spinner loading-lg text-primary"></span>
			<p class="ml-3">Loading draft data...</p>
		</div>
	{:else if loadError && loadError !== 'You must be logged in to participate in a draft.'}
		<div class="alert alert-error m-4 shadow-lg" role="alert">
			<div class="flex-none">
				{@html feather.icons['x-circle'].toSvg({ class: 'h-6 w-6 shrink-0 stroke-current' })}
			</div>
			<div>
				<span class="font-bold">Error:</span>
				<span>{loadError}</span>
			</div>
			<button class="btn btn-error btn-sm" onclick={loadDraftData}> Retry </button>
		</div>
	{:else if !authStore.session}
		<div class="card bg-base-100 m-6 shadow-xl">
			<div class="card-body">
				<h1 class="card-title text-3xl">Async Draft Room: {draftId}</h1>
				<p class="text-xl">Please login to join this draft</p>
				<LoginPrompt />
			</div>
		</div>
	{:else if !isParticipant}
		<div class="card bg-base-100 m-6 shadow-xl">
			<div class="card-body">
				<h1 class="card-title text-3xl">Async Draft Room: {draftId}</h1>
				<p class="text-xl">You are not a participant in this draft</p>
				<p>Current participants: {participants.length}/{draftStore.store.numberOfPlayers}</p>
				<div class="card-actions mt-4 justify-center">
					<button
						class="btn btn-primary btn-lg"
						onclick={joinDraft}
						disabled={joiningDraft || participants.length >= draftStore.store.numberOfPlayers}
					>
						{#if joiningDraft}
							<span class="loading loading-spinner loading-sm"></span>
							Joining...
						{:else}
							Join Draft
						{/if}
					</button>
				</div>
			</div>
		</div>
	{:else}
		<div class="navbar bg-base-100 shadow-md">
			<div class="navbar-start">
				<p class="text-lg">Draft ID: {draftId}</p>
			</div>
			<div class="navbar-center">
				<div class="stats shadow">
					<div class="stat place-items-center">
						<div class="stat-title">Pack</div>
						<div class="stat-value text-primary">{packNumber}/{totalPacks}</div>
						<div class="stat-desc">{Math.round((packNumber / totalPacks) * 100)}% complete</div>
					</div>
					<div class="stat place-items-center">
						<div class="stat-title">Picks</div>
						<div class="stat-value text-secondary">{currentPickCount}/{targetDeckSize}</div>
						<div class="stat-desc">
							{Math.round((currentPickCount / targetDeckSize) * 100)}% complete
						</div>
					</div>
					<div class="stat place-items-center">
						<div class="stat-title">This Pack</div>
						<div class="stat-value">{picksPerPack - picksRemaining}/{picksPerPack}</div>
						<div class="stat-desc">{picksRemaining} picks remaining</div>
					</div>
				</div>
			</div>
			<div class="navbar-end">
				<button class="btn btn-ghost btn-sm" onclick={toggleRulesModal}>
					Rules
					<span class="ml-1">
						{@html feather.icons['help-circle'].toSvg({ width: 16, height: 16 })}
					</span>
				</button>
				<button class="btn btn-ghost btn-sm" onclick={copyShareableLink}>
					{linkCopied ? 'Copied!' : 'Share'}
					<span class="ml-1">
						{@html feather.icons.clipboard.toSvg({ width: 16, height: 16 })}
					</span>
				</button>
			</div>
		</div>

		<div class="container mx-auto p-4">
			{#if draftCompleted}
				<div class="flex w-full flex-col items-center p-6">
					<div class="alert alert-success mb-4 shadow-lg">
						<div class="flex-none">
							{@html feather.icons['check-circle'].toSvg()}
						</div>
						<div>
							<h3 class="font-bold">Draft Completed!</h3>
							<div class="text-xs">You have successfully completed your asynchronous draft.</div>
						</div>
					</div>
					<div class="card bg-base-100 w-full shadow-xl md:w-2/3">
						<div class="card-body">
							<h2 class="card-title">
								Your Drafted Deck ({draftStore.store.draftedDeck.length} cards)
							</h2>
							<div class="divider"></div>
							<CardList
								cube={draftStore.store.draftedDeck}
								showYdkDownload={true}
								showChart={true}
							/>
						</div>
					</div>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<!-- Current Pack -->
					<div class="card bg-base-100 shadow-xl">
						<div class="card-body">
							<h2 class="card-title">
								Current Pack ({currentPack.length} cards)
								<div class="badge badge-primary">
									Pick {picksPerPack - picksRemaining + 1}/{picksPerPack}
								</div>
							</h2>
							<div class="divider"></div>

							{#if currentPack.length === 0}
								<div class="alert alert-warning shadow-lg">
									<div class="flex-none">
										{@html feather.icons['alert-triangle'].toSvg()}
									</div>
									<div>
										<h3 class="font-bold">No Cards Available</h3>
										<div class="text-xs">
											There are no cards available for this pack. This may happen if all cards have
											been drafted by other players.
										</div>
									</div>
									<div>
										<button class="btn btn-sm btn-outline" onclick={loadCurrentPack}>
											Try Next Pack
										</button>
									</div>
								</div>
							{:else}
								<!-- Cards selection instructions -->
								<div class="alert alert-info mb-4">
									<div class="flex-none">
										{@html feather.icons['info'].toSvg({ class: 'h-5 w-5' })}
									</div>
									<div>
										<p>
											Select {picksRemaining} cards from this pack, then confirm your selection.
										</p>
										<p class="mt-1 text-sm">
											You've selected {selectedCards.length} of {picksRemaining} cards
										</p>
									</div>
								</div>

								<!-- Custom cards display with selection functionality -->
								<div
									class="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
								>
									{#each currentPack as card}
										<div
											class="card card-compact bg-base-300 hover:bg-primary hover:bg-opacity-20 cursor-pointer transition-all
                                              {selectedCards.some(
												(s) => s.index === card.card_index
											)
												? 'bg-primary bg-opacity-20 border-primary border-2'
												: ''}
                                              {selectedCards.length >= picksRemaining &&
											!selectedCards.some((s) => s.index === card.card_index)
												? 'opacity-50'
												: ''}"
											onclick={() => toggleCardSelection(card)}
										>
											<figure>
												<img
													src={card.imageUrl || card.image_url}
													alt={card.name || card.card_name}
													loading="lazy"
												/>
											</figure>
											<div class="card-body p-2">
												<h3 class="card-title text-sm">{card.name || card.card_name}</h3>
												{#if card.apiData?.rarity || card.api_data?.rarity}
													<div class="badge badge-sm badge-outline">
														{card.custom_rarity || card.apiData?.rarity || card.api_data?.rarity}
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>

								<!-- Confirmation button -->
								<div class="card-actions mt-6 justify-end">
									<button
										class="btn btn-primary btn-lg"
										disabled={selectedCards.length !== picksRemaining || isConfirming}
										onclick={confirmSelections}
									>
										{#if isConfirming}
											<span class="loading loading-spinner loading-sm"></span>
											Confirming...
										{:else}
											Confirm Selection ({selectedCards.length}/{picksRemaining})
										{/if}
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Drafted Deck -->
					<div class="card bg-base-100 shadow-xl">
						<div class="card-body">
							<h2 class="card-title">
								Your Drafted Cards
								<div class="badge badge-secondary">
									{draftStore.store.draftedDeck.length}/{targetDeckSize}
								</div>
							</h2>
							<div class="divider"></div>
							<CardList
								cube={draftStore.store.draftedDeck}
								showYdkDownload={true}
								showChart={true}
							/>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if showToast}
		<div class="toast toast-top toast-end z-50">
			<div class="alert {toastType === 'success' ? 'alert-success' : 'alert-error'} shadow-lg">
				<div>
					<span
						>{@html feather.icons[
							toastType === 'success' ? 'check-circle' : 'alert-circle'
						].toSvg()}</span
					>
					<span>{toastMessage}</span>
				</div>
			</div>
		</div>
	{/if}
</div>
