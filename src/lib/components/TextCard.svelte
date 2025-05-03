<script lang="ts">
	import CardDetails from '$lib/components/CardDetails.svelte';

	// Props using $props rune
	const {
		card,
		showDescription = false,
		clickable = false,
		onSelect = () => {}
	} = $props<{
		card: {
			imageUrl: string;
			name: string;
			type: string;
			apiData: {
				type: string;
				desc: string;
				atk?: number;
				def?: number;
				level?: number;
				race: string;
				attribute?: string;
				archetype?: string;
			};
			quantity?: number;
		};
		showDescription?: boolean;
		clickable?: boolean;
		onSelect?: () => void;
	}>();

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

	function handleSelect(event) {
		event.stopPropagation();
		onSelect();
	}
</script>

<div class={`rounded border-l-4 p-2 shadow-sm ${getTypeColor(card.type)}`}>
	<details open={showDescription}>
		<summary class="flex cursor-pointer items-center justify-between">
			<p class="text-sm font-medium text-gray-700">{card.name}</p>
			<div class="flex items-center">
				{#if card.quantity}
					<p class="text-xs text-gray-500">x{card.quantity}</p>
				{/if}
				{#if clickable}
					<button
						class="focus:ring-opacity-50 ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 focus:ring-2 focus:ring-green-400 focus:outline-none"
						aria-label="Select card"
						onclick={handleSelect}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
				{/if}
			</div>
		</summary>
		<div class="mt-2">
			<CardDetails {card} compact={true} />
		</div>
	</details>
</div>
