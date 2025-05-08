<script lang="ts">
	import TextCard from '$lib/components/TextCard.svelte';
	import CardDistributionChart from '$lib/components/CardDistributionChart.svelte';
	import CardDetails from '$lib/components/CardDetails.svelte';
	import { convertToYdk, downloadYdkFile } from '$lib/utils/ydkExporter';
	import { onMount } from 'svelte';
	import FuzzySearch from 'fuzzy-search';

	// Props using $props rune
	const {
		cube = [],
		border = true,
		startListView = true,
		showYdkDownload = false,
		showDescription = false,
		showChart = false,
		clickable = false,
		onCardClick = undefined
	} = $props<{
		cube: any[];
		border?: boolean;
		startListView?: boolean;
		showYdkDownload?: boolean;
		showDescription?: boolean;
		showChart?: boolean;
		clickable?: boolean;
		onCardClick?: (index: number) => void;
	}>();

	// Reactive state
	let isListView = $state(startListView);
	let hoveredCard = $state(null);
	let matchDescription = $state(true); // New state for controlling description search

	// Create variables to track popup position
	let popupX = $state(0);
	let popupY = $state(0);
	let popupPosition = $state('below'); // 'above', 'below', 'left', or 'right'

	// Modal state
	let showConfirmModal = $state(false);
	let selectedCard = $state(null);

	// Filter and search state
	let searchText = $state('');
	let selectedFilterProperty = $state('');
	let selectedFilterValue = $state('');
	let showFilterDropdown = $state(false);

	// Create a fuzzy searcher instance
	let searcher = $state(null);

	onMount(() => {
		// Initialize the fuzzy searcher with the cube data
		searcher = new FuzzySearch(cube, matchDescription ? ['name', 'apiData.desc'] : ['name'], {
			caseSensitive: false,
			sort: true
		});
	});

	// Get all unique values for a given property in the cube
	function getUniquePropertyValues(property) {
		if (!property) return [];

		const values = new Set();
		cube.forEach((card) => {
			const value =
				property === 'archetype'
					? card.apiData?.[property] || 'Non-Archetype'
					: card.apiData?.[property];

			if (value) values.add(value);
		});
		return Array.from(values).sort();
	}

	// Filter property options
	const filterProperties = [
		{ value: 'type', label: 'Card Type' },
		{ value: 'attribute', label: 'Attribute' },
		{ value: 'race', label: 'Race/Type' },
		{ value: 'level', label: 'Level/Rank' },
		{ value: 'archetype', label: 'Archetype' },
		{ value: 'rarity', label: 'Rarity' }
	];

	// Available filter values based on selected property
	const availableFilterValues = $derived(getUniquePropertyValues(selectedFilterProperty));

	// Filter cards based on search and filters
	function filterCards(cards) {
		let filteredResults = cards;

		// Apply fuzzy search if search text is present
		if (searchText) {
			filteredResults = searcher ? searcher.search(searchText) : filteredResults;
		}

		// Apply property filter
		if (selectedFilterProperty && selectedFilterValue) {
			filteredResults = filteredResults.filter((card) => {
				const cardValue =
					selectedFilterProperty === 'archetype'
						? card.apiData?.[selectedFilterProperty] || 'Non-Archetype'
						: card.apiData?.[selectedFilterProperty];
				return cardValue === selectedFilterValue;
			});
		}

		return filteredResults;
	}

	// Update the fuzzy searcher when cube or matchDescription changes
	$effect(() => {
		if (cube.length > 0) {
			searcher = new FuzzySearch(cube, matchDescription ? ['name', 'apiData.desc'] : ['name'], {
				caseSensitive: false,
				sort: true
			});
		}
	});

	// Handle chart segment click
	function handleChartClick(event) {
		const { property, value } = event.detail;

		// Don't apply filter if "Other" is clicked
		if (value === 'Other') {
			// Show a message or toast notification here if desired
			// Alternatively, you could implement a special filter that shows
			// all items NOT in the main categories
			return;
		}

		selectedFilterProperty = property;
		selectedFilterValue = value;
		showFilterDropdown = false;
	}

	// Clear all filters
	function clearFilters() {
		searchText = '';
		selectedFilterProperty = '';
		selectedFilterValue = '';
	}

	// Toggle filter dropdown
	function toggleFilterDropdown() {
		showFilterDropdown = !showFilterDropdown;
	}

	// Apply filter value
	function applyFilterValue(value) {
		selectedFilterValue = value;
		showFilterDropdown = false;
	}

	// Get resolved image URL for a card
	function getCardImage(card, small = false) {
		return small ? card.smallImageUrl : card.imageUrl;
	}

	// Handle mouse events
	function handleMouseEnter(card, event) {
		hoveredCard = card;
		const rect = event.target.getBoundingClientRect();

		// Calculate available space in all directions
		const spaceAbove = rect.top;
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceLeft = rect.left;
		const spaceRight = window.innerWidth - rect.right;

		// Find the direction with most space
		const spaces = [
			{ direction: 'above', space: spaceAbove },
			{ direction: 'below', space: spaceBelow },
			{ direction: 'left', space: spaceLeft },
			{ direction: 'right', space: spaceRight }
		];

		// Sort by available space (descending) and select the best direction
		const bestDirection = spaces.sort((a, b) => b.space - a.space)[0].direction;
		popupPosition = bestDirection;

		// Position based on selected direction
		if (popupPosition === 'above') {
			popupX = rect.left + rect.width / 2;
			popupY = rect.top - 10;
		} else if (popupPosition === 'below') {
			popupX = rect.left + rect.width / 2;
			popupY = rect.bottom + 10;
		} else if (popupPosition === 'left') {
			popupX = rect.left - 10;
			popupY = rect.top + rect.height / 2;
		} else {
			// right
			popupX = rect.right + 10;
			popupY = rect.top + rect.height / 2;
		}
	}

	function handleMouseLeave() {
		hoveredCard = null;
	}

	function handleCardClick(card) {
		if (clickable) {
			selectedCard = card;
			showConfirmModal = true;
		}
	}

	function confirmCardSelection() {
		if (onCardClick && selectedCard) {
			onCardClick(selectedCard.index);
		}
		showConfirmModal = false;
	}

	function cancelCardSelection() {
		showConfirmModal = false;
	}

	// Set view mode
	function setViewMode(mode: 'list' | 'tile') {
		isListView = mode === 'list';
	}

	// Derived values
	const viewMode = $derived(isListView ? 'list' : 'tile');
	const filteredCube = $derived(filterCards(cube));
	const totalCards = $derived(filteredCube.reduce((sum, card) => sum + (card.quantity || 1), 0));
	const hasFilters = $derived(!!searchText || !!selectedFilterValue);

	// Handler for YDK download
	function handleYdkDownload() {
		const ydkContent = convertToYdk(cube);
		downloadYdkFile(ydkContent, 'ygo_draft_deck.ydk');
	}
