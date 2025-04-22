<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import {
		startDraftInDB,
		assignCardsToPlayer,
		updateCurrentPlayer
	} from '$lib/utils/draftManager'; // Import the utility script
	import { formatCardForComponent } from '$lib/utils/format';

	import CardList from '$lib/components/CardList.svelte'; // Card list component

	export let data: {
		id: string;
		cube: any[];
		draftMethod: string;
		poolSize: number;
		numberOfPlayers: number;
		connectedUsers: number;
	};

	let connectedUsers = 0; // Presence will manage this
	let draftReady = false;
	let channel: any;
	let participants: string[] = []; // List of user IDs participating in the draft
	let draftStarted = false; // Whether the draft has started

	let piles = []; // Array of piles for Winston draft
	let deck = []; // Remaining cards in the deck
	let draftedDecks = []; // Array of drafted decks for each player
	let currentPlayer = 0; // Index of the current player
	let minimumDeckSize = 40; // Example minimum deck size

	// Ensure userId is defined and accessible
	let userId: string;

	$: formattedPiles = piles.map((pile) => pile.map((card) => formatCardForComponent(card)));

	onMount(async () => {
		const { data: session, error } = await supabase.auth.getSession();
		if (error) {
			console.error('Error fetching session:', error);
		}

		userId = session?.session?.user?.id || `guest-${Math.random()}`;
		console.log('User ID:', userId);

		// Join the presence channel for the draft
		channel = supabase.channel(`draft-room-${data.id}`, {
			config: {
				presence: {
					key: userId // Unique key for each user
				}
			}
		});

		// Subscribe to presence state changes
		channel.on('presence', { event: 'sync' }, () => {
			const state = channel.presenceState();
			console.log('Presence state updated:', state);
			connectedUsers = Object.keys(state).length; // Count the number of connected users
			participants = Object.keys(state); // Save the list of participants
			draftReady = connectedUsers === data.numberOfPlayers;
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

				// Track the user's presence in the channel
				const trackResponse = await channel.track({ userId, status: 'online' });
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
		channel.on('broadcast', { event: 'draft-started' }, (payload) => {
			console.log('Draft started broadcast received:', payload);
			draftStarted = true; // Start the draft on all clients

			if (data.draftMethod === 'winston') {
				initializeWinstonDraft();
			}
		});

		// Listen for updates to the draft state
		channel.on('broadcast', { event: 'draft-update' }, (payload) => {
			console.log('Draft update received:', payload);
			currentPlayer = payload.currentPlayer;
			piles = payload.piles;
		});

		// Subscribe to real-time changes in the `cubes` table
		const cubesSubscription = supabase
			.from(`cubes:draft_id=eq.${data.id}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'cubes' }, async (payload) => {
				console.log('Cubes table change detected:', payload);

				// Fetch the updated piles from the database
				const { data: updatedCubes, error } = await supabase
					.from('cubes')
					.select('*')
					.eq('draft_id', data.id)
					.order('pile', { ascending: true });

				if (error) {
					console.error('Error fetching updated cubes:', error);
					return;
				}

				// Rebuild the piles array based on the updated cubes
				const newPiles = [];
				updatedCubes.forEach((card) => {
					if (card.pile !== null) {
						if (!newPiles[card.pile]) {
							newPiles[card.pile] = [];
						}
						newPiles[card.pile].push(card);
					}
				});

				piles = newPiles;
				console.log('Piles updated from database:', piles);
			})
			.subscribe();

		// Subscribe to real-time changes in the `drafts` table for the current player
		const currentPlayerSubscription = supabase
			.from(`drafts:id=eq.${data.id}`)
			.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drafts' }, (payload) => {
				console.log('Current player updated:', payload.new.current_player);
				currentPlayer = payload.new.current_player; // Update the current player
			})
			.subscribe();

		onDestroy(() => {
			// Unsubscribe from the real-time subscription
			supabase.removeSubscription(cubesSubscription);
			supabase.removeSubscription(currentPlayerSubscription);
		});
	});

	onDestroy(() => {
		if (channel) {
			channel.unsubscribe();
		}
	});

	async function startDraft() {
		if (!draftReady) return;

		try {
			// Update the database to start the draft
			await startDraftInDB(data.id, participants);

			// Broadcast the "draft started" event to all connected users
			const response = await channel.send({
				type: 'broadcast',
				event: 'draft-started',
				payload: { draftId: data.id }
			});

			if (response.error) {
				throw response.error;
			}

			// Mark the draft as started locally
			draftStarted = true;

			if (data.draftMethod === 'winston') {
				initializeWinstonDraft();
			}
		} catch (error) {
			console.error('Error starting draft:', error);
		}
	}

	async function initializeWinstonDraft() {
		try {
			// Fetch cards from the `cubes` table ordered by `index`
			const { data: cards, error } = await supabase
				.from('cubes')
				.select('*')
				.eq('draft_id', data.id)
				.is('owner', null) // Only fetch cards that are not yet owned
				.order('index', { ascending: true });

			if (error) {
				console.error('Error fetching cards for Winston draft:', error);
				return;
			}

			// Initialize the deck with the fetched cards
			deck = cards;

			// Create the specified number of piles, each starting with one card
			const numberOfPiles = 3; // Example number of piles
			piles = Array.from({ length: numberOfPiles }, () => [deck.shift()]);

			// Update the `pile` column in the `cubes` table
			for (let i = 0; i < piles.length; i++) {
				const pileCardIndexes = piles[i].map((card) => card.index);
				await supabase
					.from('cubes')
					.update({ pile: i }) // Assign the pile index
					.eq('draft_id', data.id)
					.in('index', pileCardIndexes);
			}
		} catch (error) {
			console.error('Error initializing Winston draft:', error);
		}
	}

	async function handleAcceptPile(pileIndex: number) {
		const playerId = participants[currentPlayer];
		const cardIndexes = piles[pileIndex].map((card) => card.index);

		try {
			// Assign the cards in the pile to the current player
			await assignCardsToPlayer(data.id, playerId, cardIndexes);

			// Refresh the pile with one card from the deck
			const newCard = deck.pop();
			piles[pileIndex] = newCard ? [newCard] : [];

			// Update the `pile` column in the `cubes` table
			if (newCard) {
				await supabase
					.from('cubes')
					.update({ pile: pileIndex })
					.eq('draft_id', data.id)
					.eq('index', newCard.index);
			}

			// Move to the next player
			moveToNextPlayer();

			// Broadcast the updated state to all connected clients
			await channel.send({
				type: 'broadcast',
				event: 'draft-update',
				payload: {
					currentPlayer,
					piles
				}
			});
		} catch (error) {
			console.error('Error handling accept pile:', error);
		}
	}

	async function handleDeclinePile(pileIndex: number) {
		const newCard = deck.pop();

		if (newCard) {
			// Add a card from the deck to the declined pile
			piles[pileIndex].push(newCard);

			// Update the `pile` column in the `cubes` table
			await supabase
				.from('cubes')
				.update({ pile: pileIndex })
				.eq('draft_id', data.id)
				.eq('index', newCard.index);

			// Broadcast the updated state to all connected clients
			await channel.send({
				type: 'broadcast',
				event: 'draft-update',
				payload: {
					currentPlayer,
					piles
				}
			});
		} else {
			console.error('No cards left in the deck to add to the pile.');
		}
	}

	function handleDeclineAllPiles() {
		// Add the top card from the deck to the current player's drafted deck
		draftedDecks[currentPlayer].push(deck.pop());

		// Move to the next player
		moveToNextPlayer();
	}

	async function moveToNextPlayer() {
		// Skip players who already have the minimum deck size
		do {
			currentPlayer = (currentPlayer + 1) % data.numberOfPlayers;
		} while (draftedDecks[currentPlayer].length >= minimumDeckSize);

		try {
			// Update the current player in the database
			await updateCurrentPlayer(data.id, currentPlayer);
		} catch (error) {
			console.error('Error updating current player:', error);
		}
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-100 p-6">
	<h1 class="text-3xl font-bold text-gray-800">Draft Room</h1>
	<p class="text-lg text-gray-600">Draft ID: {data.id}</p>
	<p class="text-lg text-gray-600">Connected Users: {connectedUsers}/{data.numberOfPlayers}</p>

	{#if !draftStarted}
		<button
			class="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
			disabled={!draftReady}
			on:click={startDraft}
		>
			Start Draft
		</button>
	{:else if data.draftMethod === 'winston'}
		<div class="flex w-full flex-row">
			<!-- Piles for Winston Draft -->
			<div class="flex-1 rounded bg-white p-4 shadow">
				<h2 class="mb-4 text-xl font-bold">Winston Draft</h2>
				<div class="grid grid-cols-3 gap-4">
					{#each formattedPiles as pile, index}
						<div class="rounded border p-2 shadow">
							{#if currentPlayer === participants.indexOf(userId)}
								<!-- Show cards in the pile only for the current player -->
								<CardList cube={pile} />
								<div class="mt-2 flex justify-between">
									<button
										class="rounded bg-green-500 px-4 py-2 text-white"
										on:click={() => handleAcceptPile(index)}
										disabled={currentPlayer !== participants.indexOf(userId)}
									>
										Accept
									</button>
									<button
										class="rounded bg-red-500 px-4 py-2 text-white"
										on:click={() => handleDeclinePile(index)}
										disabled={currentPlayer !== participants.indexOf(userId)}
									>
										Decline
									</button>
								</div>
							{:else}
								<!-- Placeholder for other players -->
								<p class="text-gray-500">Waiting for the current player...</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Drafted Deck for Current Player -->
			<div class="w-1/3 rounded bg-gray-100 p-4 shadow">
				<h2 class="mb-4 text-xl font-bold">Your Drafted Deck</h2>
				<CardList cube={draftedDecks[currentPlayer]} />
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
			<CardList {data} />
		</div>
	{/if}
</div>
