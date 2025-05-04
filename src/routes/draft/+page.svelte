<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { handleAcceptPile, handleDeclineCurrentPile } from '$lib/utils/winstonDraftLogic';
	import { initializeDraft, handleDraftBroadcast } from '$lib/utils/draftManager.svelte';
	import { startDraftInDB } from '$lib/utils/supabaseDraftManager';
	import CardList from '$lib/components/CardList.svelte';
	import RochesterDraftView from '$lib/components/RochesterDraftView.svelte';
	import * as draftStore from '$lib/stores/draftStore.svelte';
	import { canPlayerDeclineCurrentOption } from '$lib/utils/draftManager.svelte';
	import { store as authStore } from '$lib/stores/authStore.svelte';

	// Get the draft ID from URL query parameter
	let draftId = $state('');

	// Local state for loading and errors
	let isLoading = $state(true);
	let loadError = $state(null);
	let isCreator = $state(false);
	// Draft data
	let draftData = $state({
		cube: [],
		draftMethod: '',
		poolSize: 0,
		numberOfPlayers: 0,
		connectedUsers: 0
	});

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

			// Store data in local state without fetching the cube data
			// since the draftStrategies will fetch it when needed
			draftData = {
				draftMethod: draft.draft_method,
				poolSize: draft.pool_size,
				numberOfPlayers: draft.number_of_players,
				connectedUsers: draft.connected_users,
				numberOfPiles: draft.number_of_piles || 3,
				packSize: draft.pack_size || 5
			};

			// Initialize the draft store
			draftStore.initializeDraft({
				id: draftId,
				...draftData
			});

			console.log('Draft initialized with data:', draftData);
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
			draftStore.store.participants = Object.keys(state);
			draftStore.store.draftReady = draftStore.store.connectedUsers === draftData.numberOfPlayers;
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

	onMount(async () => {
		// Get draft ID from the URL query parameter
		draftId = new URLSearchParams(window.location.search).get('id') || '';

		if (!draftId) {
			loadError = 'No draft ID provided. Please check the URL.';
			isLoading = false;
			return;
		}

		// Now load the draft data
		loadDraftData();

		// Get the authenticated user's ID
		draftStore.store.userId = authStore.session?.user?.id || '';
		console.log('User ID:', draftStore.store.userId);

		if (!draftStore.store.userId) {
			loadError = 'You must be logged in to participate in a draft.';
			return;
		}

		// Create and subscribe to the draft channel
		await createDraftChannel();
	});

	onDestroy(() => {
		if (draftStore.store.channel) {
			draftStore.store.channel.unsubscribe();
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
</script>

<div class="flex min-h-screen flex-col bg-gray-100">
	{#if !draftStore.store.draftStarted}
		<!-- Jumbotron for draft details before start -->
		<div class="mb-6 bg-white p-8 shadow-md">
			<div class="mx-auto max-w-4xl">
				<h1 class="mb-2 text-3xl font-bold text-gray-800">Draft Room: {draftId}</h1>
				<p class="mb-4 text-xl text-gray-600">Waiting for players to join...</p>
				<div class="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
					<span class="text-lg font-medium text-indigo-700">
						{draftStore.store.connectedUsers}/{draftData.numberOfPlayers} Players Connected
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
			<p class="text-lg font-medium text-gray-700">
				Connected Users: {draftStore.store.connectedUsers}/{draftData.numberOfPlayers}
			</p>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex items-center justify-center">
			<div class="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600"></div>
			<p class="ml-3">Loading draft data...</p>
		</div>
	{:else if loadError}
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
	{:else if !draftStore.store.draftStarted}
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
	{:else if draftStore.store.allFinished || (draftData.draftMethod === 'rochester' && draftStore.store.playerFinished)}
		<div class="flex w-full flex-col items-center">
			<h2 class="mb-4 text-2xl font-bold text-green-600">Draft Finished!</h2>
			<div class="w-1/3 rounded bg-gray-100 p-4 shadow">
				<h2 class="mb-4 text-xl font-bold">Your Drafted Deck</h2>
				<CardList cube={draftStore.store.draftedDeck} showYdkDownload={true} showChart={true} />
			</div>
		</div>
	{:else if draftData.draftMethod === 'winston'}
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
							<button class="rounded bg-green-500 px-4 py-2 text-white" onclick={handleAcceptPile}>
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
	{:else if draftData.draftMethod === 'rochester'}
		<!-- Rochester Draft View -->
		<div class="flex-1 p-6">
			<RochesterDraftView />
		</div>
	{:else}
		<div class="flex w-full flex-row">
			<!-- Card Selection UI -->
			<div class="flex-1 rounded bg-white p-4 shadow">
				<h2 class="mb-4 text-xl font-bold">Unsupported Draft Type</h2>
				<p>The draft type "{draftData.draftMethod}" is not currently supported.</p>
			</div>

			<!-- Drafted Card List -->
			<CardList cube={draftStore.store.draftedDeck} />
		</div>
	{/if}
</div>
