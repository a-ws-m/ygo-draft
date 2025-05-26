<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { initializeDraft, handleDraftBroadcast } from '$lib/utils/draftManager.svelte';
	import { startDraftInDB } from '$lib/utils/supabaseDraftManager';
	import CardList from '$lib/components/CardList.svelte';
	import RochesterDraftView from '$lib/components/RochesterDraftView.svelte';
	import WinstonDraftView from '$lib/components/WinstonDraftView.svelte';
	import GridDraftView from '$lib/components/GridDraftView.svelte';
	import RulesModal from '$lib/components/RulesModal.svelte';
	import LoginPrompt from '$lib/components/LoginPrompt.svelte';
	import * as draftStore from '$lib/stores/draftStore.svelte';
	import { store as authStore } from '$lib/stores/authStore.svelte';
	import feather from 'feather-icons';

	$inspect('participants', draftStore.store.participants);

	let draftId = $state('');
	let isLoading = $state(true);
	let loadError = $state(null);
	let isCreator = $state(false);
	let showRulesModal = $state(false);
	let linkCopied = $state(false);
	let shareableUrl = $state('');

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

	function handleBeforeUnload(event) {
		if (draftStore.store.draftStarted && !draftStore.store.allFinished) {
			event.preventDefault();
			event.returnValue =
				'You are in the middle of a draft. You cannot return, and the draft will break for other players. Are you sure you want to leave?';
			return event.returnValue;
		}
	}

	async function loadDraftData() {
		isLoading = true;
		loadError = null;

		try {
			const { data: draft, error: draftError } = await supabase
				.from('drafts')
				.select('*')
				.eq('id', draftId)
				.single();

			if (draftError) {
				throw new Error('Failed to fetch draft data: ' + draftError.message);
			}

			const {
				data: { user }
			} = await supabase.auth.getUser();
			isCreator = user && draft.created_by === user.id;

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

			draftStore.initializeDraft(draftInfo);

			console.log('Draft initialized with data:', draftInfo);
		} catch (error) {
			console.error('Error loading draft:', error);
			loadError = error.message;
		} finally {
			isLoading = false;
		}
	}

	async function createDraftChannel() {
		await supabase.realtime.setAuth();

		if (draftStore.store.channel) {
			draftStore.store.channel.unsubscribe();
		}

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

		channel.on('presence', { event: 'sync' }, () => {
			const state = channel.presenceState();
			console.log('Presence state updated:', state);
			draftStore.store.connectedUsers = Object.keys(state).length;
			draftStore.store.participants = Object.keys(state).sort();
			draftStore.store.draftReady =
				draftStore.store.connectedUsers === draftStore.store.numberOfPlayers;
		});

		channel.on('presence', { event: 'join' }, ({ newPresences }) => {
			console.log('New users joined:', newPresences);
		});

		channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
			console.log('Users left:', leftPresences);
		});

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

		setupBroadcastListeners(channel);

		return channel;
	}

	function setupBroadcastListeners(channel) {
		channel.on('broadcast', { event: 'draft-started' }, async (payload) => {
			console.log('Draft started broadcast received:', payload);
			await createDraftChannel();
			await handleDraftBroadcast('draft-started', payload);
		});

		channel.on('broadcast', { event: 'new-player' }, async (broadcast) => {
			console.log('New player broadcast received:', broadcast);
			await handleDraftBroadcast('new-player', broadcast.payload);
		});

		channel.on('broadcast', { event: 'draft-finished' }, async (broadcast) => {
			console.log('Draft finished broadcast received:', broadcast);
			await handleDraftBroadcast('draft-finished', broadcast.payload);
		});

		channel.on('broadcast', { event: 'player-selected' }, async (broadcast) => {
			console.log('Player selected broadcast received:', broadcast);
			await handleDraftBroadcast('player-selected', broadcast.payload);
		});

		channel.on('broadcast', { event: 'packs-rotated' }, async (broadcast) => {
			console.log('Packs rotated broadcast received:', broadcast);
			await handleDraftBroadcast('packs-rotated', broadcast.payload);
		});

		channel.on('broadcast', { event: 'grid-selection' }, async (broadcast) => {
			console.log('Grid selection broadcast received:', broadcast);
			await handleDraftBroadcast('grid-selection', broadcast.payload);
		});
	}

	async function setupDraft() {
		const newDraftId = new URLSearchParams(window.location.search).get('id') || '';

		if (!newDraftId) {
			loadError = 'No draft ID provided. Please check the URL.';
			isLoading = false;
			return;
		}

		if (draftId !== newDraftId) {
			draftStore.resetDraftStore();
			draftId = newDraftId;
		}

		shareableUrl = `${window.location.origin}${window.location.pathname}?id=${draftId}`;

		draftStore.store.userId = authStore.session?.user?.id || '';
		console.log('User ID:', draftStore.store.userId);

		if (!draftStore.store.userId) {
			loadError = 'You must be logged in to participate in a draft.';
			isLoading = false;
			return;
		}

		await loadDraftData();
		await createDraftChannel();
	}

	onMount(async () => {
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
			await startDraftInDB(draftId, draftStore.store.participants);

			const response = await draftStore.store.channel.send({
				type: 'broadcast',
				event: 'draft-started',
				payload: { draftId }
			});

			if (response.error) {
				console.error('Error sending broadcast:', response.error);
				throw response.error;
			}

			draftStore.store.draftStarted = true;
			await initializeDraft();
		} catch (error) {
			console.error('Error starting draft:', error);
			loadError = `Failed to start draft: ${error.message}`;
		}
	}

	function handleLogin() {
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
				<h1 class="card-title text-3xl">Draft Room: {draftId}</h1>
				<p class="text-xl">Please login to join this draft</p>
				<LoginPrompt on:login={handleLogin} />
			</div>
		</div>
	{:else if !draftStore.store.draftStarted}
		<div class="hero">
			<div class="hero-content text-center">
				<div class="max-w-3xl">
					<h1 class="text-primary mb-4 text-5xl font-bold">Draft Waiting Room</h1>
					<p class="text-base-content mb-8 text-xl">Waiting for draft to start...</p>

					<div class="alert alert-info mx-auto mb-8 max-w-xl">
						<div class="flex-none">
							{@html feather.icons.info.toSvg()}
						</div>
						<div class="w-full flex-col">
							<span class="font-medium">Share this link to invite other players:</span>
							<div class="mt-2 flex w-full items-center">
								<div class="join w-full">
									<input
										readonly
										type="text"
										value={shareableUrl}
										class="join-item w-full flex-1 truncate px-4 py-2 font-mono text-sm"
									/>
									<button
										class="btn join-item btn-primary whitespace-nowrap"
										onclick={copyShareableLink}
									>
										{linkCopied ? 'Copied!' : 'Copy'}
										<span class="ml-1">
											{@html feather.icons.clipboard.toSvg({ width: 16, height: 16 })}
										</span>
									</button>
								</div>
							</div>
						</div>
					</div>

					<div class="flex w-full flex-col items-center justify-center gap-4">
						<div class="badge badge-lg badge-secondary text-lg font-medium">
							{draftStore.store.connectedUsers}/{draftStore.store.numberOfPlayers} Players Connected
						</div>

						{#if !draftStore.store.draftReady}
							<div class="alert alert-warning w-full max-w-xl text-center">
								<div class="flex-none">
									{@html feather.icons['alert-circle'].toSvg()}
								</div>
								<span>Waiting for more players to join...</span>
							</div>
						{:else if isCreator}
							<button class="btn btn-primary btn-lg mt-2 w-64" onclick={startDraft}>
								<span class="flex items-center justify-center">
									Start Draft
									<span class="ml-2">
										{@html feather.icons['play-circle'].toSvg({ width: 20, height: 20 })}
									</span>
								</span>
							</button>
						{:else}
							<div class="alert alert-success w-full max-w-xl text-center">
								<div class="flex-none">
									{@html feather.icons['check-circle'].toSvg()}
								</div>
								<span>All players have joined! Waiting for host to start the draft...</span>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="navbar bg-base-100 shadow-md">
			<div class="navbar-start">
				<p class="text-lg">Draft ID: {draftId}</p>
			</div>
			<div class="navbar-end">
				<button class="btn btn-ghost btn-sm" onclick={toggleRulesModal}>
					Rules
					<span class="ml-1">
						{@html feather.icons['help-circle'].toSvg({ width: 16, height: 16 })}
					</span>
				</button>
				<div class="badge badge-lg badge-neutral ml-2">
					{draftStore.store.connectedUsers}/{draftStore.store.numberOfPlayers} Connected
				</div>
			</div>
		</div>
	{/if}

	{#if authStore.session && !isLoading && !loadError}
		{#if !draftStore.store.draftStarted}
			<!-- The "Waiting for Draft to Start" card has been removed -->
		{:else if draftStore.store.allFinished || (draftStore.store.draftMethod === 'rochester' && draftStore.store.playerFinished)}
			<div class="flex w-full flex-col items-center p-6">
				<div class="alert alert-success mb-4">
					<div class="flex-none">
						{@html feather.icons['check-circle'].toSvg()}
					</div>
					<span>Draft Finished!</span>
				</div>
				<div class="card bg-base-100 w-full shadow-xl md:w-2/3 lg:w-1/3">
					<div class="card-body">
						<h2 class="card-title">Your Drafted Deck</h2>
						<CardList cube={draftStore.store.draftedDeck} showYdkDownload={true} showChart={true} />
					</div>
				</div>
			</div>
		{:else if draftStore.store.draftMethod === 'winston'}
			<WinstonDraftView />
		{:else if draftStore.store.draftMethod === 'rochester'}
			<div class="flex-1 p-6">
				<RochesterDraftView />
			</div>
		{:else if draftStore.store.draftMethod === 'grid'}
			<div class="flex-1 p-6">
				<GridDraftView />
			</div>
		{:else}
			<div class="flex w-full flex-row p-4">
				<div class="card bg-base-100 flex-1 shadow-xl">
					<div class="card-body">
						<h2 class="card-title">Unsupported Draft Type</h2>
						<p>The draft type "{draftStore.store.draftMethod}" is not currently supported.</p>
					</div>
				</div>

				<CardList cube={draftStore.store.draftedDeck} />
			</div>
		{/if}
	{/if}
</div>
