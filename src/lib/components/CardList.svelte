<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { convertToYdk, downloadYdkFile } from '$lib/utils/ydkExporter';

	// Props using $props rune
	const { cube = [], border = true, startListView = true, showYdkDownload = false } = $props<{
		cube: any[];
		border?: boolean;
		startListView?: boolean;
		showYdkDownload?: boolean;
	}>();

	// Reactive state
	let isListView = $state(startListView);
	let hoveredCard = $state(null);

	// Derived values
	const viewMode = $derived(isListView ? 'list' : 'tile');
	const totalCards = $derived(cube.reduce((sum, card) => sum + (card.quantity || 1), 0));

	function handleHover(card) {
		hoveredCard = card;
	}

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
				on:click={handleYdkDownload}
				class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
			>
				Download YDK
			</button>
		{/if}
	</div>

	<!-- Container for cards and details -->
	<div class="relative flex flex-col h-[60vh]">
		<!-- Card Previews -->
		<div class={`flex-1 overflow-y-auto rounded shadow-sm ${border ? 'border' : ''}`}>
			{#if viewMode === 'tile'}
				<div class="grid grid-cols-4 gap-4 p-2">
					{#each cube as card}
						<div class="flex flex-col items-center">
							<!-- Use the Card component with small size -->
							<Card
								{card}
								size="small"
								handleMouseEnter={() => {
									handleHover(card);
								}}
								handleMouseLeave={() => {
									handleHover(null);
								}}
							/>
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
						<Card {card} variation="text" />
					{/each}
				</div>
			{/if}
		</div>

		<!-- Pop-up Details - now part of the flex layout -->
		{#if hoveredCard && viewMode === 'tile'}
			<div class="p-4 bg-white border-t border-gray-200 shadow-lg">
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
					<span class="font-medium">Description:</span>
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
		{/if}
	</div>
</div>