</script>

<div class="relative space-y-4">
	<!-- Header with all controls aligned on same centerline -->
	<div class="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
		<div class="flex items-center space-x-4">
			<p class="text-lg font-medium text-gray-700">
				Total Cards: {totalCards}
			</p>

			{#if showYdkDownload}
				<button
					onclick={handleYdkDownload}
					class="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-300 focus:outline-none"
				>
					Download YDK
				</button>
			{/if}
		</div>

		<!-- View Mode Button Group -->
		<div class="inline-flex rounded-md shadow-sm" role="group">
			<button
				type="button"
				class={`rounded-l-lg px-4 py-2 text-sm font-medium ${!isListView ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'} border border-gray-200`}
				onclick={() => setViewMode('tile')}
			>
				Tile
			</button>
			<button
				type="button"
				class={`rounded-r-lg px-4 py-2 text-sm font-medium ${isListView ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'} border border-gray-200`}
				onclick={() => setViewMode('list')}
			>
				List
			</button>
		</div>
	</div>

	<!-- Search and filter bar -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- Search input -->
		<div class="relative max-w-md flex-grow">
			<input
				type="text"
				bind:value={searchText}
				placeholder="Search card name or text..."
				class="w-full rounded border border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:outline-none"
			/>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
		</div>

		<!-- Match description toggle -->
		<div class="flex items-center space-x-2">
			<label class="inline-flex cursor-pointer items-center">
				<span class="mr-2 text-sm text-gray-700">Match description</span>
				<div class="relative">
					<input type="checkbox" bind:checked={matchDescription} class="peer sr-only" />
					<div
						class="peer h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-blue-600 peer-focus:ring-2 peer-focus:ring-blue-300 peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-gray-700"
					></div>
				</div>
			</label>
		</div>

		<!-- Filter dropdown -->
		<div class="max-w-xs min-w-[200px] flex-grow">
			<select
				bind:value={selectedFilterProperty}
				class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none {!selectedFilterProperty
					? 'text-gray-500'
					: ''}"
			>
				<option value="">Filter by property</option>
				{#each filterProperties as property}
					<option value={property.value}>{property.label}</option>
				{/each}
			</select>
		</div>

		<!-- Filter value dropdown -->
		{#if selectedFilterProperty}
			<div class="relative max-w-xs min-w-[200px] flex-grow">
				<button
					type="button"
					onclick={toggleFilterDropdown}
					class="flex w-full items-center justify-between rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
				>
					<span class={!selectedFilterValue ? 'text-gray-500' : ''}>
						{selectedFilterValue || 'Select value'}
					</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 text-gray-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</button>

				{#if showFilterDropdown}
					<div
						class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg"
					>
						{#each availableFilterValues as value}
							<button
								type="button"
								onclick={() => applyFilterValue(value)}
								class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
							>
								{value}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Clear filters button -->
		{#if hasFilters}
			<button
				type="button"
				onclick={clearFilters}
				class="flex items-center space-x-1 rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 focus:outline-none"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 text-gray-600"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
				<span>Clear filters</span>
			</button>
		{/if}
	</div>

	{#if showChart}
		<!-- Card Distribution Chart with property selector moved into the chart component -->
		<CardDistributionChart cube={filteredCube} on:chartClick={handleChartClick} />
	{/if}

	<!-- Container for cards and details -->
	<div class="relative flex h-[60vh] flex-col">
		<!-- Card Previews -->
		<div class={`flex-1 overflow-y-auto rounded shadow-sm ${border ? 'border' : ''}`}>
			{#if filteredCube.length === 0}
				<div class="flex h-full items-center justify-center p-8 text-center text-gray-500">
					<div>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mx-auto h-12 w-12 text-gray-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 13a9 9 0 100 18 9 9 0 000-18z"
							/>
						</svg>
						<p class="mt-4 text-lg font-medium">No cards match your filters</p>
						<p class="mt-2">Try adjusting your search or filter criteria</p>
						<button
							type="button"
							onclick={clearFilters}
							class="mt-4 inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
						>
							Clear all filters
						</button>
					</div>
				</div>
			{:else if viewMode === 'tile'}
				<div
					class="grid auto-cols-max grid-cols-1 justify-items-center gap-4 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
					style="grid-template-columns: repeat(auto-fill, minmax(min(calc(100% / 3 - 16px), 271px), 1fr));"
				>
					{#each filteredCube as card}
						<div class="flex w-full max-w-[271px] flex-col items-center">
							<button
								class="group card relative w-full {clickable
									? 'cursor-pointer hover:ring-2 hover:ring-blue-400'
									: ''}"
								type="button"
								onmouseenter={(e) => handleMouseEnter(card, e)}
								onmouseleave={handleMouseLeave}
								onclick={() => handleCardClick(card)}
								onkeydown={(e) => e.key === 'Enter' && handleCardClick(card)}
							>
								<!-- Card Image -->
								<div class="relative aspect-[813/1185] w-full max-w-[271px]">
									{#await getCardImage(card)}
										<div
											class="absolute inset-0 flex items-center justify-center rounded bg-gray-100"
										>
											<div class="flex animate-pulse space-x-2">
												<div class="h-2 w-2 rounded-full bg-gray-400"></div>
												<div class="h-2 w-2 rounded-full bg-gray-400"></div>
												<div class="h-2 w-2 rounded-full bg-gray-400"></div>
											</div>
										</div>
									{:then imageUrl}
										<picture>
											{#await getCardImage(card, true) then smallImageUrl}
												<source media="(max-width: 296px)" srcset={smallImageUrl} />
											{/await}
											<source media="(min-width: 297px)" srcset={imageUrl} />
											<img
												src={imageUrl}
												alt={card.name}
												class="h-full w-full rounded object-cover shadow"
											/>
										</picture>
									{:catch error}
										<div
											class="absolute inset-0 flex items-center justify-center rounded bg-gray-100"
										>
											<p class="text-xs text-gray-500">Image failed to load</p>
										</div>
									{/await}
								</div>
							</button>
							<!-- Card Name and Quantity -->
							<p class="mt-1 text-center text-sm text-gray-600">{card.name}</p>
							{#if card.quantity && card.quantity > 1}
								<p class="text-xs text-gray-500">x{card.quantity}</p>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="space-y-2 p-2">
					{#each filteredCube as card}
						<TextCard
							{card}
							{showDescription}
							{clickable}
							onSelect={() => handleCardClick(card)}
							imageUrl={getCardImage(card)}
							smallImageUrl={getCardImage(card, true)}
						/>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Pop-up Details -->
		{#if hoveredCard && viewMode === 'tile'}
			<div
				class="fixed z-50 transform"
				class:translate-x-[-50%]={popupPosition === 'above' || popupPosition === 'below'}
				class:translate-y-[-50%]={popupPosition === 'left' || popupPosition === 'right'}
				class:translate-y-[-100%]={popupPosition === 'above'}
				class:translate-x-[-100%]={popupPosition === 'left'}
				style="left: {popupX}px; top: {popupY}px;"
			>
				<CardDetails card={hoveredCard} />
			</div>
		{/if}

		<!-- Confirmation Modal -->
		{#if showConfirmModal && selectedCard}
			<div
				class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black"
				role="dialog"
				aria-modal="true"
			>
				<div class="relative mx-4 max-w-md rounded-lg bg-white p-6 shadow-xl sm:mx-0">
					<div class="text-center">
						<h3 class="mb-2 text-xl font-medium text-gray-900">Confirm Selection</h3>
						<div class="mb-4 flex justify-center">
							<div class="relative w-40">
								{#await getCardImage(selectedCard)}
									<div
										class="absolute inset-0 flex items-center justify-center rounded bg-gray-100"
									>
										<div class="flex animate-pulse space-x-2">
											<div class="h-2 w-2 rounded-full bg-gray-400"></div>
											<div class="h-2 w-2 rounded-full bg-gray-400"></div>
											<div class="h-2 w-2 rounded-full bg-gray-400"></div>
										</div>
									</div>
								{:then imageUrl}
									<img src={imageUrl} alt={selectedCard.name} class="rounded shadow" />
								{:catch}
									<div class="flex h-full items-center justify-center rounded bg-gray-100">
										<p class="text-xs text-gray-500">Image failed to load</p>
									</div>
								{/await}
							</div>
						</div>
						<p class="mb-4 text-gray-700">
							Are you sure you want to select <span class="font-semibold">{selectedCard.name}</span
							>?
						</p>
						<div class="flex justify-center space-x-4">
							<button
								class="rounded bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 focus:ring-2 focus:ring-gray-400 focus:outline-none"
								onclick={cancelCardSelection}
							>
								Cancel
							</button>
							<button
								class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
								onclick={confirmCardSelection}
							>
								Confirm
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
