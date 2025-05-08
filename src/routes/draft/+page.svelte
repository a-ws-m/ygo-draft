<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { handleAcceptPile, handleDeclineCurrentPile } from '$lib/utils/winstonDraftLogic';
	import { initializeDraft, handleDraftBroadcast } from '$lib/utils/draftManager.svelte';
	import { startDraftInDB } from '$lib/utils/supabaseDraftManager';
	import CardList from '$lib/components/CardList.svelte';
	import RochesterDraftView from '$lib/components/RochesterDraftView.svelte';
	import RulesModal from '$lib/components/RulesModal.svelte';
	import LoginPrompt from '$lib/components/LoginPrompt.svelte';
	import * as draftStore from '$lib/stores/draftStore.svelte';
	import { canPlayerDeclineCurrentOption } from '$lib/utils/draftManager.svelte';
	import { store as authStore } from '$lib/stores/authStore.svelte';

	$inspect('participants', draftStore.store.participants);

	// Get the draft ID from URL query parameter
	let draftId = $state('');

	// Local state for loading and errors
	let isLoading = $state(true);
	let loadError = $state(null);
	let isCreator = $state(false);
	let showRulesModal = $state(false);
	let linkCopied = $state(false);
	let shareableUrl = $state('');

	let isActivePlayer = $derived.by(() => {
		if (
			!draftStore.store.participants ||
			!draftStore.store.userId ||
			!draftStore.store.draftStarted
		)
			return false;
		return (
			draftStore.store.currentPlayer ===
			draftStore.store.participants.indexOf(draftStore.store.userId)
		);
	});

	let canDecline = $derived.by(() => {
		if (draftStore.store.draftMethod === 'winston') {
			return canPlayerDeclineCurrentOption();
		}
		return false;
	});

	// Function to toggle the rules modal
	function toggleRulesModal() {
		showRulesModal = !showRulesModal;
	}

	// Function to copy the draft link to clipboard
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

	// Function to handle the window's beforeunload event
	function handleBeforeUnload(event) {
		// Only show warning if draft has started and is not finished
		if (draftStore.store.draftStarted && !draftStore.store.allFinished) {
			// Standard way of showing a confirmation dialog when leaving
			event.preventDefault();
			// Set a return value for older browsers
			event.returnValue =
				'You are in the middle of a draft. You cannot return, and the draft will break for other players. Are you sure you want to leave?';
			return event.returnValue;
		}
	}

	// Load draft data
	async function loadDraftData() {
		isLoading = true;
		loadError = null;

		try {
			// Fetch draft information
			const { data: draft, error: draftError } = await supabase
				.from('drafts')
				.select('*')
				.eq('id', draftId)
				.single();

			if (draftError) {
				throw new Error('Failed to fetch draft data: ' + draftError.message);
			}

			// Check if the current user is the creator of the draft
			const {
				data: { user }
			} = await supabase.auth.getUser();
			isCreator = user && draft.created_by === user.id;

			// Transform database model to app model and initialize the draft store
			const draftInfo = {
				id: draftId,
				draftMethod: draft.draft_method,
				poolSize: draft.pool_size,
				numberOfPlayers: draft.number_of_players,
				connectedUsers: draft.connected_users,
				numberOfPiles: draft.number_of_piles || 3,
				packSize: draft.pack_size || 15,
				draftStarted: draft.status === 'active'
			};

			// Initialize the draft store
			draftStore.initializeDraft(draftInfo);

			console.log('Draft initialized with data:', draftInfo);
		} catch (error) {
			console.error('Error loading draft:', error);
			loadError = error.message;
		} finally {
			isLoading = false;
		}
	}

	// Function to create and set up the draft channel
	async function createDraftChannel() {
		// Apply workaround for Supabase Realtime auth issue #1111
		// https://github.com/supabase/realtime/issues/1111
		await supabase.realtime.setAuth();

		// Clean up existing channel if it exists
		if (draftStore.store.channel) {
			draftStore.store.channel.unsubscribe();
		}

		// Join the presence channel for the draft
		const channel = supabase.channel(`draft-room-${draftId}`, {
			config: {
				presence: {
					key: draftStore.store.userId
				},
				broadcast: {
					ack: true
				},
				private: true
			}
		});
		draftStore.store.channel = channel;

		// Subscribe to presence state changes
		channel.on('presence', { event: 'sync' }, () => {
			const state = channel.presenceState();
			console.log('Presence state updated:', state);
			draftStore.store.connectedUsers = Object.keys(state).length;
			draftStore.store.participants = Object.keys(state).sort();
			draftStore.store.draftReady =
				draftStore.store.connectedUsers === draftStore.store.numberOfPlayers;
		});

		// Subscribe to presence join events
		channel.on('presence', { event: 'join' }, ({ newPresences }) => {
			console.log('New users joined:', newPresences);
		});

		// Subscribe to presence leave events
		channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
			console.log('Users left:', leftPresences);
		});

		// Subscribe to the channel
		channel.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				console.log('Subscribed to presence channel');

				const trackResponse = await channel.track({
					userId: draftStore.store.userId,
					status: 'online'
				});

				if (trackResponse.error) {
					console.error('Error tracking presence:', trackResponse.error);

					// Add debug info for presence tracking errors
					console.debug('Debug info for presence tracking error:');
					console.debug('- Draft ID:', draftId);
					console.debug('- User ID:', draftStore.store.userId);

					// Check if user is participant using RPC
					try {
						const { data, error } = await supabase.rpc('is_draft_participant', {
							draft_id: draftId
						});
						console.debug('- is_draft_participant result:', data);
						if (error) console.debug('- is_draft_participant error:', error);
					} catch (e) {
						console.debug('- Failed to call is_draft_participant:', e);
					}

					// Check draft status
					try {
						const { data, error } = await supabase
							.from('drafts')
							.select('status, participants')
							.eq('id', draftId)
							.single();
						console.debug('- Draft status:', data?.status);
						console.debug('- Participants:', data?.participants);
						if (error) console.debug('- Draft query error:', error);
					} catch (e) {
						console.debug('- Failed to query draft:', e);
					}
				} else {
					console.log('User presence tracked successfully');
				}
			} else {
				console.error('Failed to subscribe to presence channel:', status);
				// Add debug info for subscription failures
				console.debug('Debug info for subscription failure:');
				console.debug('- Draft ID:', draftId);
				console.debug('- User ID:', draftStore.store.userId);

				try {
					const { data, error } = await supabase.rpc('is_draft_participant', { draft_id: draftId });
					console.debug('- is_draft_participant result:', data);
					if (error) console.debug('- is_draft_participant error:', error);
				} catch (e) {
					console.debug('- Failed to call is_draft_participant:', e);
				}
			}
		});

		// Set up broadcast event listeners
		setupBroadcastListeners(channel);

		return channel;
	}

	function setupBroadcastListeners(channel) {
		// Listen for the "draft started" broadcast
		channel.on('broadcast', { event: 'draft-started' }, async (payload) => {
			console.log('Draft started broadcast received:', payload);
			await createDraftChannel();
			await handleDraftBroadcast('draft-started', payload);
		});

		// Listen for the "new player" broadcast
		channel.on('broadcast', { event: 'new-player' }, async (broadcast) => {
			console.log('New player broadcast received:', broadcast);
			await handleDraftBroadcast('new-player', broadcast.payload);
		});

		// Listen for the "draft finished" broadcast
		channel.on('broadcast', { event: 'draft-finished' }, async (broadcast) => {
			console.log('Draft finished broadcast received:', broadcast);
			await handleDraftBroadcast('draft-finished', broadcast.payload);
		});

		// Rochester-specific broadcasts
		channel.on('broadcast', { event: 'player-selected' }, async (broadcast) => {
			console.log('Player selected broadcast received:', broadcast);
			await handleDraftBroadcast('player-selected', broadcast.payload);
		});

		channel.on('broadcast', { event: 'packs-rotated' }, async (broadcast) => {
			console.log('Packs rotated broadcast received:', broadcast);
			await handleDraftBroadcast('packs-rotated', broadcast.payload);
		});
	}

	// Function to set up the draft after login
	async function setupDraft() {
		// Get draft ID from the URL query parameter
		const newDraftId = new URLSearchParams(window.location.search).get('id') || '';

		if (!newDraftId) {
			loadError = 'No draft ID provided. Please check the URL.';
			isLoading = false;
			return;
		}

		// If we're loading a different draft ID than before, reset the store
		if (draftId !== newDraftId) {
			// Reset draft store completely before initializing new draft
			draftStore.resetDraftStore();
			draftId = newDraftId;
		}

		// Set shareable URL
		shareableUrl = `${window.location.origin}${window.location.pathname}?id=${draftId}`;

		// Get the authenticated user's ID
		draftStore.store.userId = authStore.session?.user?.id || '';
		console.log('User ID:', draftStore.store.userId);

		if (!draftStore.store.userId) {
			loadError = 'You must be logged in to participate in a draft.';
			isLoading = false;
			return;
		}

		// Now load the draft data
		await loadDraftData();

		// Create and subscribe to the draft channel
		await createDraftChannel();
	}

	onMount(async () => {
		// Check if user is already logged in
		if (authStore.session) {
			await setupDraft();
		} else {
			isLoading = false;
		}
	});

	onDestroy(() => {
		if (draftStore.store.channel) {
			draftStore.store.channel.unsubscribe();
			draftStore.store.channel = null;
		}
	});

	async function startDraft() {
		if (!draftStore.store.draftReady) return;

		try {
			// Use the updated startDraftInDB function which now uses our secure RPC function
			await startDraftInDB(draftId, draftStore.store.participants);

			// Send broadcast to all participants that the draft has started
			const response = await draftStore.store.channel.send({
				type: 'broadcast',
				event: 'draft-started',
				payload: { draftId }
			});

			if (response.error) {
				console.error('Error sending broadcast:', response.error);

				// Add debug info for broadcast errors
				console.debug('Debug info for broadcast error:');
				console.debug('- Draft ID:', draftId);
				console.debug('- User ID:', draftStore.store.userId);
				console.debug('- Participants:', draftStore.store.participants);

				// Check if user is participant using RPC
				try {
					const { data, error } = await supabase.rpc('is_draft_participant', { draft_id: draftId });
					console.debug('- is_draft_participant result:', data);
					if (error) console.debug('- is_draft_participant error:', error);
				} catch (e) {
					console.debug('- Failed to call is_draft_participant:', e);
				}

				// Check draft status
				try {
					const { data, error } = await supabase
						.from('drafts')
						.select('created_by, status, participants')
						.eq('id', draftId)
						.single();
					console.debug('- Draft created by:', data?.created_by);
					console.debug('- Draft status:', data?.status);
					console.debug('- Participants:', data?.participants);
					console.debug('- Is creator match:', data?.created_by === draftStore.store.userId);
					if (error) console.debug('- Draft query error:', error);
				} catch (e) {
					console.debug('- Failed to query draft:', e);
				}

				throw response.error;
			}

			// Set draftStarted to true before initializing the draft
			draftStore.store.draftStarted = true;
			await initializeDraft();
		} catch (error) {
			console.error('Error starting draft:', error);
			loadError = `Failed to start draft: ${error.message}`;
		}
	}

	function handleLogin() {
		// This function is called after successful login
		isLoading = true;
		setupDraft();
	}
