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
	import LoginPrompt from '$lib/components/LoginPrompt.svelte';

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
	let hasCustomRarities = $state(false); // Track if the cube has custom rarities
	let cardsWithoutCustomRarity = $state([]);

	// Fade-out states and timers for tooltips
	let methodTooltipTimer = $state(null);
	let cubeTooltipTimer = $state(null);

	// Constants for limits
	const MAX_POOL_SIZE = 1000;
	const MAX_PLAYERS = 10;
	const DAILY_DRAFT_LIMIT = 100; // Not used directly in UI but useful for reference
	const TOOLTIP_FADE_DELAY = 100; // 500ms delay for tooltip fade-out

	// Derived value for max drafted deck size
	let maxDraftedDeckSize = $derived(Math.floor(MAX_POOL_SIZE / numberOfPlayers));

	// Functions to handle tooltip visibility with fade effect
	function startTooltipFadeOut(tooltipType) {
		if (tooltipType === 'method') {
			if (methodTooltipTimer) clearTimeout(methodTooltipTimer);

			// Select the tooltip element and add the hiding class
			const tooltip = document.querySelector('[role="tooltip"]');
			if (tooltip) tooltip.classList.add('hiding');

			methodTooltipTimer = setTimeout(() => {
				showMethodTooltip = false;
				methodTooltipTimer = null;
			}, TOOLTIP_FADE_DELAY);
		} else if (tooltipType === 'cube') {
			if (cubeTooltipTimer) clearTimeout(cubeTooltipTimer);

			// Find the cube tooltip element and add the hiding class
			const tooltips = document.querySelectorAll('[role="tooltip"]');
			tooltips.forEach((tooltip) => {
				if (tooltip.textContent.includes('Cube File Format')) {
					tooltip.classList.add('hiding');
				}
			});

			cubeTooltipTimer = setTimeout(() => {
				showCubeTooltip = false;
				cubeTooltipTimer = null;
			}, TOOLTIP_FADE_DELAY);
		}
	}

	function cancelTooltipFadeOut(tooltipType) {
		if (tooltipType === 'method') {
			if (methodTooltipTimer) {
				clearTimeout(methodTooltipTimer);
				methodTooltipTimer = null;

				// Remove the hiding class to restore opacity
				const tooltip = document.querySelector('[role="tooltip"]');
				if (tooltip && tooltip.textContent.includes('Draft Methods')) {
					tooltip.classList.remove('hiding');
				}
			}
		} else if (tooltipType === 'cube') {
			if (cubeTooltipTimer) {
				clearTimeout(cubeTooltipTimer);
				cubeTooltipTimer = null;

				// Remove the hiding class to restore opacity
				const tooltips = document.querySelectorAll('[role="tooltip"]');
				tooltips.forEach((tooltip) => {
					if (tooltip.textContent.includes('Cube File Format')) {
						tooltip.classList.remove('hiding');
					}
				});
			}
		}
	}

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

						// Check if the cube has custom rarities
						if (uploadedCube.hasCustomRarities) {
							hasCustomRarities = true;
							cardsWithoutCustomRarity = uploadedCube.cardsWithoutCustomRarity || [];
						}

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
			// Check for cards without rarities based on whether we have custom rarities or not
			if (hasCustomRarities) {
				cardsWithoutRarity = cube.filter((card) => !card?.custom_rarity);
			} else {
				cardsWithoutRarity = cube.filter((card) => !card?.apiData?.rarity);
			}

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
					smallImageUrl: card.smallImageUrl,
					custom_rarity: card?.custom_rarity // Include custom rarity if available
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
						onmouseenter={() => {
							cancelTooltipFadeOut('cube');
							showCubeTooltip = true;
						}}
						onmouseleave={() => startTooltipFadeOut('cube')}
					>
						?
					</button>

					{#if showCubeTooltip}
						<div
							class="prose prose-sm ring-opacity-5 tooltip-fade absolute top-0 left-6 z-10 w-64 rounded-md bg-white p-3 shadow-lg ring-1 ring-black"
							style={`--fadeOutTime: ${TOOLTIP_FADE_DELAY}ms`}
							onmouseenter={() => {
								cancelTooltipFadeOut('cube');
								showCubeTooltip = true;
							}}
							onmouseleave={() => startTooltipFadeOut('cube')}
							role="tooltip"
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
							<p class="mt-1 text-xs text-gray-600">
								<strong>Custom Rarities:</strong> To add custom rarities, include a fifth column in your
								CSV with one of the following values: "Common", "Rare", "Super Rare", "Ultra Rare". You
								can also just use the acronyms ("c", "r", "sr", "ur"). Master Duel rarities are used
								if not specified.
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
						onmouseenter={() => {
							cancelTooltipFadeOut('method');
							showMethodTooltip = true;
						}}
						onmouseleave={() => startTooltipFadeOut('method')}
					>
						?
					</button>

					{#if showMethodTooltip}
						<div
							class="prose prose-sm ring-opacity-5 tooltip-fade absolute top-0 left-6 z-10 w-64 rounded-md bg-white p-3 shadow-lg ring-1 ring-black"
							style={`--fadeOutTime: ${TOOLTIP_FADE_DELAY}ms`}
							onmouseenter={() => {
								cancelTooltipFadeOut('method');
								showMethodTooltip = true;
							}}
							onmouseleave={() => startTooltipFadeOut('method')}
							role="tooltip"
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
					class={[
						'ml-2 block text-sm',
						{ 'text-gray-700': !extraDeckAtEnd },
						{ 'linethrough text-gray-400': extraDeckAtEnd }
					]}
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
				class={[
					'ml-2 block text-sm',
					{ 'text-gray-700': !useRarityDistribution },
					{ 'linethrough text-gray-400': useRarityDistribution }
				]}
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

		<!-- Custom Rarities Message -->
		{#if isCubeValid && hasCustomRarities && useRarityDistribution}
			{#if cardsWithoutCustomRarity.length > 0}
				<!-- Warning for cards without custom rarity -->
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
							<h3 class="text-sm font-medium text-orange-800">Cards without custom rarity</h3>
							<div class="mt-2 text-sm text-orange-700">
								<p>
									Some cards don't have custom rarity information and may not be properly
									distributed.
									<button
										type="button"
										class="ml-1 text-orange-800 underline"
										onclick={() => {
											showRarityWarning = true;
											cardsWithoutRarity = cardsWithoutCustomRarity;
										}}
									>
										View cards without custom rarity.
									</button>
								</p>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<!-- Success message when all cards have custom rarity -->
				<div class="mt-4 rounded-md bg-green-50 p-3">
					<div class="flex">
						<div class="flex-shrink-0">
							<svg
								class="h-5 w-5 text-green-400"
								viewBox="0 0 20 20"
								fill="currentColor"
								aria-hidden="true"
							>
								<path
									fill-rule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
						<div class="ml-3">
							<h3 class="text-sm font-medium text-green-800">Custom rarities detected</h3>
							<div class="mt-2 text-sm text-green-700">
								<p>Custom rarities will be used for card distribution in Rochester draft.</p>
							</div>
						</div>
					</div>
				</div>
			{/if}
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
		<LoginPrompt
			on:login={() => {
				// The login event is fired when authentication is successful
				// We don't need to do anything here since the component will re-render
				// due to isAuthenticated changing
			}}
		/>
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

<style>
	.tooltip-fade {
		opacity: 1;
		transition: opacity var(--fadeOutTime) linear;
	}

	:global(.tooltip-fade.hiding) {
		opacity: 0;
	}
</style>
