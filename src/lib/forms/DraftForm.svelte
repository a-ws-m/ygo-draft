<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { createDraft } from '$lib/utils/supabaseDraftManager';
	import {
		store as authStore,
		signInWithGitHub,
		signInWithDiscord
	} from '$lib/stores/authStore.svelte';

	const dispatch = createEventDispatcher();

	// Use $state for reactive variables in Svelte 5
	let draftMethod = $state('rochester');
	let poolSize = $state(120);
	let draftedDeckSize = $state(60); // New variable for drafted deck size
	let numberOfPlayers = $state(2);
	let numberOfPiles = $state(3);
	let packsPerRound = $state(1);
	let packSize = $state(15);
	let extraDeckAtEnd = $state(false); // Changed default to false
	let useRarityDistribution = $state(false); // New state for rarity distribution option
	let commonPerPack = $state(7);
	let rarePerPack = $state(5);
	let superRarePerPack = $state(2);
	let ultraRarePerPack = $state(1);
	let cubeFile = $state(null);
	let isCubeValid = $state(false);
	let isProcessing = $state(false);
	let errorMessage = $state('');
	let optionErrorMessage = $state('');
	let totalCards = $state(0);
	let cube = $state([]);
	let showMethodTooltip = $state(false);
	let showCubeTooltip = $state(false); // New state for cube tooltip
	let isAuthenticated = $derived(!!authStore.session);
	let showRarityWarning = $state(false);
	let cardsWithoutRarity = $state([]);
	let showUnevenPoolWarning = $state(false); // New state for uneven pool warning

	// Constants for limits
	const MAX_POOL_SIZE = 1000;
	const MAX_PLAYERS = 10;
	const DAILY_DRAFT_LIMIT = 100; // Not used directly in UI but useful for reference

	// Derived value for max drafted deck size
	let maxDraftedDeckSize = $derived(Math.floor(MAX_POOL_SIZE / numberOfPlayers));

	// Draft method descriptions
	const draftMethodDescriptions = {
		winston: `In Winston Draft, players take turns choosing from a number of piles. If you accept a pile, you take all cards in it. If you decline, add another card to the pile from the deck and move to the next one. If you decline the final pile, you take the top card of the deck.`,
		rochester: `In Rochester Draft, players pass a pack of cards in a circle, taking one card at a time, until no cards remain in the packs. Then, another pack is opened for each player, and the process continues until there are no cards left in the pool.`
	};

	function handleFileUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		cubeFile = target.files?.[0] || null;
		if (cubeFile) {
			isProcessing = true;
			errorMessage = '';
			import('$lib/utils/cubeProcessor').then(({ processCubeFile }) => {
				processCubeFile(cubeFile)
					.then((uploadedCube) => {
						console.log('Cube file processed successfully.');
						isCubeValid = true;
						cube = uploadedCube;
						totalCards = cube.reduce((sum, card) => sum + card.quantity, 0);
						dispatch('cubeUploaded', { cube });
						validateOptions();
						checkForCardsWithoutRarity();
					})
					.catch((error) => {
						console.error('Error processing cube file:', error);
						isCubeValid = false;
						errorMessage = error.message;
					})
					.finally(() => {
						isProcessing = false;
					});
			});
		} else {
			isCubeValid = false;
			errorMessage = 'No file uploaded. Please select a valid cube file.';
		}
	}

	function checkForCardsWithoutRarity() {
		if (useRarityDistribution && draftMethod === 'rochester') {
			cardsWithoutRarity = cube.filter((card) => !card?.apiData?.rarity);

			if (cardsWithoutRarity.length > 0) {
				showRarityWarning = true;
			} else {
				showRarityWarning = false;
			}
		} else {
			showRarityWarning = false;
		}
	}

	function validateOptions() {
		optionErrorMessage = '';
		showUnevenPoolWarning = false; // Reset the warning flag

		// First check database limits
		if (draftMethod === 'rochester') {
			// For Rochester, calculate pool size from drafted deck size
			poolSize = draftedDeckSize * numberOfPlayers;
		}

		if (poolSize > MAX_POOL_SIZE) {
			optionErrorMessage = `Pool size cannot exceed ${MAX_POOL_SIZE} cards.`;
			return;
		}

		if (numberOfPlayers > MAX_PLAYERS) {
			optionErrorMessage = `Number of players cannot exceed ${MAX_PLAYERS}.`;
			return;
		}

		// Check if both extraDeckAtEnd and useRarityDistribution are enabled
		if (extraDeckAtEnd && useRarityDistribution) {
			optionErrorMessage =
				'You cannot use both "Move extra deck cards to end" and "Rarity distribution" options together.';
			return;
		}

		// Then check other validations
		if (poolSize > totalCards) {
			optionErrorMessage = 'Pool size cannot exceed the total number of cards in the cube.';
		} else if (draftMethod === 'rochester') {
			if (packSize < numberOfPlayers) {
				optionErrorMessage = 'Pack size must be at least equal to the number of players.';
			} else if (poolSize < packSize * packsPerRound) {
				optionErrorMessage =
					'Pool size must be at least equal to pack size times the number of packs.';
				return;
			}

			// Validation for rarity distribution
			if (useRarityDistribution) {
				const rarityTotal = commonPerPack + rarePerPack + superRarePerPack + ultraRarePerPack;
				if (rarityTotal !== packSize) {
					optionErrorMessage = `Rarity distribution total (${rarityTotal}) must equal pack size (${packSize}).`;
					return;
				}

				// Check if pool is evenly divisible for rarity distribution
				const totalPackCards = packSize * numberOfPlayers;
				if (poolSize % totalPackCards !== 0) {
					showUnevenPoolWarning = true;
				}
			}
		} else if (draftMethod === 'winston') {
			if (poolSize < numberOfPiles) {
				optionErrorMessage = 'Pool size must be at least equal to the number of piles.';
			}
		}

		checkForCardsWithoutRarity();
	}

	async function startDraft() {
		if (!isCubeValid || optionErrorMessage) return;

		isProcessing = true;

		try {
			// For Rochester draft, ensure pool size is calculated from drafted deck size
			if (draftMethod === 'rochester') {
				poolSize = draftedDeckSize * numberOfPlayers;
			}

			// Ensure all necessary data is included in the draft creation
			const draftId = await createDraft(
				draftMethod,
				poolSize,
				numberOfPlayers,
				cube.map((card) => ({
					id: card.id, // Add the id field which is required for card_id
					name: card.name,
					quantity: card.quantity,
					type: card.type,
					apiData: card.apiData,
					imageUrl: card.imageUrl,
					smallImageUrl: card.smallImageUrl
				})),
				draftMethod === 'winston' ? numberOfPiles : 3,
				draftMethod === 'rochester' ? packSize : 5,
				extraDeckAtEnd, // Pass the extra deck option to createDraft
				draftMethod === 'rochester' && useRarityDistribution
					? {
							commonPerPack,
							rarePerPack,
							superRarePerPack,
							ultraRarePerPack
						}
					: null
			);

			// Store draft settings in sessionStorage for additional backup
			sessionStorage.setItem(
				'draftSettings',
				JSON.stringify({
					draftMethod,
					poolSize,
					draftedDeckSize: draftMethod === 'rochester' ? draftedDeckSize : undefined,
					numberOfPlayers,
					numberOfPiles: draftMethod === 'winston' ? numberOfPiles : undefined,
					packsPerRound: draftMethod === 'rochester' ? packsPerRound : undefined,
					packSize: draftMethod === 'rochester' ? packSize : undefined,
					extraDeckAtEnd, // Include in saved settings
					useRarityDistribution, // Include rarity distribution settings
					raritySettings: useRarityDistribution
						? {
								commonPerPack,
								rarePerPack,
								superRarePerPack,
								ultraRarePerPack
							}
						: undefined
				})
			);

			// Navigate to the draft page with the base path prepended
			goto(`${base}/draft?id=${draftId}`);
		} catch (error) {
			console.error('Error starting draft:', error);
			errorMessage = 'Failed to start draft. Please try again.';
		} finally {
			isProcessing = false;
		}
	}

	async function handleGitHubLogin() {
		isProcessing = true;
		try {
			await signInWithGitHub();
		} catch (error) {
			console.error('Error signing in with GitHub:', error);
		} finally {
			isProcessing = false;
		}
	}

	async function handleDiscordLogin() {
		isProcessing = true;
		try {
			await signInWithDiscord();
		} catch (error) {
			console.error('Error signing in with Discord:', error);
		} finally {
			isProcessing = false;
		}
	}
