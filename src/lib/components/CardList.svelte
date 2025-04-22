<script>
	import { onMount } from 'svelte'; // Import Svelte's onMount lifecycle function
	import Card from '$lib/components/Card.svelte'; // Import the Card component

	export let cube = []; // The cube data passed as a prop
	let viewMode = 'list'; // Controls the view mode: "tile" or "list"
	let isListView = true; // Checkbox state for list view

	// Update viewMode when isListView changes
	$: viewMode = isListView ? 'list' : 'tile';

	// Map card types to colors
	const typeColors = {
		spell: 'border-green-500',
		monster: 'border-yellow-400',
		trap: 'border-fuchsia-400'
	};

	// Function to determine the card type color
	const getTypeColor = (type) => {
		if (type.toLowerCase().includes('spell')) return typeColors.spell;
		if (type.toLowerCase().includes('monster')) return typeColors.monster;
		if (type.toLowerCase().includes('trap')) return typeColors.trap;
		return 'border-gray-500'; // Default color
	};
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

	<!-- Total Cards -->
	<p class="text-lg font-medium text-gray-700">
		Total Cards: {cube.reduce((sum, card) => sum + (card.quantity || 1), 0)}
	</p>

	<!-- Card Previews -->
	<div class="overflow-y-auto rounded shadow-sm overflow-x-hidden" style="max-height: 400px;">
		{#if viewMode === 'tile'}
			<div class="grid grid-cols-4 gap-4 p-2">
				{#each cube as card}
					<div class="flex flex-col items-center">
						<!-- Use the Card component with small size -->
						<Card {card} size="small" />
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
					<div
						class={`flex items-center justify-between rounded border-l-4 p-2 shadow-sm ${getTypeColor(
							card.type
						)}`}
					>
						<!-- Card Name -->
						<p class="text-sm font-medium text-gray-700">{card.name}</p>
						<!-- Card Quantity -->
						{#if card.quantity}
							<p class="text-xs text-gray-500">x{card.quantity}</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