</script>

<svelte:head>
	<title>YGO Draft Room {draftId}</title>
	<meta name="description" content="Create your custom Yu-Gi-Oh! draft experience." />
</svelte:head>

<svelte:window on:beforeunload={handleBeforeUnload} />

<RulesModal bind:isOpen={showRulesModal} draftMethod={draftStore.store.draftMethod} />

<div class="flex min-h-screen flex-col bg-gray-100">
	{#if isLoading}
		<div class="flex items-center justify-center">
			<div class="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600"></div>
			<p class="ml-3">Loading draft data...</p>
		</div>
	{:else if loadError && loadError !== 'You must be logged in to participate in a draft.'}
		<div
			class="relative rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
			role="alert"
		>
			<strong class="font-bold">Error:</strong>
			<span class="block sm:inline">{loadError}</span>
			<button class="mt-2 rounded bg-red-600 px-4 py-2 text-white" onclick={loadDraftData}>
				Retry
			</button>
		</div>
	{:else if !authStore.session}
		<!-- Show login prompt if user is not logged in -->
		<div class="mb-6 bg-white p-8 shadow-md">
			<div class="mx-auto max-w-4xl">
				<h1 class="mb-2 text-3xl font-bold text-gray-800">Draft Room: {draftId}</h1>
				<p class="mb-4 text-xl text-gray-600">Please login to join this draft</p>
				<LoginPrompt on:login={handleLogin} />
			</div>
		</div>
	{:else if !draftStore.store.draftStarted}
		<!-- Jumbotron for draft details before start -->
		<div class="mb-6 bg-white p-8 shadow-md">
			<div class="mx-auto max-w-4xl">
				<h1 class="mb-2 text-3xl font-bold text-gray-800">Draft Room: {draftId}</h1>
				<p class="mb-4 text-xl text-gray-600">Waiting for players to join...</p>

				<!-- Shareable link section -->
				<div class="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
					<p class="mb-2 text-blue-800">Share this link to invite other players:</p>
					<div class="flex items-center">
						<input
							type="text"
							readonly
							value={shareableUrl}
							class="mr-2 w-full rounded-md border border-blue-300 bg-white p-2 text-gray-800 focus:outline-none"
						/>
						<button
							class="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
							onclick={copyShareableLink}
						>
							<span>{linkCopied ? 'Copied!' : 'Copy'}</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="feather feather-clipboard ml-1"
								><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
								></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg
							>
						</button>
					</div>
				</div>

				<div class="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
					<span class="text-lg font-medium text-indigo-700">
						{draftStore.store.connectedUsers}/{draftStore.store.numberOfPlayers} Players Connected
					</span>
					<div class="flex-1"></div>
					{#if isCreator}
						<button
							class="rounded bg-indigo-600 px-6 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
							disabled={!draftStore.store.draftReady}
							onclick={startDraft}
						>
							Start Draft
						</button>
					{:else}
						<span class="font-medium text-indigo-700">Waiting for host to start the draft...</span>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<!-- Standard Navbar for active draft -->
		<div
			class="flex w-full items-center justify-between border-b border-gray-300 bg-white px-6 py-4"
		>
			<p class="text-lg text-gray-600">Draft ID: {draftId}</p>
			<div class="flex items-center space-x-4">
				<button
					class="flex items-center space-x-1 rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
					onclick={toggleRulesModal}
				>
					<span>Rules</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
				<p class="text-lg font-medium text-gray-700">
					Connected Users: {draftStore.store.connectedUsers}/{draftStore.store.numberOfPlayers}
				</p>
			</div>
		</div>
	{/if}

	{#if authStore.session && !isLoading && !loadError}
		{#if !draftStore.store.draftStarted}
			<div class="flex flex-1 items-center justify-center">
				<div class="max-w-md rounded-lg bg-white p-8 text-center shadow-md">
					<h2 class="mb-4 text-2xl font-bold text-gray-700">Waiting for Draft to Start</h2>
					<p class="mb-4 text-gray-600">
						Once all players have joined, the host can start the draft.
					</p>
					{#if !draftStore.store.draftReady}
						<p class="font-medium text-amber-600">Waiting for more players to join...</p>
					{:else if isCreator}
						<p class="font-medium text-green-600">All players have joined! Ready to start.</p>
					{:else}
						<p class="font-medium text-green-600">
							All players have joined! Waiting for host to start draft.
						</p>
					{/if}
				</div>
			</div>
		{:else if draftStore.store.allFinished || (draftStore.store.draftMethod === 'rochester' && draftStore.store.playerFinished)}
			<div class="flex w-full flex-col items-center">
				<h2 class="mb-4 text-2xl font-bold text-green-600">Draft Finished!</h2>
				<div class="w-1/3 rounded bg-gray-100 p-4 shadow">
					<h2 class="mb-4 text-xl font-bold">Your Drafted Deck</h2>
					<CardList cube={draftStore.store.draftedDeck} showYdkDownload={true} showChart={true} />
				</div>
			</div>
		{:else if draftStore.store.draftMethod === 'winston'}
			<!-- Main Section: Split View for Winston Draft -->
			<div class="flex flex-1 gap-4 p-6">
				<!-- Left: Current Pile -->
				<div class="flex-1 overflow-y-auto border-r border-gray-300 pr-4">
					{#if isActivePlayer}
						<div class="mb-4">
							<div class="flex items-center space-x-3 p-0.5">
								{#each draftStore.store.piles as pile, index}
									<div class="relative">
										<div
											class={`flex h-10 w-10 items-center justify-center rounded-md text-sm font-medium ${
												index === draftStore.store.currentPileIndex
													? 'bg-indigo-600 text-white ring-1 ring-indigo-500 ring-offset-1'
													: 'bg-gray-200 text-gray-700'
											} overflow-visible`}
											title={`Pile ${index + 1}: ${pile.length} cards${draftStore.store.lastAcceptedPile === index ? ' (Last Accepted)' : ''}`}
										>
											{pile.length}
										</div>
									</div>
								{/each}
								<div
									class="flex h-10 items-center justify-center rounded-md border border-gray-300 bg-gray-100 px-3 text-sm font-medium text-gray-700"
								>
									<span class="mr-1">Deck:</span>
									{draftStore.store.deck?.length || 0}
								</div>
								{#if draftStore.store.lastAcceptedPile !== null}
									<div
										class="flex h-10 items-center justify-center rounded-md border border-gray-300 bg-gray-100 px-3 text-sm font-medium text-gray-700"
									>
										<span class="mr-1">Last Accepted:</span>
										{draftStore.store.lastAcceptedPile == draftStore.store.numberOfPiles
											? 'Deck'
											: draftStore.store.lastAcceptedPile + 1}
									</div>
								{/if}
							</div>
						</div>

						{#if draftStore.store.piles.length > draftStore.store.currentPileIndex}
							<CardList
								cube={draftStore.store.piles[draftStore.store.currentPileIndex]}
								border={false}
								startListView={false}
								showDescription={true}
							/>
							<div class="mt-2 flex justify-between">
								<button
									class="rounded bg-green-500 px-4 py-2 text-white"
									onclick={handleAcceptPile}
								>
									Accept
								</button>
								{#if canDecline}
									<button
										class="rounded bg-red-500 px-4 py-2 text-white"
										onclick={handleDeclineCurrentPile}
									>
										Decline
									</button>
								{/if}
							</div>
						{:else}
							<p class="text-gray-500">Loading pile data...</p>
						{/if}
					{:else}
						<p class="text-gray-500">Waiting for the current player...</p>
					{/if}
				</div>

				<!-- Right: Drafted Deck -->
				<div class="w-1/4 overflow-y-auto pl-4">
					<h2 class="mb-4 text-xl font-bold text-gray-700">Your Drafted Deck</h2>
					<CardList
						cube={draftStore.store.draftedDeck}
						border={true}
						showYdkDownload={true}
						showChart={true}
					/>
				</div>
			</div>
		{:else if draftStore.store.draftMethod === 'rochester'}
			<!-- Rochester Draft View -->
			<div class="flex-1 p-6">
				<RochesterDraftView />
			</div>
		{:else}
			<div class="flex w-full flex-row">
				<!-- Card Selection UI -->
				<div class="flex-1 rounded bg-white p-4 shadow">
					<h2 class="mb-4 text-xl font-bold">Unsupported Draft Type</h2>
					<p>The draft type "{draftStore.store.draftMethod}" is not currently supported.</p>
				</div>

				<!-- Drafted Card List -->
				<CardList cube={draftStore.store.draftedDeck} />
			</div>
		{/if}
	{/if}
</div>
