<script lang="ts">
	import TextCard from '$lib/components/TextCard.svelte';
	import CardDistributionChart from '$lib/components/CardDistributionChart.svelte';
	import CardDetails from '$lib/components/CardDetails.svelte';
	import { convertToYdk, downloadYdkFile } from '$lib/utils/ydkExporter';
	import { onMount } from 'svelte';
	import FuzzySearch from 'fuzzy-search';
	import feather from 'feather-icons';

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

	// Track previous filter property to detect changes
	let previousFilterProperty = $state('');

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

		// Convert Set to Array
		const arrayValues = Array.from(values);

		// Sort based on property type
		if (property === 'level') {
			// Sort levels numerically
			return arrayValues.sort((a, b) => parseInt(a) - parseInt(b));
		} else {
			// Sort other properties alphabetically
			return arrayValues.sort();
		}
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

	// Clear selected filter value only when property changes from a previous value
	$effect(() => {
		if (selectedFilterProperty !== previousFilterProperty && previousFilterProperty !== '') {
			selectedFilterValue = '';
			showFilterDropdown = false;
		}
		previousFilterProperty = selectedFilterProperty;
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

		// Estimated heights for different positions
		// Vertical positions need more space (400px) than horizontal positions (200px)
		const neededVerticalSpace = 400; // Approximate height needed for details in above/below positions
		const neededHorizontalSpace = 200; // Approximate height needed for details in left/right positions

		// Determine available positions based on space requirements
		const availablePositions = [];

		if (spaceAbove >= neededVerticalSpace)
			availablePositions.push({ direction: 'above', space: spaceAbove });
		if (spaceBelow >= neededVerticalSpace)
			availablePositions.push({ direction: 'below', space: spaceBelow });

		// For left/right positions, also check if we have enough vertical space (bottom of screen)
		// We need to ensure the card details won't extend beyond bottom of viewport
		const verticalCenterSpace = Math.min(
			spaceBelow,
			window.innerHeight - rect.top - rect.height / 2
		);

		if (spaceLeft >= 300 && verticalCenterSpace >= neededHorizontalSpace / 2) {
			availablePositions.push({ direction: 'left', space: spaceLeft });
		}
		if (spaceRight >= 300 && verticalCenterSpace >= neededHorizontalSpace / 2) {
			availablePositions.push({ direction: 'right', space: spaceRight });
		}

		// Default to 'above' if no positions have enough space
		if (availablePositions.length === 0) {
			popupPosition = 'above';
		} else {
			// Sort by available space (descending) and select the best direction
			popupPosition = availablePositions.sort((a, b) => b.space - a.space)[0].direction;
		}

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

			// Ensure it doesn't go beyond bottom of screen by adjusting Y position if needed
			const cardDetailsHeight = neededHorizontalSpace;
			const bottomOverflow = popupY + cardDetailsHeight / 2 - window.innerHeight;
			if (bottomOverflow > 0) {
				popupY = Math.max(cardDetailsHeight / 2, popupY - bottomOverflow);
			}
		} else {
			// right
			popupX = rect.right + 10;
			popupY = rect.top + rect.height / 2;

			// Ensure it doesn't go beyond bottom of screen by adjusting Y position if needed
			const cardDetailsHeight = neededHorizontalSpace;
			const bottomOverflow = popupY + cardDetailsHeight / 2 - window.innerHeight;
			if (bottomOverflow > 0) {
				popupY = Math.max(cardDetailsHeight / 2, popupY - bottomOverflow);
			}
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
			<p class="text-lg font-medium">
				Total Cards: {totalCards}
			</p>

			{#if showYdkDownload}
				<button onclick={handleYdkDownload} class="btn btn-primary btn-sm">
					<span class="mr-1">{@html feather.icons.download.toSvg({ width: 16, height: 16 })}</span>
					Download YDK
				</button>
			{/if}
		</div>

		<!-- View Mode Button Group -->
		<div class="join">
			<button
				type="button"
				class={`btn join-item ${!isListView ? 'btn-active' : ''}`}
				onclick={() => setViewMode('tile')}
			>
				<span>{@html feather.icons.grid.toSvg({ width: 18, height: 18 })}</span>
			</button>
			<button
				type="button"
				class={`btn join-item ${isListView ? 'btn-active' : ''}`}
				onclick={() => setViewMode('list')}
			>
				<span>{@html feather.icons.list.toSvg({ width: 18, height: 18 })}</span>
			</button>
		</div>
	</div>

	<!-- Search and filter bar -->
	<fieldset class="fieldset">
		<div class="flex flex-wrap items-center gap-3">
			<!-- Search input with integrated match description toggle -->
			<div class="flex flex-1 items-center gap-2">
				<label
					class="input input-bordered flex flex-1 items-center gap-2 focus-within:outline-none"
				>
					<span>{@html feather.icons.search.toSvg({ width: 18, height: 18 })}</span>
					<input
						type="text"
						bind:value={searchText}
						placeholder="Search card name or text..."
						class="grow focus:outline-none"
					/>
				</label>

				<!-- Match description toggle inline with search -->
				<div class="form-control">
					<label class="label cursor-pointer gap-2">
						<span class="label-text text-sm whitespace-nowrap">Search description</span>
						<input
							type="checkbox"
							bind:checked={matchDescription}
							class="toggle toggle-primary toggle-sm"
						/>
					</label>
				</div>
			</div>
		</div>

		<div class="mt-3 flex flex-wrap items-center gap-3">
			<div class="join">
				<!-- Filter dropdown -->
				<div class="form-control max-w-xs min-w-[200px] flex-grow">
					<select bind:value={selectedFilterProperty} class="select select-bordered w-full">
						<option value="">Filter by property</option>
						{#each filterProperties as property}
							<option value={property.value}>{property.label}</option>
						{/each}
					</select>
				</div>

				<!-- Filter value dropdown -->
				{#if selectedFilterProperty}
					<div class="form-control relative max-w-xs min-w-[200px] flex-grow">
						<div class="dropdown w-full">
							<button
								type="button"
								onclick={toggleFilterDropdown}
								class="btn btn-outline w-full justify-between"
							>
								<span class={!selectedFilterValue ? 'opacity-70' : ''}>
									{selectedFilterValue || 'Select value'}
								</span>
								<span>{@html feather.icons['chevron-down'].toSvg({ width: 16, height: 16 })}</span>
							</button>

							{#if showFilterDropdown}
								<div
									class="dropdown-content menu bg-base-200 rounded-box z-10 max-h-60 w-full overflow-y-auto shadow-lg"
								>
									{#each availableFilterValues as value}
										<li>
											<button
												type="button"
												onclick={() => applyFilterValue(value)}
												class="w-full text-left"
											>
												{value}
											</button>
										</li>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Clear filters button -->
			{#if hasFilters}
				<button type="button" onclick={clearFilters} class="btn btn-ghost">
					<span>{@html feather.icons.x.toSvg({ width: 16, height: 16 })}</span>
					Clear filters
				</button>
			{/if}
		</div>
	</fieldset>

	{#if showChart}
		<!-- Card Distribution Chart with property selector moved into the chart component -->
		<CardDistributionChart cube={filteredCube} on:chartClick={handleChartClick} />
	{/if}

	<!-- Container for cards and details -->
	<div class="relative flex h-[60vh] flex-col">
		<!-- Card Previews -->
		<div class={`flex-1 overflow-y-auto ${border ? 'card card-bordered card-compact' : ''}`}>
			{#if filteredCube.length === 0}
				<div class="flex h-full items-center justify-center p-8 text-center">
						<div class="flex flex-col items-center">
						<span class="text-opacity-40 flex justify-center">
							{@html feather.icons.frown.toSvg({ width: 48, height: 48 })}
						</span>
						<p class="mt-4 text-lg font-medium">No cards match your filters</p>
						<p class="mt-2 opacity-75">Try adjusting your search or filter criteria</p>
						<button type="button" onclick={clearFilters} class="btn btn-primary mt-4">
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
								class="card relative w-full transition-shadow hover:shadow-lg {clickable
									? 'hover:ring-primary ring-opacity-50 cursor-pointer hover:ring'
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
											class="bg-base-200 absolute inset-0 flex items-center justify-center rounded"
										>
											<span class="loading loading-ring loading-lg"></span>
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
											class="bg-base-200 absolute inset-0 flex items-center justify-center rounded"
										>
											<span>
												{@html feather.icons['image-off'].toSvg({ width: 24, height: 24 })}
											</span>
										</div>
									{/await}
								</div>
							</button>
							<!-- Card Name and Quantity -->
							<p class="mt-1 text-center text-sm">{card.name}</p>
							{#if card.quantity && card.quantity > 1}
								<p class="badge badge-neutral text-xs">x{card.quantity}</p>
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
			<dialog class="modal modal-open">
				<div class="modal-box">
					<h3 class="mb-4 text-xl font-medium">Confirm Selection</h3>
					<div class="mb-4 flex justify-center">
						<div class="relative w-40">
							{#await getCardImage(selectedCard)}
								<div class="bg-base-200 flex aspect-[813/1185] items-center justify-center rounded">
									<span class="loading loading-spinner"></span>
								</div>
							{:then imageUrl}
								<img src={imageUrl} alt={selectedCard.name} class="rounded shadow" />
							{:catch}
								<div
									class="bg-base-200 flex aspect-[813/1185] h-full items-center justify-center rounded"
								>
									<span>
										{@html feather.icons['image-off'].toSvg({ width: 24, height: 24 })}
									</span>
								</div>
							{/await}
						</div>
					</div>
					<p class="mb-4">
						Are you sure you want to select <span class="font-semibold">{selectedCard.name}</span>?
					</p>
					<div class="modal-action">
						<button class="btn" onclick={cancelCardSelection}> Cancel </button>
						<button class="btn btn-primary" onclick={confirmCardSelection}> Confirm </button>
					</div>
				</div>
				<form method="dialog" class="modal-backdrop">
					<button onclick={cancelCardSelection}>close</button>
				</form>
			</dialog>
		{/if}
	</div>
</div>
