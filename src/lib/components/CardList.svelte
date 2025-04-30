<script lang="ts">
	import TextCard from '$lib/components/TextCard.svelte';
	import { convertToYdk, downloadYdkFile } from '$lib/utils/ydkExporter';

	// Props using $props rune
	const {
		cube = [],
		border = true,
		startListView = true,
		showYdkDownload = false
	} = $props<{
		cube: any[];
		border?: boolean;
		startListView?: boolean;
		showYdkDownload?: boolean;
	}>();

	// Reactive state
	let isListView = $state(startListView);
	let hoveredCard = $state(null);

	// Create variables to track popup position
	let popupX = $state(0);
	let popupY = $state(0);
	let popupPosition = $state('below'); // 'above', 'below', 'left', or 'right'

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
		} else { // right
			popupX = rect.right + 10;
			popupY = rect.top + rect.height / 2;
		}
	}

	function handleMouseLeave() {
		hoveredCard = null;
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
	<!-- View Mode Toggle -->
	<div class="absolute top-0 right-0">
		<label class="flex cursor-pointer items-center space-x-2 text-sm text-gray-500">
			<span>List View</span>
			<input type="checkbox" bind:checked={isListView} class="peer sr-only" />
			<div
				class="peer relative h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 peer-focus:outline-none after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white rtl:peer-checked:after:-translate-x-full dark:border-gray-600 dark:bg-gray-700 dark:peer-checked:bg-blue-600 dark:peer-focus:ring-blue-800"
			></div>
		</label>
	</div>

	<!-- Total Cards and Download Button -->
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

	<!-- Container for cards and details -->
	<div class="relative flex h-[60vh] flex-col">
		<!-- Card Previews -->
		<div class={`flex-1 overflow-y-auto rounded shadow-sm ${border ? 'border' : ''}`}>
			{#if viewMode === 'tile'}
				<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
					{#each cube as card}
						<div class="flex flex-col items-center">
							<div
								class="group relative w-full"
								role="button"
								tabindex="0"
								onmouseenter={(e) => handleMouseEnter(card, e)}
								onmouseleave={handleMouseLeave}
							>
								<!-- Card Image -->
								<div class="aspect-[2/3] w-full">
									<img
										src={card.imageUrl}
										alt={card.name}
										class="rounded object-cover shadow w-full h-full"
									/>
								</div>
							</div>
							<!-- Card Name and Quantity -->
							<p class="mt-1 text-center text-sm text-gray-600">{card.name}</p>
							{#if card.quantity}
								<p class="text-xs text-gray-500">x{card.quantity}</p>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="space-y-2 p-2">
					{#each cube as card}
						<TextCard {card} />
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
				<div class="w-64 rounded border border-gray-200 bg-white p-3 shadow-lg">
					<h3 class="text-lg font-bold text-gray-800">{hoveredCard.name}</h3>
					<p class="text-sm text-gray-600">
						<span class="font-medium">Type:</span>
						{hoveredCard.type}
					</p>
					{#if hoveredCard.apiData.archetype}
						<p class="text-sm text-gray-600">
							<span class="font-medium">Archetype:</span>
							{hoveredCard.apiData.archetype}
						</p>
					{/if}
					<p class="mt-2 text-sm text-gray-600">
						{hoveredCard.apiData.desc}
					</p>
					{#if hoveredCard.apiData.type.toLowerCase().includes('monster')}
						<div class="mt-2 space-y-1">
							<p class="text-sm text-gray-600">
								<span class="font-medium">ATK:</span>
								{hoveredCard.apiData.atk}
							</p>
							<p class="text-sm text-gray-600">
								<span class="font-medium">DEF:</span>
								{hoveredCard.apiData.def}
							</p>
							<p class="text-sm text-gray-600">
								<span class="font-medium">Level:</span>
								{hoveredCard.apiData.level}
							</p>
							<p class="text-sm text-gray-600">
								<span class="font-medium">Race:</span>
								{hoveredCard.apiData.race}
							</p>
							<p class="text-sm text-gray-600">
								<span class="font-medium">Attribute:</span>
								{hoveredCard.apiData.attribute}
							</p>
						</div>
					{:else}
						<div class="mt-2">
							<p class="text-sm text-gray-600">{hoveredCard.apiData.race}</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
