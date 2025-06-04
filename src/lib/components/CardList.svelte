<script lang="ts">
	import TextCard from '$lib/components/TextCard.svelte';
	import CardDistributionChart from '$lib/components/CardDistributionChart.svelte';
	import CardDetails from '$lib/components/CardDetails.svelte';
	import CardCarousel from '$lib/components/CardCarousel.svelte';
	import { convertToYdk, downloadYdkFile } from '$lib/utils/ydkExporter';
	import { onMount } from 'svelte';
	import FuzzySearch from 'fuzzy-search';
	import feather from 'feather-icons';
	import { calculatePopupPosition } from '$lib/utils/cardPopupPositioning';

	// Props using $props rune
	const {
		cube = [],
		border = true,
		showYdkDownload = false,
		showDescription = false,
		showChart = false,
		clickable = false,
		onCardClick = undefined,
		preferredViewMode = 'tile',
		selectMultiple = 0,
		onSelectionConfirm = (selectedIndices: number[]) => {}
	} = $props<{
		cube: any[];
		border?: boolean;
		showYdkDownload?: boolean;
		showDescription?: boolean;
		showChart?: boolean;
		clickable?: boolean;
		onCardClick?: (index: number) => void;
		preferredViewMode?: 'list' | 'tile' | 'carousel';
		selectMultiple?: number;
		onSelectionConfirm?: (selectedIndices: number[]) => void;
	}>();

	// Reactive state
	let viewMode = $state<'list' | 'tile' | 'carousel'>(preferredViewMode); // Initialize with preferred mode
	let hoveredCard = $state(null);
	let matchDescription = $state(true);
	let selectedCardIndices = $state<number[]>([]);
	let isConfirming = $state(false);

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
		// Initialize view mode based on screen width and preferred mode
		// If preferredViewMode is 'list', always respect it regardless of screen size
		// Otherwise, use responsive behavior based on screen width
		if (preferredViewMode === 'list') {
			viewMode = 'list';
		} else {
			viewMode = window.innerWidth < 768 ? 'list' : preferredViewMode;
		}

		// Initialize the fuzzy searcher with the cube data
		searcher = new FuzzySearch(cube, matchDescription ? ['name', 'apiData.desc'] : ['name'], {
			caseSensitive: false,
			sort: true
		});

		// Add resize listener to update view mode when screen size changes
		const handleResize = () => {
			// Don't change view mode if user has manually selected carousel
			if (viewMode !== 'carousel') {
				// If preferredViewMode is 'list', always keep it as list
				// Otherwise, use responsive behavior
				if (preferredViewMode === 'list') {
					viewMode = 'list';
				} else {
					viewMode = window.innerWidth < 768 ? 'list' : preferredViewMode;
				}
			}
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
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

	// Handle mouse events for tile view
	function handleMouseEnter(card, event) {
		hoveredCard = card;

		// Use the shared positioning utility
		const popupData = calculatePopupPosition(event);
		popupPosition = popupData.position;
		popupX = popupData.x;
		popupY = popupData.y;
	}

	function handleMouseLeave() {
		hoveredCard = null;
	}

	// Handle card selection for multiselect mode
	function toggleCardSelection(card) {
		const cardIndex = card.card_index || card.index || cube.indexOf(card);

		// Check if card is already selected
		const isSelected = selectedCardIndices.includes(cardIndex);

		if (isSelected) {
			// Remove card from selection
			selectedCardIndices = selectedCardIndices.filter((index) => index !== cardIndex);
		} else {
			// Add card to selection if we haven't reached the maximum
			if (selectedCardIndices.length < selectMultiple) {
				selectedCardIndices = [...selectedCardIndices, cardIndex];
			}
		}
	}

	// Check if a card is selected
	function isCardSelected(card) {
		const cardIndex = card.card_index || card.index || cube.indexOf(card);
		return selectedCardIndices.includes(cardIndex);
	}

	// Handle card click based on selection mode
	function handleCardClick(card) {
		if (selectMultiple > 0) {
			toggleCardSelection(card);
		} else if (clickable) {
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

	// Confirm multiple selections
	async function confirmSelections() {
		if (selectedCardIndices.length > selectMultiple) {
			// Could show an error message here
			return;
		}

		isConfirming = true;
		try {
			// Call the provided callback with selected indices
			await onSelectionConfirm(selectedCardIndices);

			// Clear selection after confirming
			selectedCardIndices = [];
		} catch (error) {
			console.error('Error confirming selections:', error);
		} finally {
			isConfirming = false;
		}
	}

	// Set view mode
	function setViewMode(mode: 'list' | 'tile' | 'carousel') {
		viewMode = mode;
	}

	// Handler for YDK download
	function handleYdkDownload() {
		const ydkContent = convertToYdk(cube);
		downloadYdkFile(ydkContent, 'ygo_draft_deck.ydk');
	}

	// Clear all selections
	function clearAllSelections() {
		selectedCardIndices = [];
	}

	// Derived values
	const filteredCube = $derived(filterCards(cube));
	const totalCards = $derived(filteredCube.reduce((sum, card) => sum + (card.quantity || 1), 0));
	const hasFilters = $derived(!!searchText || !!selectedFilterValue);
	// Add dynamic container height class based on view mode
	const containerHeightClass = $derived(viewMode === 'carousel' ? 'min-h-[60vh]' : 'h-[60vh]');
</script>

<div class="relative space-y-4">
	<!-- Header with all controls aligned on same centerline -->
	<div class="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
		<div class="flex items-center space-x-4">
			{#if selectMultiple > 0}
				<div class="flex items-center gap-2">
					<p class="text-lg font-medium">
						Picked: <span class="text-primary font-bold">{selectedCardIndices.length}</span> of {selectMultiple}
					</p>
					<!-- Clear selections button - only show when at least one card is selected -->
					{#if selectedCardIndices.length > 0}
						<button
							onclick={clearAllSelections}
							class="btn btn-sm btn-ghost"
							title="Clear all selections"
						>
							<span>{@html feather.icons.trash.toSvg({ width: 16, height: 16 })}</span>
							<span class="ml-1 hidden sm:inline">Clear</span>
						</button>
					{/if}
				</div>
			{:else}
				<p class="text-lg font-medium">
					Total Cards: {totalCards}
				</p>
			{/if}

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
				class={`btn join-item ${viewMode === 'tile' ? 'btn-active' : ''}`}
				onclick={() => setViewMode('tile')}
			>
				<span>{@html feather.icons.grid.toSvg({ width: 18, height: 18 })}</span>
			</button>
			<button
				type="button"
				class={`btn join-item ${viewMode === 'list' ? 'btn-active' : ''}`}
				onclick={() => setViewMode('list')}
			>
				<span>{@html feather.icons.list.toSvg({ width: 18, height: 18 })}</span>
			</button>
			<button
				type="button"
				class={`btn join-item px-2! ${viewMode === 'carousel' ? 'btn-active' : ''}`}
				onclick={() => setViewMode('carousel')}
			>
				<div class="flex items-center">
					<span class="opacity-60">{@html feather.icons.square.toSvg({ width: 8, height: 8 })}</span
					>
					<span class="mx-0.5">{@html feather.icons.square.toSvg({ width: 14, height: 14 })}</span>
					<span class="opacity-60">{@html feather.icons.square.toSvg({ width: 8, height: 8 })}</span
					>
				</div>
			</button>
		</div>
	</div>

	<!-- Selection info when in multi-select mode -->
	{#if selectMultiple > 0 && !isConfirming}
		<div class="alert alert-info">
			<div class="flex-none">
				{@html feather.icons['info'].toSvg({ class: 'h-5 w-5' })}
			</div>
			<div>
				<p>
					Select {selectMultiple} cards from this list, then confirm your selection.
				</p>
			</div>
		</div>
	{/if}

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
	<div class="relative flex {containerHeightClass} flex-col">
		<!-- Card Previews -->
		<div
			class={`flex-1 ${viewMode === 'carousel' ? 'overflow-y-visible' : 'overflow-y-auto'} ${border ? 'card card-bordered card-compact' : ''}`}
		>
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
			{:else if viewMode === 'carousel'}
				<CardCarousel
					{filteredCube}
					clickable={selectMultiple > 0 || clickable}
					{showDescription}
					onCardClick={handleCardClick}
				/>
			{:else if viewMode === 'tile'}
				<div
					class="grid auto-cols-max grid-cols-1 justify-items-center gap-4 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
					style="grid-template-columns: repeat(auto-fill, minmax(min(calc(100% / 3 - 16px), 271px), 1fr));"
				>
					{#each filteredCube as card}
						<div class="flex w-full max-w-[271px] flex-col items-center">
							<button
								class="card relative w-full transition-shadow hover:shadow-lg {clickable ||
								selectMultiple > 0
									? 'hover:ring-primary ring-opacity-50 cursor-pointer hover:ring'
									: ''} 
                                {isCardSelected(card)
									? 'bg-primary bg-opacity-20 ring-primary ring'
									: ''}
                                {selectedCardIndices.length >= selectMultiple &&
								!isCardSelected(card) &&
								selectMultiple > 0
									? 'opacity-50'
									: ''}"
								type="button"
								onmouseenter={(e) => handleMouseEnter(card, e)}
								onmouseleave={handleMouseLeave}
								onclick={() => handleCardClick(card)}
								onkeydown={(e) => e.key === 'Enter' && handleCardClick(card)}
							>
								<!-- Card Image -->
								<div class="relative aspect-[813/1185] w-full max-w-[271px]">
									{#await getCardImage(card, true)}
										<div class="skeleton absolute inset-0"></div>
									{:then smallImageUrl}
										<picture>
											<source media="(max-width: 296px)" srcset={smallImageUrl} />
											{#await getCardImage(card) then imageUrl}
												<source media="(min-width: 297px)" srcset={imageUrl} />
											{/await}
											<img
												loading="lazy"
												src={smallImageUrl}
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

								<!-- Selection indicator for multi-select mode -->
								{#if selectMultiple > 0}
									<div class="absolute top-2 right-2 z-10">
										<div class="badge badge-primary badge-lg">
											{#if isCardSelected(card)}
												<span>{@html feather.icons.check.toSvg({ width: 16, height: 16 })}</span>
											{/if}
										</div>
									</div>
								{/if}
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
							clickable={selectMultiple > 0 || clickable}
							isSelected={isCardSelected(card)}
							enableMultiSelect={selectMultiple > 0}
							disableSelect={selectedCardIndices.length >= selectMultiple && !isCardSelected(card)}
							onSelect={() => handleCardClick(card)}
							imageUrl={getCardImage(card)}
							smallImageUrl={getCardImage(card, true)}
						/>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Selection confirmation button (for multi-select mode) -->
		{#if selectMultiple > 0}
			<div class="mt-4 flex justify-end">
				<button
					class="btn btn-primary btn-lg"
					disabled={selectedCardIndices.length !== selectMultiple || isConfirming}
					onclick={confirmSelections}
				>
					{#if isConfirming}
						<span class="loading loading-spinner loading-sm"></span>
						Confirming...
					{:else}
						Confirm Selection ({selectedCardIndices.length}/{selectMultiple})
					{/if}
				</button>
			</div>
		{/if}

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
								<img loading="lazy" src={imageUrl} alt={selectedCard.name} class="rounded shadow" />
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
