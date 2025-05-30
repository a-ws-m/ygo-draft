<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { createDraft } from '$lib/utils/supabaseDraftManager';
	import { store as authStore } from '$lib/stores/authStore.svelte';
	import LoginPrompt from '$lib/components/LoginPrompt.svelte';
	import feather from 'feather-icons';

	// Define a callback prop for handling cube uploads
	let { onCubeUploaded }: { onCubeUploaded: (cube: any[]) => void } = $props();

	// Use $state for reactive variables in Svelte 5
	let draftMethod = $state('rochester');
	let poolSize = $state(120);
	let draftedDeckSize = $state(60); // New variable for drafted deck size
	let numberOfPlayers = $state(2);
	let numberOfPiles = $state(3);
	let gridSize = $state(3); // New variable for grid draft
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
	let cardsMissingBothRarities = $state([]); // Track cards missing both custom and Master Duel rarities

	// New state for pre-made cube modal and selection
	let showPremadeCubesModal = $state(false);
	let selectedPremadeCube = $state('');

	// Info about pre-made cubes
	const premadeCubes = [
		{
			id: 'generic-cube-magnum-opus',
			name: 'Generic Cube: Magnum Opus',
			description:
				'A huge cube of cards that all function somewhat generically, varying from trash to somewhat overpowered. This cube may slow down the site during loading!',
			credits: 'By Retrorage',
			filename: 'generic-cube-magnum-opus.csv',
			cardCount: '3060 cards'
		},
		{
			id: 'goat-cube',
			name: 'Goat Format Cube',
			description: 'A cube featuring cards from the classic 2005 "Goat Format" era of Yu-Gi-Oh!',
			credits: 'By Skully from the GoatFormat.com Discord.',
			filename: 'goat-cube.csv',
			cardCount: '600 cards'
		}
	];

	// Fade-out states and timers for tooltips
	let methodTooltipTimer = $state(null);
	let cubeTooltipTimer = $state(null);

	// Constants for limits
	const MAX_POOL_SIZE = 1000;
	const MAX_PLAYERS = 10;
	const MAX_GRID_SIZE = 5; // Maximum grid size
	const MIN_GRID_SIZE = 2; // Minimum grid size
	const DAILY_DRAFT_LIMIT = 100; // Not used directly in UI but useful for reference
	const TOOLTIP_FADE_DELAY = 100; // 500ms delay for tooltip fade-out

	// Derived value for max drafted deck size
	let maxDraftedDeckSize = $derived(Math.floor(MAX_POOL_SIZE / numberOfPlayers));

	// Derived value for cards needed per grid draft round
	let cardsPerGridRound = $derived(gridSize);
	let initialGridCards = $derived(gridSize * gridSize);

	// Derived value for total number of rounds in grid draft
	let totalGridRounds = $derived(Math.floor(draftedDeckSize / gridSize));

	// Derived value for total pool size needed for grid draft
	let gridTotalPoolSize = $derived(
		initialGridCards + totalGridRounds * cardsPerGridRound * numberOfPlayers
	);

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
		rochester: `In Rochester Draft, players pass a pack of cards in a circle, taking one card at a time, until no cards remain in the packs. Then, another pack is opened for each player, and the process continues until there are no cards left in the pool.`,
		grid: `In Grid Draft, cards are laid out in a square grid (default 3x3). On your turn, you choose to take either a row or a column of cards from the grid. The selected cards are added to your deck, and the row/column is replaced with new cards from the pool.`
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

						// Call the callback prop instead of dispatching an event
						onCubeUploaded(cube);

						// Check if the cube has custom rarities
						if (uploadedCube.hasCustomRarities) {
							hasCustomRarities = true;
							cardsWithoutCustomRarity = uploadedCube.cardsWithoutCustomRarity || [];
						}

						validateOptions();
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

	async function selectPremadeCube(cubeId: string) {
		isProcessing = true;
		errorMessage = '';
		selectedPremadeCube = cubeId;

		try {
			const selectedCube = premadeCubes.find((cube) => cube.id === cubeId);
			if (!selectedCube) throw new Error('Selected cube not found');

			// Fetch the cube file from the static directory
			const response = await fetch(`${base}/${selectedCube.filename}`);
			if (!response.ok) throw new Error('Failed to fetch the selected cube file');

			// Convert to a File object that our existing processor can handle
			const csvText = await response.text();
			const cubeFile = new File([csvText], selectedCube.filename, { type: 'text/csv' });

			// Use the existing processCubeFile function
			const { processCubeFile } = await import('$lib/utils/cubeProcessor');
			const uploadedCube = await processCubeFile(cubeFile);

			console.log('Pre-made cube processed successfully.');
			isCubeValid = true;
			cube = uploadedCube;
			totalCards = cube.reduce((sum, card) => sum + card.quantity, 0);

			// Call the callback prop
			onCubeUploaded(cube);

			// Check if the cube has custom rarities
			if (uploadedCube.hasCustomRarities) {
				hasCustomRarities = true;
				cardsWithoutCustomRarity = uploadedCube.cardsWithoutCustomRarity || [];
			}

			validateOptions();
			showPremadeCubesModal = false;
		} catch (error) {
			console.error('Error processing pre-made cube:', error);
			isCubeValid = false;
			errorMessage = error.message;
		} finally {
			isProcessing = false;
		}
	}

	function checkForCardsWithoutRarity() {
		if (useRarityDistribution && draftMethod === 'rochester') {
			// Check for cards without rarities based on whether we have custom rarities or not
			if (hasCustomRarities) {
				// When using custom rarities, check for cards without custom rarity
				cardsWithoutCustomRarity = cube.filter((card) => !card?.custom_rarity);

				// Find cards that are missing both custom rarity and Master Duel rarity
				cardsMissingBothRarities = cube.filter(
					(card) => !card?.custom_rarity && !card?.apiData?.rarity
				);

				// Cards that will appear in the warning modal
				cardsWithoutRarity = cardsWithoutCustomRarity;
			} else {
				// When using Master Duel rarities, check for cards without MD rarity
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

	// Modified validateOptions function to handle grid draft validation properly
	function validateOptions() {
		optionErrorMessage = '';
		showUnevenPoolWarning = false; // Reset the warning flag

		// First check database limits
		if (draftMethod === 'rochester' || draftMethod === 'grid') {
			// For Rochester, calculate pool size from drafted deck size
			if (draftMethod === 'rochester') {
				poolSize = draftedDeckSize * numberOfPlayers;
			}
			// For Grid, calculate pool size based on rounds needed
			else if (draftMethod === 'grid') {
				poolSize = gridTotalPoolSize;
			}
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
		} else if (draftMethod === 'grid') {
			// Grid draft specific validations
			if (gridSize < MIN_GRID_SIZE || gridSize > MAX_GRID_SIZE) {
				optionErrorMessage = `Grid size must be between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE}.`;
				return;
			}

			// Check if drafted deck size is divisible by grid size (each player gets grid-size cards per turn)
			if (draftedDeckSize % gridSize !== 0) {
				optionErrorMessage = `Drafted deck size (${draftedDeckSize}) must be divisible by grid size (${gridSize}).`;
				return;
			}

			// Calculate total cards needed for all grid rounds
			const totalCardsNeeded = gridTotalPoolSize;

			// Check if total pool has enough cards for all rounds
			if (poolSize < totalCardsNeeded) {
				optionErrorMessage = `Pool needs at least ${totalCardsNeeded} cards for all players to draft ${draftedDeckSize} cards each using ${gridSize}×${gridSize} grids.`;
				return;
			}

			// Check if the cube has enough cards
			if (totalCards < totalCardsNeeded) {
				optionErrorMessage = `Not enough cards in the cube. Need at least ${totalCardsNeeded} cards for all players to draft ${draftedDeckSize} cards each.`;
				return;
			}
		}
	}

	async function startDraft() {
		if (!isCubeValid || optionErrorMessage) return;

		isProcessing = true;

		try {
			// For Rochester and Grid drafts, ensure pool size is correctly calculated
			if (draftMethod === 'rochester') {
				poolSize = draftedDeckSize * numberOfPlayers;
			} else if (draftMethod === 'grid') {
				poolSize = gridTotalPoolSize;
			}

			// Ensure all necessary data is included in the draft creation
			const draftId = await createDraft(
				draftMethod,
				poolSize,
				numberOfPlayers,
				cube.map((card) => ({
					id: card.id,
					name: card.name,
					quantity: card.quantity,
					type: card.type,
					apiData: card.apiData,
					imageUrl: card.imageUrl,
					smallImageUrl: card.smallImageUrl,
					custom_rarity: card?.custom_rarity
				})),
				draftMethod === 'winston' ? numberOfPiles : draftMethod === 'grid' ? gridSize : 3,
				draftMethod === 'rochester' ? packSize : 5,
				extraDeckAtEnd, // Grid draft can also use the extra deck at end option
				draftMethod === 'rochester' && useRarityDistribution
					? {
							commonPerPack,
							rarePerPack,
							superRarePerPack,
							ultraRarePerPack
						}
					: null,
				draftMethod === 'grid' || draftMethod === 'rochester' ? draftedDeckSize : undefined
			);

			// Store draft settings in sessionStorage for additional backup
			sessionStorage.setItem(
				'draftSettings',
				JSON.stringify({
					draftMethod,
					poolSize,
					draftedDeckSize:
						draftMethod === 'rochester' || draftMethod === 'grid' ? draftedDeckSize : undefined,
					numberOfPlayers,
					numberOfPiles: draftMethod === 'winston' ? numberOfPiles : undefined,
					gridSize: draftMethod === 'grid' ? gridSize : undefined,
					packsPerRound: draftMethod === 'rochester' ? packsPerRound : undefined,
					packSize: draftMethod === 'rochester' ? packSize : undefined,
					extraDeckAtEnd,
					useRarityDistribution,
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
		<!-- Cube File Upload with Pre-made Cube Option -->
		<div class="relative">
			<div class="mb-1 flex items-center">
				<label for="cube-file" class="text-base-content block text-sm font-medium">
					Upload Cube File (.csv)
				</label>
				<div class="relative ml-2">
					<button
						type="button"
						class="btn btn-xs btn-circle btn-ghost"
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
							class="prose prose-sm ring-opacity-5 tooltip-fade bg-base-100 ring-base-300 absolute top-0 left-6 z-10 w-64 rounded-md p-3 shadow-lg ring-1"
							style={`--fadeOutTime: ${TOOLTIP_FADE_DELAY}ms`}
							onmouseenter={() => {
								cancelTooltipFadeOut('cube');
								showCubeTooltip = true;
							}}
							onmouseleave={() => startTooltipFadeOut('cube')}
							role="tooltip"
						>
							<h4 class="text-base-content text-sm font-medium">Cube File Format</h4>
							<p class="text-base-content/70 text-xs">
								Visit <a
									href="https://ygoprodeck.com/cube/"
									target="_blank"
									rel="noopener noreferrer"
									class="link link-primary">YGOProdeck Cube Builder</a
								>
								to find or build a cube, then click the button to download it as a CSV file.
							</p>
							<p class="text-base-content/70 mt-1 text-xs">
								<strong>Custom Rarities:</strong> To add custom rarities, include a fifth column in your
								CSV with one of the following values: "Common", "Rare", "Super Rare", "Ultra Rare". To
								do this, add a comma to each row, followed by the custom rarity. You can also just use
								the acronyms ("c", "r", "sr", "ur"). Master Duel rarities are used if not specified.
							</p>
						</div>
					{/if}
				</div>
			</div>

			<div class="join join-vertical w-full">
				<div class="join-item flex-1">
					<input
						type="file"
						id="cube-file"
						accept=".csv"
						onchange={handleFileUpload}
						class="file-input file-input-bordered w-full"
						disabled={isProcessing}
					/>
				</div>

				<div class="divider text-base-content/50 my-3">OR</div>

				<div class="join-item">
					<button
						type="button"
						class="btn btn-secondary flex w-full items-center justify-center"
						onclick={() => (showPremadeCubesModal = true)}
						disabled={isProcessing}
					>
						<span class="mr-1 flex items-center">
							{@html feather.icons.list.toSvg({ width: 18, height: 18 })}
						</span>
						<span>Select Pre-made Cube</span>
					</button>
				</div>
			</div>

			{#if isProcessing}
				<!-- Spinner with loading message - properly positioned over upload section -->
				<div
					class="bg-opacity-75 bg-base-100 absolute inset-0 z-10 flex items-center justify-center rounded"
				>
					<span class="loading loading-spinner loading-lg text-primary mr-3"></span>
					<span class="text-primary text-sm">Fetching card data (this may take a while)</span>
				</div>
			{/if}

			{#if errorMessage}
				<p class="text-error mt-2 text-sm">{errorMessage}</p>
			{/if}
		</div>

		<!-- Draft Method Selection -->
		<div>
			<div class="mb-1 flex items-center">
				<label for="draft-method" class="text-base-content block text-sm font-medium">
					Draft Method
				</label>
				<div class="relative ml-2">
					<button
						type="button"
						class="btn btn-xs btn-circle btn-ghost"
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
							class="prose prose-sm ring-opacity-5 tooltip-fade bg-base-100 ring-base-300 absolute top-0 left-6 z-10 w-64 rounded-md p-3 shadow-lg ring-1"
							style={`--fadeOutTime: ${TOOLTIP_FADE_DELAY}ms`}
							onmouseenter={() => {
								cancelTooltipFadeOut('method');
								showMethodTooltip = true;
							}}
							onmouseleave={() => startTooltipFadeOut('method')}
							role="tooltip"
						>
							<h4 class="text-base-content text-sm font-medium">Draft Methods</h4>
							<p class="text-base-content/70 text-xs">
								<strong>Rochester Draft:</strong>
								{draftMethodDescriptions.rochester}
							</p>
							<p class="text-base-content/70 text-xs">
								<strong>Winston Draft:</strong>
								{draftMethodDescriptions.winston}
							</p>
							<p class="text-base-content/70 mb-2 text-xs">
								<strong>Grid Draft:</strong>
								{draftMethodDescriptions.grid}
							</p>
						</div>
					{/if}
				</div>
			</div>
			<select
				id="draft-method"
				bind:value={draftMethod}
				onchange={validateOptions}
				class="select select-bordered w-full"
			>
				<option value="rochester">Rochester Draft</option>
				<option value="winston">Winston Draft</option>
				<option value="grid">Grid Draft</option>
			</select>
		</div>

		<!-- Pool Size -->
		{#if draftMethod === 'rochester' || draftMethod === 'grid'}
			<div>
				<label for="drafted-deck-size" class="text-base-content mb-1 block text-sm font-medium">
					Drafted deck size <span class="text-base-content/60 text-xs"
						>(max: {maxDraftedDeckSize})</span
					>
				</label>
				<input
					type="number"
					id="drafted-deck-size"
					bind:value={draftedDeckSize}
					min="1"
					max={maxDraftedDeckSize}
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
				{#if draftMethod === 'rochester'}
					<p class="text-base-content/60 mt-1 text-sm">
						Total pool size: {draftedDeckSize * numberOfPlayers} cards
					</p>
				{:else if draftMethod === 'grid'}
					<p class="text-base-content/60 mt-1 text-sm">
						Total pool size: {gridTotalPoolSize} cards ({initialGridCards} initial grid cards + {cardsPerGridRound}
						cards × {totalGridRounds}
						rounds × {numberOfPlayers} players)
					</p>
				{/if}
			</div>
		{:else}
			<div>
				<label for="pool-size" class="text-base-content mb-1 block text-sm font-medium">
					Pool Size <span class="text-base-content/60 text-xs">(max: {MAX_POOL_SIZE})</span>
				</label>
				<input
					type="number"
					id="pool-size"
					bind:value={poolSize}
					min="1"
					max={MAX_POOL_SIZE}
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>
		{/if}

		<!-- Number of Players -->
		<div>
			<label for="number-of-players" class="text-base-content mb-1 block text-sm font-medium">
				Number of Players <span class="text-base-content/60 text-xs">(max: {MAX_PLAYERS})</span>
			</label>
			<input
				type="number"
				id="number-of-players"
				bind:value={numberOfPlayers}
				min="2"
				max={MAX_PLAYERS}
				oninput={validateOptions}
				class="input input-bordered w-full"
			/>
		</div>

		<!-- Rochester Draft Options -->
		{#if draftMethod === 'rochester'}
			<div>
				<label for="pack-size" class="text-base-content mb-1 block text-sm font-medium">
					Pack Size
				</label>
				<input
					type="number"
					id="pack-size"
					bind:value={packSize}
					min="1"
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>

			<!-- Rarity Distribution Option -->
			<div class="form-control">
				<label class="label cursor-pointer">
					<input
						type="checkbox"
						id="use-rarity-distribution"
						bind:checked={useRarityDistribution}
						onchange={() => {
							if (useRarityDistribution) {
								extraDeckAtEnd = false;
								checkForCardsWithoutRarity();
							} else {
								showRarityWarning = false;
							}
							validateOptions();
						}}
						disabled={extraDeckAtEnd}
						class="checkbox checkbox-primary"
					/>
					<span class="label-text ml-2">Use pack rarity distribution</span>
				</label>
			</div>

			<!-- Rarity Distribution Settings -->
			{#if useRarityDistribution}
				<div class="border-primary/20 bg-primary/5 ml-6 space-y-3 rounded-md border p-4">
					<div>
						<label for="common-per-pack" class="text-base-content mb-1 block text-sm font-medium">
							Commons per pack
						</label>
						<input
							type="number"
							id="common-per-pack"
							bind:value={commonPerPack}
							min="0"
							oninput={validateOptions}
							class="input input-bordered w-full"
						/>
					</div>
					<div>
						<label for="rare-per-pack" class="text-base-content mb-1 block text-sm font-medium">
							Rares per pack
						</label>
						<input
							type="number"
							id="rare-per-pack"
							bind:value={rarePerPack}
							min="0"
							oninput={validateOptions}
							class="input input-bordered w-full"
						/>
					</div>
					<div>
						<label
							for="super-rare-per-pack"
							class="text-base-content mb-1 block text-sm font-medium"
						>
							Super Rares per pack
						</label>
						<input
							type="number"
							id="super-rare-per-pack"
							bind:value={superRarePerPack}
							min="0"
							oninput={validateOptions}
							class="input input-bordered w-full"
						/>
					</div>
					<div>
						<label
							for="ultra-rare-per-pack"
							class="text-base-content mb-1 block text-sm font-medium"
						>
							Ultra Rares per pack
						</label>
						<input
							type="number"
							id="ultra-rare-per-pack"
							bind:value={ultraRarePerPack}
							min="0"
							oninput={validateOptions}
							class="input input-bordered w-full"
						/>
					</div>
					<div class="alert alert-info p-2">
						<span>
							Total: {commonPerPack + rarePerPack + superRarePerPack + ultraRarePerPack}
							(must equal pack size of {packSize})
						</span>
					</div>
				</div>
			{/if}
		{:else if draftMethod === 'winston'}
			<div>
				<label for="number-of-piles" class="text-base-content mb-1 block text-sm font-medium">
					Number of Piles
				</label>
				<input
					type="number"
					id="number-of-piles"
					bind:value={numberOfPiles}
					min="1"
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>
		{:else if draftMethod === 'grid'}
			<div>
				<label for="grid-size" class="text-base-content mb-1 block text-sm font-medium">
					Grid Size <span class="text-base-content/60 text-xs"
						>({MIN_GRID_SIZE}-{MAX_GRID_SIZE})</span
					>
				</label>
				<input
					type="number"
					id="grid-size"
					bind:value={gridSize}
					min={MIN_GRID_SIZE}
					max={MAX_GRID_SIZE}
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
				<p class="text-base-content/60 mt-1 text-sm">
					{gridSize}×{gridSize} grid ({cardsPerGridRound} cards per grid)
				</p>
				<p class="text-base-content/60 mt-1 text-sm">
					Each player will get {gridSize} cards per turn, for {totalGridRounds} turns
				</p>
			</div>
		{/if}

		<!-- Extra Deck at End Option -->
		<div class="form-control">
			<label class="label cursor-pointer">
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
					class="checkbox checkbox-primary"
				/>
				<span class="label-text ml-2">Move extra deck cards to end of the pool</span>
			</label>
		</div>

		<!-- Option Validation Error -->
		{#if optionErrorMessage}
			<p class="text-error mt-2 text-sm">{optionErrorMessage}</p>
		{/if}

		<!-- Uneven Pool Warning -->
		{#if showUnevenPoolWarning && useRarityDistribution && draftMethod === 'rochester'}
			<div class="alert alert-warning mt-4">
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
					class="feather feather-alert-circle"
					><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line
						x1="12"
						y1="16"
						x2="12.01"
						y2="16"
					></line></svg
				>
				<div>
					<h3 class="font-bold">Uneven pool warning</h3>
					<p>
						The total pool size ({poolSize}) is not evenly divisible by the number of cards in each
						round ({packSize * numberOfPlayers}). The last round's packs will be smaller and won't
						match your specified rarity distribution.
					</p>
				</div>
			</div>
		{/if}

		<!-- Custom Rarities Message -->
		{#if isCubeValid && hasCustomRarities && useRarityDistribution}
			{#if cardsWithoutCustomRarity.length > 0}
				<div class="alert alert-warning mt-4">
					<svg
						class="text-warning h-5 w-5"
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
					<div>
						<h3 class="font-bold">Cards without custom rarity</h3>
						<p>
							{cardsWithoutCustomRarity.length} cards don't have custom rarity information.
							{#if cardsMissingBothRarities.length === 0}
								Master Duel rarities will be used for all these cards.
							{:else}
								Master Duel rarities will be used for {cardsWithoutCustomRarity.length -
									cardsMissingBothRarities.length} cards.
								<span class="text-error font-semibold">
									However, {cardsMissingBothRarities.length}
									{cardsMissingBothRarities.length === 1 ? 'card' : 'cards'}
									{cardsMissingBothRarities.length === 1 ? 'is' : 'are'} missing both custom and Master
									Duel rarities and won't be included in the draft.
								</span>
							{/if}
							<button
								type="button"
								class="btn btn-link btn-xs text-warning ml-1"
								onclick={() => {
									showRarityWarning = true;
									cardsWithoutRarity = cardsWithoutCustomRarity;
								}}
							>
								View affected cards.
							</button>
						</p>
					</div>
				</div>
			{:else}
				<div class="alert alert-success mt-4">
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
						class="feather feather-alert-circle"
						><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"
						></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg
					>
					<div>
						<h3 class="font-bold">Custom rarities detected</h3>
						<p>Custom rarities will be used for card distribution in Rochester draft.</p>
					</div>
				</div>
			{/if}
		{/if}

		<!-- Submit Button -->
		<div>
			<button
				type="button"
				class="btn btn-primary w-full"
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

<!-- Pre-made Cubes Modal -->
{#if showPremadeCubesModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-3xl">
			<h3 class="text-base-content text-lg font-bold">Select a Pre-made Cube</h3>
			<p class="text-base-content/70 mt-2 mb-4 text-sm">
				Choose from one of our pre-made cubes to get started quickly.
			</p>

			<div class="grid gap-4 md:grid-cols-2">
				{#each premadeCubes as cube}
					<div class="card bg-base-200 shadow-sm transition-shadow duration-200 hover:shadow-md">
						<div class="card-body">
							<h2 class="card-title">{cube.name}</h2>
							<p class="text-sm">{cube.description}</p>
							<div class="text-base-content/60 mt-1 text-xs">
								<p>{cube.cardCount}</p>
								<p class="mt-1">{cube.credits}</p>
							</div>
							<div class="card-actions mt-4 justify-end">
								<button
									type="button"
									class="btn btn-primary btn-sm"
									onclick={() => selectPremadeCube(cube.id)}
									disabled={isProcessing}
								>
									{#if isProcessing && selectedPremadeCube === cube.id}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									Select
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="modal-action">
				<button
					type="button"
					class="btn"
					onclick={() => (showPremadeCubesModal = false)}
					disabled={isProcessing}
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Warning Modal for Cards Without Rarity -->
{#if showRarityWarning && cardsWithoutRarity.length > 0}
	<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="text-base-content text-lg font-bold">Warning: Cards Without Rarity Information</h3>
			{#if hasCustomRarities}
				<p class="text-base-content/70 mt-2 text-sm">
					The following cards don't have custom rarity information. Master Duel rarities will be
					used for these cards.
					{#if cardsMissingBothRarities.length > 0}
						<span class="text-error font-semibold">
							However, some cards (highlighted in red) are missing both custom and Master Duel
							rarities and won't be included in the draft.
						</span>
					{/if}
				</p>
			{:else}
				<p class="text-base-content/70 mt-2 text-sm">
					The following cards don't have Master Duel rarity information and won't be included in the
					draft if you use rarity distribution:
				</p>
			{/if}
			<div class="mt-4 max-h-96 overflow-auto">
				<div class="space-y-2 p-2">
					{#each cardsWithoutRarity as card}
						<div
							class="flex items-center rounded border p-2"
							class:border-error={hasCustomRarities &&
								!card?.custom_rarity &&
								!card?.apiData?.rarity}
							class:bg-error={hasCustomRarities && !card?.custom_rarity && !card?.apiData?.rarity}
						>
							{#if card.smallImageUrl instanceof Promise || card.imageUrl instanceof Promise}
								{#await card.smallImageUrl instanceof Promise ? card.smallImageUrl : card.imageUrl}
									<div class="bg-base-200 mr-2 flex h-12 w-12 items-center justify-center rounded">
										<span class="loading loading-spinner loading-xs text-base-content"></span>
									</div>
								{:then imageUrl}
									<img
										src={imageUrl}
										alt={card.name}
										class="mr-2 h-12 w-12 rounded object-cover"
										onerror={(e) => {
											e.target.src = 'https://via.placeholder.com/400x586?text=Image+Not+Found';
										}}
									/>
								{:catch}
									<img
										src="https://via.placeholder.com/400x586?text=Image+Not+Found"
										alt={card.name}
										class="mr-2 h-12 w-12 rounded object-cover"
									/>
								{/await}
							{:else}
								<img
									src={card.smallImageUrl || card.imageUrl}
									alt={card.name}
									class="mr-2 h-12 w-12 rounded object-cover"
									onerror={(e) => {
										e.target.src = 'https://via.placeholder.com/400x586?text=Image+Not+Found';
									}}
								/>
							{/if}
							<span
								class="text-sm"
								class:text-error={hasCustomRarities &&
									!card?.custom_rarity &&
									!card?.apiData?.rarity}
							>
								{card.name}
								{#if hasCustomRarities && !card?.custom_rarity && !card?.apiData?.rarity}
									<span class="ml-2 text-xs font-medium">(No Master Duel rarity)</span>
								{/if}
							</span>
						</div>
					{/each}
				</div>
			</div>
			<div class="modal-action">
				<button
					type="button"
					class="btn btn-primary"
					onclick={() => {
						showRarityWarning = false;
					}}
				>
					I Understand
				</button>
				<button
					type="button"
					class="btn"
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