</script>

<div class="space-y-6">
	{#if isAuthenticated}
		<!-- Cube File Upload -->
		<div>
			<div class="mb-1 flex items-center">
				<label for="cube-file" class="block text-sm font-medium text-gray-700">
					Upload Cube File (.csv)
				</label>
				<div class="relative ml-2">
					<button
						type="button"
						class="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300"
						aria-label="Cube file information"
						onmouseenter={() => (showCubeTooltip = true)}
						onmouseleave={() => (showCubeTooltip = false)}
					>
						?
					</button>

					{#if showCubeTooltip}
						<div
							class="prose prose-sm ring-opacity-5 absolute top-0 left-6 z-10 w-64 rounded-md bg-white p-3 shadow-lg ring-1 ring-black"
						>
							<h4 class="text-sm font-medium text-gray-900">Cube File Format</h4>
							<p class="text-xs text-gray-600">
								Visit <a
									href="https://ygoprodeck.com/cube/"
									target="_blank"
									rel="noopener noreferrer"
									class="text-blue-600 hover:underline">YGOProdeck Cube Builder</a
								> to find or build a cube, then click the button to download it as a CSV file.
							</p>
						</div>
					{/if}
				</div>
			</div>
			<div class="relative">
				<input
					type="file"
					id="cube-file"
					accept=".csv"
					onchange={handleFileUpload}
					class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border file:border-gray-300 file:bg-gray-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-100"
					disabled={isProcessing}
				/>
				{#if isProcessing}
					<!-- Spinner -->
					<div class="bg-opacity-75 absolute inset-0 flex items-center justify-center bg-white">
						<svg
							class="h-6 w-6 animate-spin text-indigo-600"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path>
						</svg>
					</div>
				{/if}
			</div>
			{#if errorMessage}
				<!-- Error Message -->
				<p class="mt-2 text-sm text-red-600">{errorMessage}</p>
			{/if}
		</div>

		<!-- Draft Method Selection -->
		<div>
			<div class="mb-1 flex items-center">
				<label for="draft-method" class="block text-sm font-medium text-gray-700">
					Draft Method
				</label>
				<div class="relative ml-2">
					<button
						type="button"
						class="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300"
						aria-label="Draft method information"
						onmouseenter={() => (showMethodTooltip = true)}
						onmouseleave={() => (showMethodTooltip = false)}
					>
						?
					</button>

					{#if showMethodTooltip}
						<div
							class="prose prose-sm ring-opacity-5 absolute top-0 left-6 z-10 w-64 rounded-md bg-white p-3 shadow-lg ring-1 ring-black"
						>
							<h4 class="text-sm font-medium text-gray-900">Draft Methods</h4>
							<p class="text-xs text-gray-600">
								<strong>Rochester Draft:</strong>
								{draftMethodDescriptions.rochester}
							</p>
							<p class="mb-2 text-xs text-gray-600">
								<strong>Winston Draft:</strong>
								{draftMethodDescriptions.winston}
							</p>
						</div>
					{/if}
				</div>
			</div>
			<select
				id="draft-method"
				bind:value={draftMethod}
				onchange={validateOptions}
				class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
			>
				<option value="rochester">Rochester Draft</option>
				<option value="winston">Winston Draft</option>
			</select>
		</div>

		<!-- Pool Size -->
		{#if draftMethod === 'rochester'}
			<div>
				<label for="drafted-deck-size" class="mb-1 block text-sm font-medium text-gray-700">
					Drafted deck size <span class="text-xs text-gray-500">(max: {maxDraftedDeckSize})</span>
				</label>
				<input
					type="number"
					id="drafted-deck-size"
					bind:value={draftedDeckSize}
					min="1"
					max={maxDraftedDeckSize}
					oninput={validateOptions}
					class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
				/>
				<p class="mt-1 text-sm text-gray-500">
					Total pool size: {draftedDeckSize * numberOfPlayers} cards
				</p>
			</div>
		{:else}
			<div>
				<label for="pool-size" class="mb-1 block text-sm font-medium text-gray-700">
					Pool Size <span class="text-xs text-gray-500">(max: {MAX_POOL_SIZE})</span>
				</label>
				<input
					type="number"
					id="pool-size"
					bind:value={poolSize}
					min="1"
					max={MAX_POOL_SIZE}
					oninput={validateOptions}
					class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
				/>
			</div>
		{/if}

		<!-- Number of Players -->
		<div>
			<label for="number-of-players" class="mb-1 block text-sm font-medium text-gray-700">
				Number of Players <span class="text-xs text-gray-500">(max: {MAX_PLAYERS})</span>
			</label>
			<input
				type="number"
				id="number-of-players"
				bind:value={numberOfPlayers}
				min="2"
				max={MAX_PLAYERS}
				oninput={validateOptions}
				class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
			/>
		</div>

		<!-- Rochester Draft Options -->
		{#if draftMethod === 'rochester'}
			<div>
				<label for="pack-size" class="mb-1 block text-sm font-medium text-gray-700">
					Pack Size
				</label>
				<input
					type="number"
					id="pack-size"
					bind:value={packSize}
					min="1"
					oninput={validateOptions}
					class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
				/>
			</div>

			<!-- Rarity Distribution Option -->
			<div class="flex items-center">
				<input
					type="checkbox"
					id="use-rarity-distribution"
					bind:checked={useRarityDistribution}
					onchange={() => {
						if (useRarityDistribution) {
							extraDeckAtEnd = false;
						}
						validateOptions();
					}}
					disabled={extraDeckAtEnd}
					class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<label
					for="use-rarity-distribution"
					class="ml-2 block text-sm text-gray-700"
					class:text-gray-400={extraDeckAtEnd}
					class:cursor-not-allowed={extraDeckAtEnd}
				>
					Use pack rarity distribution
				</label>
			</div>

			<!-- Rarity Distribution Settings -->
			{#if useRarityDistribution}
				<div class="ml-6 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
					<div>
						<label for="common-per-pack" class="mb-1 block text-sm font-medium text-gray-700">
							Commons per pack
						</label>
						<input
							type="number"
							id="common-per-pack"
							bind:value={commonPerPack}
							min="0"
							oninput={validateOptions}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="rare-per-pack" class="mb-1 block text-sm font-medium text-gray-700">
							Rares per pack
						</label>
						<input
							type="number"
							id="rare-per-pack"
							bind:value={rarePerPack}
							min="0"
							oninput={validateOptions}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="super-rare-per-pack" class="mb-1 block text-sm font-medium text-gray-700">
							Super Rares per pack
						</label>
						<input
							type="number"
							id="super-rare-per-pack"
							bind:value={superRarePerPack}
							min="0"
							oninput={validateOptions}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="ultra-rare-per-pack" class="mb-1 block text-sm font-medium text-gray-700">
							Ultra Rares per pack
						</label>
						<input
							type="number"
							id="ultra-rare-per-pack"
							bind:value={ultraRarePerPack}
							min="0"
							oninput={validateOptions}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
						/>
					</div>

					<div class="rounded border border-blue-200 bg-blue-50 p-2 text-blue-800">
						<p class="text-sm">
							Total: {commonPerPack + rarePerPack + superRarePerPack + ultraRarePerPack}
							(must equal pack size of {packSize})
						</p>
					</div>
				</div>
			{/if}

			<!-- Winston Draft Options -->
		{:else if draftMethod === 'winston'}
			<div>
				<label for="number-of-piles" class="mb-1 block text-sm font-medium text-gray-700">
					Number of Piles
				</label>
				<input
					type="number"
					id="number-of-piles"
					bind:value={numberOfPiles}
					min="1"
					oninput={validateOptions}
					class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
				/>
			</div>
		{/if}

		<!-- Extra Deck at End Option -->
		<div class="flex items-center">
			<input
				type="checkbox"
				id="extra-deck-at-end"
				bind:checked={extraDeckAtEnd}
				onchange={() => {
					if (extraDeckAtEnd) {
						useRarityDistribution = false;
					}
					validateOptions();
				}}
				disabled={useRarityDistribution}
				class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
			/>
			<label
				for="extra-deck-at-end"
				class="ml-2 block text-sm text-gray-700"
				class:text-gray-400={useRarityDistribution}
				class:cursor-not-allowed={useRarityDistribution}
			>
				Move extra deck cards to end of the pool
			</label>
		</div>

		<!-- Option Validation Error -->
		{#if optionErrorMessage}
			<p class="mt-2 text-sm text-red-600">{optionErrorMessage}</p>
		{/if}

		<!-- Uneven Pool Warning -->
		{#if showUnevenPoolWarning && useRarityDistribution && draftMethod === 'rochester'}
			<div class="mt-4 rounded-md bg-orange-50 p-3">
				<div class="flex">
					<div class="flex-shrink-0">
						<svg
							class="h-5 w-5 text-orange-400"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fill-rule="evenodd"
								d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="ml-3">
						<h3 class="text-sm font-medium text-orange-800">Uneven pool warning</h3>
						<div class="mt-2 text-sm text-orange-700">
							<p>
								The total pool size ({poolSize}) is not evenly divisible by the number of cards in
								each round ({packSize * numberOfPlayers}). The last round's packs will be smaller
								and won't match your specified rarity distribution.
							</p>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Submit Button -->
		<div>
			<button
				type="button"
				class="w-full rounded-md bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
				onclick={startDraft}
				disabled={!isCubeValid || isProcessing || optionErrorMessage}
			>
				Start Draft
			</button>
		</div>
	{:else}
		<!-- Login prompt for non-authenticated users -->
		<div class="flex flex-col items-center space-y-6 py-8 text-center">
			<div class="mb-4 space-y-3">
				<h2 class="text-xl font-bold text-gray-800">Login to Start Drafting</h2>
				<p class="text-gray-600">
					You need to login to create and participate in drafts. Sign in with one of the methods
					below to get started.
				</p>
			</div>

			<div class="w-full max-w-sm space-y-4">
				<button
					type="button"
					onclick={handleGitHubLogin}
					disabled={isProcessing}
					class="flex w-full items-center justify-center rounded-md bg-gray-800 px-4 py-2 text-white shadow-sm hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none disabled:bg-gray-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="mr-2"
					>
						<path
							d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
						/>
					</svg>
					Sign in with GitHub
				</button>

				<button
					type="button"
					onclick={handleDiscordLogin}
					disabled={isProcessing}
					class="flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:bg-gray-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 127.14 96.36"
						fill="currentColor"
						class="mr-2"
					>
						<path
							d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
						/>
					</svg>
					Sign in with Discord
				</button>
			</div>

			{#if isProcessing}
				<div class="mt-4 flex items-center justify-center">
					<svg
						class="mr-2 h-5 w-5 animate-spin text-indigo-600"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					<span>Processing...</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Warning Modal for Cards Without Rarity -->
{#if showRarityWarning && cardsWithoutRarity.length > 0}
	<div
		class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black p-4"
	>
		<div class="relative mx-auto max-w-2xl rounded-lg bg-white shadow-xl">
			<div class="p-6">
				<div class="mb-4 text-center">
					<h3 class="text-lg font-medium text-gray-900">
						Warning: Cards Without Rarity Information
					</h3>
					<p class="mt-2 text-sm text-gray-500">
						The following cards don't have rarity information and won't be included in the draft if
						you use rarity distribution:
					</p>
				</div>

				<div class="max-h-96 overflow-auto">
					<div class="space-y-2 p-2">
						{#each cardsWithoutRarity as card}
							<div class="flex items-center rounded border border-gray-200 p-2">
								<img
									src={card.smallImageUrl || card.imageUrl}
									alt={card.name}
									class="mr-2 h-12 w-12 rounded object-cover"
								/>
								<span class="text-sm">{card.name}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="mt-6 flex justify-center space-x-4">
					<button
						type="button"
						class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
						onclick={() => {
							showRarityWarning = false;
						}}
					>
						I Understand
					</button>

					<button
						type="button"
						class="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none"
						onclick={() => {
							useRarityDistribution = false;
							showRarityWarning = false;
							validateOptions();
						}}
					>
						Disable Rarity Distribution
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
