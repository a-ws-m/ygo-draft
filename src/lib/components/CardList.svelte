<script lang="ts">
	import TextCard from '$lib/components/TextCard.svelte';
	import CardDistributionChart from '$lib/components/CardDistributionChart.svelte';
	import CardDetails from '$lib/components/CardDetails.svelte';
	import { convertToYdk, downloadYdkFile } from '$lib/utils/ydkExporter';

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

	// Create variables to track popup position
	let popupX = $state(0);
	let popupY = $state(0);
	let popupPosition = $state('below'); // 'above', 'below', 'left', or 'right'

	// Modal state
	let showConfirmModal = $state(false);
	let selectedCard = $state(null);

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
	const totalCards = $derived(cube.reduce((sum, card) => sum + (card.quantity || 1), 0));

	// Handler for YDK download
	function handleYdkDownload() {
		const ydkContent = convertToYdk(cube);
		downloadYdkFile(ydkContent, 'ygo_draft_deck.ydk');
	}
</script>

<div class="relative space-y-4">
	<!-- Header with all controls aligned on same centerline -->
	<div class="flex items-center justify-between">
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

	{#if showChart}
		<!-- Card Distribution Chart with property selector moved into the chart component -->
		<CardDistributionChart {cube} />
	{/if}

	<!-- Container for cards and details -->
	<div class="relative flex h-[60vh] flex-col">
		<!-- Card Previews -->
		<div class={`flex-1 overflow-y-auto rounded shadow-sm ${border ? 'border' : ''}`}>
			{#if viewMode === 'tile'}
				<div
					class="grid auto-cols-max grid-cols-1 justify-items-center gap-4 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
					style="grid-template-columns: repeat(auto-fill, minmax(min(calc(100% / 3 - 16px), 271px), 1fr));"
				>
					{#each cube as card}
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
								<div class="aspect-[813/1185] w-full max-w-[271px]">
									<picture>
										<source
											media="(max-width: 296px)"
											srcset={card.smallImageUrl || card.imageUrl}
										/>
										<source media="(min-width: 297px)" srcset={card.imageUrl} />
										<img
											src={card.imageUrl}
											alt={card.name}
											class="h-full w-full rounded object-cover shadow"
										/>
									</picture>
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
					{#each cube as card}
						<TextCard {card} {showDescription} {clickable} onSelect={() => handleCardClick(card)} />
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
							<div class="w-40">
								<img src={selectedCard.imageUrl} alt={selectedCard.name} class="rounded shadow" />
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
