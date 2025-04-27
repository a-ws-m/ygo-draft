<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import {
		handleAcceptPile,
		handleDeclineCurrentPile,
		initializeWinstonDraft
	} from '$lib/utils/draftLogic.svelte';
	import { startDraftInDB } from '$lib/utils/draftManager';
	import type { PageProps } from './$types';
	import CardList from '$lib/components/CardList.svelte';
	import * as draftStore from '$lib/stores/draftStore.svelte';

	$inspect('draftStore', draftStore.store);

	// Get the draft ID from the page params
	let { data }: PageProps = $props();

	// Local state for loading and errors
	let isLoading = $state(true);
	let loadError = $state(null);

	// Draft data
	let draftData = $state({
		cube: [],
		draftMethod: '',
		poolSize: 0,
		numberOfPlayers: 0,
		connectedUsers: 0
	});

	let isActivePlayer = $derived.by(() => {
		if (!draftStore.store.participants || !draftStore.store.userId || !draftStore.store.draftStarted) return false;
		return (
			draftStore.store.currentPlayer ===
			draftStore.store.participants.indexOf(draftStore.store.userId)
		);
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
				.eq('id', data.id)
				.single();

			if (draftError) {
				throw new Error('Failed to fetch draft data: ' + draftError.message);
			}

			// Fetch cube cards
			const { data: cube, error: cubeError } = await supabase
				.from('cubes')
				.select('*')
				.eq('draft_id', data.id);

			if (cubeError) {
				throw new Error('Failed to fetch cube data: ' + cubeError.message);
			}

			// Store data in local state
			draftData = {
				cube,
				draftMethod: draft.draft_method,
				poolSize: draft.pool_size,
				numberOfPlayers: draft.number_of_players,
				connectedUsers: draft.connected_users
			};

			// Initialize the draft store
			draftStore.initializeDraft({
				id: data.id,
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

	onMount(async () => {
		// Load draft data first
		await loadDraftData();

		// Then set up real-time connections
		const { data: session, error } = await supabase.auth.getSession();
		if (error) {
			console.error('Error fetching session:', error);
		}

		// Set user ID in store
		draftStore.store.userId =
			session?.session?.user?.id || `guest-${Math.random().toString(36).substring(2, 12)}`;
		console.log('User ID:', draftStore.store.userId);

		// Join the presence channel for the draft
		const channel = supabase.channel(`draft-room-${data.id}`, {
			config: {
				presence: {
					key: draftStore.store.userId
				}
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
				} else {
					console.log('User presence tracked successfully');
				}
			} else {
				console.error('Failed to subscribe to presence channel:', status);
			}
		});

		// Listen for the "draft started" broadcast
		channel.on('broadcast', { event: 'draft-started' }, async (payload) => {
			console.log('Draft started broadcast received:', payload);
			draftStore.store.draftStarted = true;

			if (draftData.draftMethod === 'winston') {
				const success = await initializeWinstonDraft(3);
				if (!success) {
					console.error('Failed to initialize Winston draft.');
				}
			}
		});

		// Listen for the "new player" broadcast
		channel.on('broadcast', { event: 'new-player' }, async (broadcast) => {
			console.log('New player broadcast received:', broadcast);
			draftStore.store.currentPlayer = broadcast.payload.currentPlayer;

			// Update the local state based on the database
			await draftStore.updateDeck();
			await draftStore.updatePiles();
		});
	});

	onDestroy(() => {
		if (draftStore.store.channel) {
			draftStore.store.channel.unsubscribe();
		}
	});

	async function startDraft() {
		if (!draftStore.store.draftReady) return;

		try {
			await startDraftInDB(data.id, draftStore.store.participants);

			const response = await draftStore.store.channel.send({
				type: 'broadcast',
				event: 'draft-started',
				payload: { draftId: data.id }
			});

			if (response.error) {
				throw response.error;
			}

			draftStore.store.draftStarted = true;

			if (draftData.draftMethod === 'winston') {
				const success = await initializeWinstonDraft(3);

				if (!success) {
					console.error('Failed to initialize Winston draft.');
					return;
				}
			}
		} catch (error) {
			console.error('Error starting draft:', error);
		}
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-100 p-6">
	<h1 class="text-3xl font-bold text-gray-800">Draft Room</h1>

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
	{:else}
		<p class="text-lg text-gray-600">Draft ID: {data.id}</p>
		<p class="text-lg text-gray-600">
			Connected Users: {draftStore.store.connectedUsers}/{draftData.numberOfPlayers}
		</p>

		{#if !draftStore.store.draftStarted}
			<button
				class="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
				disabled={!draftStore.store.draftReady}
				onclick={startDraft}
			>
				Start Draft
			</button>
		{:else if draftData.draftMethod === 'winston'}
			<div class="flex w-full flex-row">
				<!-- Piles for Winston Draft -->
				<div class="flex-1 rounded bg-white p-4 shadow">
					<h2 class="mb-4 text-xl font-bold">Winston Draft</h2>
					<div class="grid grid-cols-3 gap-4">
						{#if isActivePlayer}
							<!-- Show only the current pile to the active player -->
							<div class="rounded border p-2 shadow">
								{#if draftStore.store.piles.length > draftStore.store.currentPileIndex}
									<CardList cube={draftStore.store.piles[draftStore.store.currentPileIndex]} />
									<div class="mt-2 flex justify-between">
										<button
											class="rounded bg-green-500 px-4 py-2 text-white"
											onclick={handleAcceptPile}
										>
											Accept
										</button>
										<button
											class="rounded bg-red-500 px-4 py-2 text-white"
											onclick={handleDeclineCurrentPile}
										>
											Decline
										</button>
									</div>
								{:else}
									<p class="text-gray-500">Loading pile data...</p>
								{/if}
							</div>
						{:else}
							<!-- Placeholder for other players -->
							<p class="text-gray-500">Waiting for the current player...</p>
						{/if}
					</div>
				</div>

				<!-- Drafted Deck for Current Player -->
				<div class="w-1/3 rounded bg-gray-100 p-4 shadow">
					<h2 class="mb-4 text-xl font-bold">Your Drafted Deck</h2>
					<CardList cube={draftStore.store.draftedDeck} />
				</div>
			</div>
		{:else}
			<div class="flex w-full flex-row">
				<!-- Card Selection UI -->
				<div class="flex-1 rounded bg-white p-4 shadow">
					<h2 class="mb-4 text-xl font-bold">Drafting in Progress</h2>
					<!-- Placeholder for Drafting UI -->
					<p>Card selection UI goes here.</p>
				</div>

				<!-- Drafted Card List -->
				<CardList cube={draftStore.store.draftedDeck} />
			</div>
		{/if}
	{/if}
</div>
