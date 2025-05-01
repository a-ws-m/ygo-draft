<script lang="ts">
	// Props using $props rune
	const { card, showDescription = false, clickable = false, onSelect = () => {} } = $props<{
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

	// Reactive state
	let isExpanded = $state(showDescription);

	// Derived values
	const isMonsterCard = $derived(card.apiData.type.toLowerCase().includes('monster'));

	// Helper function to format the race for Spell/Trap cards
	function formatSpellTrapRace() {
		const type = card.apiData.type.toLowerCase();
		if (type.includes('spell')) {
			return `${card.apiData.race} Spell`;
		} else if (type.includes('trap')) {
			return `${card.apiData.race} Trap`;
		}
		return card.apiData.race; // Fallback in case it's neither
	}

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

<div
	class={`flex cursor-pointer flex-col rounded border-l-4 p-2 shadow-sm ${getTypeColor(card.type)}`}
	onclick={() => (isExpanded = !isExpanded)}
>
	<div class="flex items-center justify-between">
		<p class="text-sm font-medium text-gray-700">{card.name}</p>
		{#if card.quantity}
			<p class="text-xs text-gray-500">x{card.quantity}</p>
		{/if}
		{#if clickable}
			<button
				class="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-50"
				aria-label="Select card"
				onclick={handleSelect}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
				</svg>
			</button>
		{/if}
	</div>

	{#if isExpanded}
		<div class="mt-2 text-sm text-gray-600">
			<p>
				{card.apiData.desc}
			</p>
			{#if isMonsterCard}
				<div class="mt-2 space-y-1">
					<p>
						<span class="font-medium">ATK:</span>
						{card.apiData.atk}
					</p>
					<p>
						<span class="font-medium">DEF:</span>
						{card.apiData.def}
					</p>
					<p>
						<span class="font-medium">Level:</span>
						{card.apiData.level}
					</p>
					<p>
						<span class="font-medium">Race:</span>
						{card.apiData.race}
					</p>
					<p>
						<span class="font-medium">Attribute:</span>
						{card.apiData.attribute}
					</p>
				</div>
			{:else}
				<div class="mt-2">
					<p>{formatSpellTrapRace()}</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
