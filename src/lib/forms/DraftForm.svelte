<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { createDraft } from '$lib/utils/supabaseDraftManager';
	import { store as authStore } from '$lib/stores/authStore.svelte';
	import LoginPrompt from '$lib/components/LoginPrompt.svelte';
	import RarityDistribution from '$lib/components/RarityDistribution.svelte';
	import feather from 'feather-icons';
	import tippy from 'tippy.js';
	import CardList from '$lib/components/CardList.svelte';

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
	let packSize = $derived(draftMethod === 'asynchronous' ? 20 : 15); // Changed default for async
	let picksPerPack = $state(5); // Changed default from 1 to 5
	let extraDeckAtEnd = $state(false); // Changed default to false
	let allowOverlap = $state(false); // New state for allowing overlap in player packs
	let useRarityDistribution = $state(false); // New state for rarity distribution option
	let commonPerPack = $derived(draftMethod == 'asynchronous' ? 10 : 7);
	let rarePerPack = $derived(draftMethod == 'asynchronous' ? 7 : 5);
	let superRarePerPack = $state(2);
	let ultraRarePerPack = $state(1);
	let cubeFile = $state(null);
	let isCubeValid = $state(false);
	let isProcessing = $state(false);
	let errorMessage = $state('');
	let optionErrorMessage = $state('');
	let totalCards = $state(0);
	let cube = $state([]);
	let isAuthenticated = $derived(!!authStore.session);
	let showRarityWarning = $state(false);
	let cardsWithoutRarity = $state([]);
	let showUnevenPoolWarning = $state(false); // New state for uneven pool warning
	let hasCustomRarities = $state(false); // Track if the cube has custom rarities
	let cardsWithoutCustomRarity = $state([]);
	let cardsMissingBothRarities = $state([]); // Track cards missing both custom and Master Duel rarities

	// New state for custom rarity rates
	let useRarityRates = $state(false);
	let commonRate = $state(45);
	let rareRate = $state(30);
	let superRareRate = $state(15);
	let ultraRareRate = $state(10);

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

	// Constants for limits
	const MAX_POOL_SIZE = 1000;
	const MAX_PLAYERS = 10;
	const MAX_GRID_SIZE = 5; // Maximum grid size
	const MIN_GRID_SIZE = 2; // Minimum grid size
	const DAILY_DRAFT_LIMIT = 100; // Not used directly in UI but useful for reference

	// Tooltip function for tippy.js
	function tooltip() {
		return (element) => {
			const tooltipInstance = tippy(element, {
				content: element.querySelector('.tooltip-content')?.innerHTML,
				allowHTML: true,
				maxWidth: 300,
				interactive: true,
				arrow: false,
				trigger: 'mouseenter focus',
				hideOnClick: false,
				placement: 'auto',
				duration: [200, 0],
				animation: 'shift-away',
				appendTo: document.body,
				theme: 'daisy'
				// popperOptions: {
				// 	strategy: 'fixed',
				// }
			});
			return tooltipInstance.destroy;
		};
	}

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

	// Derived value for async draft pool size calculation
	let asyncTotalPoolSize = $derived.by(() => {
		// Calculate total packs needed per player
		const packsPerPlayer = Math.ceil(draftedDeckSize / picksPerPack);
		// Calculate total pool size
		return packsPerPlayer * packSize * numberOfPlayers;
	});

	// Derived value for player pool size in async drafts with overlap
	let playerPoolSize = $derived(Math.floor(poolSize / numberOfPlayers));

	// Draft method descriptions
	const draftMethodDescriptions = {
		winston: `In Winston Draft, players take turns choosing from a number of piles. If you accept a pile, you take all cards in it. If you decline, add another card to the pile from the deck and move to the next one. If you decline the final pile, you take the top card of the deck.`,
		rochester: `In Rochester Draft, players pass a pack of cards in a circle, taking one card at a time, until no cards remain in the packs. Then, another pack is opened for each player, and the process continues until there are no cards left in the pool.`,
		grid: `In Grid Draft, cards are laid out in a square grid (default 3x3). On your turn, you choose to take either a row or a column of cards from the grid. The selected cards are added to your deck, and the row/column is replaced with new cards from the pool.`,
		asynchronous: `In Asynchronous Draft, each player opens "packs" with a set number of cards drawn from the cube. Players can pick a specified number of cards from each pack before moving to the next one. This draft can be completed at your own pace, with no real-time player interaction required.`
	};

	$effect(() => {
		// When we change the draft method away from asynchronous, we need to make sure number of players > 1
		if (draftMethod !== 'asynchronous' && numberOfPlayers < 2) {
			numberOfPlayers = 2;
		}
	});

	$effect(() => {
		// When we change the draft method we may need to reset some options
		if (!['rochester', 'asynchronous'].includes(draftMethod)) {
			useRarityDistribution = false; // Reset rarity distribution for these methods
		}
	});

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
		if (useRarityDistribution && ['rochester', 'asynchronous'].includes(draftMethod)) {
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

	// Modified validateOptions function to handle all draft methods and the new rarity rate option
	function validateOptions() {
		optionErrorMessage = '';
		showUnevenPoolWarning = false; // Reset the warning flag

		// First check database limits
		if (draftMethod === 'rochester' || draftMethod === 'grid' || draftMethod === 'asynchronous') {
			// For Rochester, calculate pool size from drafted deck size
			if (draftMethod === 'rochester') {
				poolSize = draftedDeckSize * numberOfPlayers;
			}
			// For Grid, calculate pool size based on rounds needed
			else if (draftMethod === 'grid') {
				poolSize = gridTotalPoolSize;
			}
			// For Asynchronous, calculate from deck size and picks per pack
			else if (draftMethod === 'asynchronous') {
				poolSize = asyncTotalPoolSize;
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
		if (!allowOverlap && poolSize > totalCards) {
			optionErrorMessage = 'Pool size cannot exceed the total number of cards in the cube.';
		} else if (draftMethod === 'asynchronous' && allowOverlap && playerPoolSize > totalCards) {
			optionErrorMessage = `With overlap enabled, each player's pool (${playerPoolSize} cards) cannot exceed the total number of cards in the cube (${totalCards} cards).`;
		}

		if (['rochester', 'asynchronous'].includes(draftMethod)) {
			if (packSize < numberOfPlayers) {
				optionErrorMessage = 'Pack size must be at least equal to the number of players.';
			} else if (poolSize < packSize * packsPerRound) {
				optionErrorMessage =
					'Pool size must be at least equal to pack size times the number of packs.';
				return;
			}

			// Validation for rarity distribution
			if (useRarityDistribution) {
				if (useRarityRates) {
					// Check if rates sum to 100%
					const rateTotal = commonRate + rareRate + superRareRate + ultraRareRate;
					if (rateTotal !== 100) {
						optionErrorMessage = `Rarity rates total (${rateTotal}%) must equal 100%.`;
						return;
					}
				} else {
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

		if (draftMethod === 'asynchronous') {
			// Asynchronous draft specific validations
			if (picksPerPack > packSize) {
				optionErrorMessage = `Picks per pack (${picksPerPack}) cannot exceed pack size (${packSize}).`;
				return;
			}

			if (picksPerPack <= 0) {
				optionErrorMessage = 'Picks per pack must be at least 1.';
				return;
			}

			if (packSize <= 0) {
				optionErrorMessage = 'Pack size must be at least 1.';
				return;
			}

			// Calculate total packs needed
			const packsPerPlayer = Math.ceil(draftedDeckSize / picksPerPack);
			const totalCardsNeeded = packsPerPlayer * packSize * numberOfPlayers;

			// Check if the cube has enough cards when overlap is not allowed
			if (!allowOverlap && totalCardsNeeded > totalCards) {
				optionErrorMessage = `Not enough cards in the cube. Need at least ${totalCardsNeeded} cards for all players to draft.`;
				return;
			}

			// When overlap is allowed, we only need to check per-player pool size
			if (allowOverlap && playerPoolSize > totalCards) {
				optionErrorMessage = `Not enough cards in the cube. With overlap enabled, each player needs ${playerPoolSize} cards.`;
				return;
			}
		}
	}

	async function startDraft() {
		if (!isCubeValid || optionErrorMessage) return;

		isProcessing = true;

		try {
			// Calculate pool size based on draft method
			if (draftMethod === 'rochester') {
				poolSize = draftedDeckSize * numberOfPlayers;
			} else if (draftMethod === 'grid') {
				poolSize = gridTotalPoolSize;
			} else if (draftMethod === 'asynchronous') {
				// Calculate how many packs each player needs to reach the drafted deck size
				const packsPerPlayer = Math.ceil(draftedDeckSize / picksPerPack);
				// Calculate pool size needed per player (not total)
				// For async drafts, each player gets their own independent pool of the same size
				poolSize = packsPerPlayer * packSize * numberOfPlayers;
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
				// Third parameter is different based on draft method
				draftMethod === 'winston'
					? numberOfPiles
					: draftMethod === 'grid'
						? gridSize
						: draftMethod === 'asynchronous'
							? picksPerPack
							: 3,
				// Fourth parameter is pack size for Rochester and Async
				draftMethod === 'rochester' || draftMethod === 'asynchronous' ? packSize : 5,
				extraDeckAtEnd,
				// Rarity distribution for Rochester and Async drafts
				(draftMethod === 'rochester' || draftMethod === 'asynchronous') && useRarityDistribution
					? {
							commonPerPack,
							rarePerPack,
							superRarePerPack,
							ultraRarePerPack,
							useRarityRates,
							commonRate,
							rareRate,
							superRareRate,
							ultraRareRate
						}
					: null,
				// Drafted deck size parameter
				draftMethod === 'grid' || draftMethod === 'rochester' || draftMethod === 'asynchronous'
					? draftedDeckSize
					: undefined,
				draftMethod === 'asynchronous' ? picksPerPack : undefined,
				// Add the new allowOverlap parameter
				draftMethod === 'asynchronous' ? allowOverlap : undefined
			);

			// Store draft settings in sessionStorage for additional backup
			sessionStorage.setItem(
				'draftSettings',
				JSON.stringify({
					draftMethod,
					poolSize,
					draftedDeckSize:
						draftMethod === 'rochester' || draftMethod === 'grid' || draftMethod === 'asynchronous'
							? draftedDeckSize
							: undefined,
					numberOfPlayers,
					numberOfPiles: draftMethod === 'winston' ? numberOfPiles : undefined,
					gridSize: draftMethod === 'grid' ? gridSize : undefined,
					packsPerRound: draftMethod === 'rochester' ? packsPerRound : undefined,
					packSize:
						draftMethod === 'rochester' || draftMethod === 'asynchronous' ? packSize : undefined,
					picksPerPack: draftMethod === 'asynchronous' ? picksPerPack : undefined,
					extraDeckAtEnd,
					useRarityDistribution,
					allowOverlap: draftMethod === 'asynchronous' ? allowOverlap : undefined,
					raritySettings: useRarityDistribution
						? {
								commonPerPack,
								rarePerPack,
								superRarePerPack,
								ultraRarePerPack,
								useRarityRates,
								commonRate,
								rareRate,
								superRareRate,
								ultraRareRate
							}
						: undefined
				})
			);

			// Navigate to the appropriate page based on draft method
			if (draftMethod === 'asynchronous') {
				goto(`${base}/async-draft?id=${draftId}`);
			} else {
				goto(`${base}/draft?id=${draftId}`);
			}
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
				<label for="cube-file" class="label"> Upload Cube File (.csv) </label>
				<div class="relative ml-2">
					<button
						type="button"
						class="btn btn-xs btn-circle btn-ghost"
						aria-label="Cube file information"
						{@attach tooltip()}
					>
						?
						<div class="tooltip-content hidden">
							<div class="card bg-base-200">
								<div class="card-body p-4">
									<div class="flex flex-col space-y-2">
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
											<strong>Custom Rarities:</strong> To add custom rarities, include a fifth column
											in your CSV with one of the following values: "Common", "Rare", "Super Rare", "Ultra
											Rare". To do this, add a comma to each row, followed by the custom rarity. You
											can also just use the acronyms ("c", "r", "sr", "ur"). Master Duel rarities are
											used if not specified.
										</p>
									</div>
								</div>
							</div>
						</div>
					</button>
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
					class="bg-opacity-75 bg-base-200 absolute inset-0 z-10 flex items-center justify-center rounded"
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
				<label for="draft-method" class="label"> Draft Method </label>
				<div class="relative ml-2">
					<button
						type="button"
						class="btn btn-xs btn-circle btn-ghost"
						aria-label="Draft method information"
						{@attach tooltip()}
					>
						?
						<div class="tooltip-content hidden">
							<div class="card bg-base-200">
								<div class="card-body p-4">
									<div class="flex flex-col space-y-2">
										<h4 class="text-base-content text-sm font-medium">Draft Methods</h4>
										<p class="text-base-content/70 text-xs">
											<strong>Rochester Draft:</strong>
											{draftMethodDescriptions.rochester}
										</p>
										<p class="text-base-content/70 text-xs">
											<strong>Winston Draft:</strong>
											{draftMethodDescriptions.winston}
										</p>
										<p class="text-base-content/70 text-xs">
											<strong>Grid Draft:</strong>
											{draftMethodDescriptions.grid}
										</p>
										<p class="text-base-content/70 text-xs">
											<strong>Asynchronous Draft:</strong>
											{draftMethodDescriptions.asynchronous}
										</p>
									</div>
								</div>
							</div>
						</div>
					</button>
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
				<option value="asynchronous">Asynchronous Draft</option>
			</select>
		</div>

		<!-- Pool Size -->
		{#if draftMethod === 'rochester' || draftMethod === 'grid' || draftMethod === 'asynchronous'}
			<div>
				<label for="drafted-deck-size" class="label">
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
				{:else}
					<p class="text-base-content/60 mt-1 text-sm">
						Pool size per player: {asyncTotalPoolSize / numberOfPlayers} cards (Total: {asyncTotalPoolSize}
						cards for all players)
					</p>
				{/if}
			</div>
		{:else}
			<div>
				<label for="pool-size" class="label">
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
			<label for="number-of-players" class="label">
				Number of Players <span class="text-base-content/60 text-xs">(max: {MAX_PLAYERS})</span>
			</label>
			<input
				type="number"
				id="number-of-players"
				bind:value={numberOfPlayers}
				min={draftMethod === 'asynchronous' ? 1 : 2}
				max={MAX_PLAYERS}
				oninput={validateOptions}
				class="input input-bordered w-full"
			/>
		</div>

		<!-- Rochester Draft Options -->
		{#if draftMethod === 'rochester'}
			<div>
				<label for="pack-size" class="label"> Pack Size </label>
				<input
					type="number"
					id="pack-size"
					bind:value={packSize}
					min="1"
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>

			<!-- Rarity Distribution Component -->
			<RarityDistribution
				bind:useRarityDistribution
				bind:commonPerPack
				bind:rarePerPack
				bind:superRarePerPack
				bind:ultraRarePerPack
				bind:useRarityRates
				bind:commonRate
				bind:rareRate
				bind:superRareRate
				bind:ultraRareRate
				{packSize}
				{extraDeckAtEnd}
				{validateOptions}
				{checkForCardsWithoutRarity}
			/>
		{:else if draftMethod === 'winston'}
			<div>
				<label for="number-of-piles" class="label"> Number of Piles </label>
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
				<label for="grid-size" class="label">
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
		{:else if draftMethod === 'asynchronous'}
			<div>
				<label for="pack-size" class="label"> Pack Size </label>
				<input
					type="number"
					id="pack-size"
					bind:value={packSize}
					min="1"
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>

			<div>
				<label for="picks-per-pack" class="label"> Picks per Pack </label>
				<input
					type="number"
					id="picks-per-pack"
					bind:value={picksPerPack}
					min="1"
					max={packSize}
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
				<p class="text-base-content/60 mt-1 text-sm">
					Each player will select {picksPerPack} cards from every pack of {packSize} cards.
				</p>
			</div>

			<!-- New option for allowing overlap in packs with tooltip -->
			<div class="form-control">
				<label class="label cursor-pointer">
					<input
						type="checkbox"
						id="allow-overlap"
						bind:checked={allowOverlap}
						onchange={validateOptions}
						class="checkbox checkbox-primary"
					/>
					<span class="label-text ml-2">Allow overlap in player packs</span>
					<div class="relative ml-2">
						<button
							type="button"
							class="btn btn-xs btn-circle btn-ghost"
							aria-label="Overlap option information"
							{@attach tooltip()}
						>
							?
							<div class="tooltip-content hidden">
								<div class="card bg-base-200">
									<div class="card-body p-4">
										<div class="flex flex-col space-y-2">
											<h4 class="text-base-content text-sm font-medium">Overlap Option</h4>
											<p class="text-base-content/70 text-xs">
												When enabled, each player gets their own independent card pool. This means
												players might see some of the same cards as other players.
											</p>
											<p class="text-base-content/70 text-xs">
												When disabled, players will only see cards from their portion of the overall
												pool, ensuring no cards are duplicated between players.
											</p>
											<p class="text-base-content/70 text-xs">
												Enable this option when your cube is smaller than the total required pool
												size or when you want players to have equal access to powerful cards.
											</p>
										</div>
									</div>
								</div>
							</div>
						</button>
					</div>
				</label>
				{#if allowOverlap}
					<p class="text-base-content/60 mt-2 ml-8 text-sm">
						Each player pool: {playerPoolSize} cards (total: {poolSize} cards for all players)
					</p>
				{/if}
			</div>

			<!-- Rarity Distribution Component -->
			<RarityDistribution
				bind:useRarityDistribution
				bind:commonPerPack
				bind:rarePerPack
				bind:superRarePerPack
				bind:ultraRarePerPack
				bind:useRarityRates
				bind:commonRate
				bind:rareRate
				bind:superRareRate
				bind:ultraRareRate
				{packSize}
				{extraDeckAtEnd}
				{validateOptions}
				{checkForCardsWithoutRarity}
			/>
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
			<div class="alert alert-error flex items-center">
				<span class="icon">
					{@html feather.icons['alert-circle'].toSvg({ width: '1.5rem', height: '1.5rem' })}
				</span>
				<span>
					{optionErrorMessage}
				</span>
			</div>
		{/if}

		<!-- Uneven Pool Warning -->
		{#if showUnevenPoolWarning && useRarityDistribution && draftMethod === 'rochester'}
			<div class="alert alert-warning flex items-center">
				<span class="icon">
					{@html feather.icons['alert-circle'].toSvg({ width: '1.5rem', height: '1.5rem' })}
				</span>
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
				<div class="alert alert-warning flex items-center">
					<span class="icon flex-none">
						{@html feather.icons['alert-circle'].toSvg({ width: '1.5rem', height: '1.5rem' })}
					</span>
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
				<div class="alert alert-success flex items-center">
					{@html feather.icons.info.toSvg({ width: '1.5rem', height: '1.5rem' })}
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
			<div class="m-6">
				<CardList cube={cardsWithoutRarity} />
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
