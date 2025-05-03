<script lang="ts">
	// Props using $props rune
	const { card, compact = false } = $props<{
		card: {
			name?: string;
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
		};
		compact?: boolean;
	}>();

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
		return card.apiData.race;
	}
</script>

<div class={compact ? '' : 'w-64 rounded border border-gray-200 bg-white p-3 shadow-lg'}>
	{#if !compact && card.name}
		<h3 class="text-lg font-bold text-gray-800">{card.name}</h3>
	{/if}

	<p class="text-sm text-gray-600">
		<span class="font-medium">Type:</span>
		{card.type}
	</p>

	{#if card.apiData.archetype}
		<p class="text-sm text-gray-600">
			<span class="font-medium">Archetype:</span>
			{card.apiData.archetype}
		</p>
	{/if}

	<p class="mt-2 text-sm text-gray-600">
		{card.apiData.desc}
	</p>

	{#if isMonsterCard}
		<div class="mt-2 space-y-1">
			<p class="text-sm text-gray-600">
				<span class="font-medium">ATK:</span>
				{card.apiData.atk}
			</p>
			<p class="text-sm text-gray-600">
				<span class="font-medium">DEF:</span>
				{card.apiData.def}
			</p>
			<p class="text-sm text-gray-600">
				<span class="font-medium">Level:</span>
				{card.apiData.level}
			</p>
			<p class="text-sm text-gray-600">
				<span class="font-medium">Race:</span>
				{card.apiData.race}
			</p>
			<p class="text-sm text-gray-600">
				<span class="font-medium">Attribute:</span>
				{card.apiData.attribute}
			</p>
		</div>
	{:else}
		<div class="mt-2">
			<p class="text-sm text-gray-600">{formatSpellTrapRace()}</p>
		</div>
	{/if}
</div>
