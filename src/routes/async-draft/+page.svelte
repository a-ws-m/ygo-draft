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

	async function confirmSelections(selectedIndices) {
		if (selectedIndices.length !== picksRemaining) {
			showToastNotification(`Please select exactly ${picksRemaining} cards.`, 'error');
			return;
		}

		isConfirming = true;
		try {
			// Update all selected cards
			for (const index of selectedIndices) {
				const selectedCard = currentPack.find(card => card.card_index === index);
				if (selectedCard) {
					await pickCardInAsyncDraft(draftId, draftStore.store.userId, index);

					// Add to drafted deck
					draftStore.store.draftedDeck = [...draftStore.store.draftedDeck, selectedCard];
					currentPickCount++;
				}
			}

			// Show toast notification
			showToastNotification(`Added ${selectedIndices.length} cards to your deck!`);

			// Update picks remaining
			picksRemaining = 0;

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

	onMount(() => {
		if (authStore.session) {
			setupDraft();
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
									Pack {packNumber}/{totalPacks}
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
								<!-- Use the CardList component with multiple selection -->
								<CardList 
									cube={currentPack}
									selectMultiple={picksRemaining}
									onSelectionConfirm={confirmSelections}
								/>
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
