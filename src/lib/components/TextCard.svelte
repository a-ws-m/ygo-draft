<script lang="ts">
	import CardDetails from '$lib/components/CardDetails.svelte';
	import feather from 'feather-icons';

	// Props using $props rune
	const {
		card,
		showDescription = false,
		clickable = false,
		onSelect = () => {},
		imageUrl = '',
		smallImageUrl = ''
	} = $props<{
		card: {
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
		imageUrl?: string;
		smallImageUrl?: string;
	}>();

	// Map card types to colors
	const typeColors = {
		spell: 'border-success',
		monster: 'border-warning',
		trap: 'border-secondary'
	};

	// Function to determine the card type color
	const getTypeColor = (type) => {
		if (type.toLowerCase().includes('spell')) return typeColors.spell;
		if (type.toLowerCase().includes('monster')) return typeColors.monster;
		if (type.toLowerCase().includes('trap')) return typeColors.trap;
		return 'border-base-300'; // Default color
	};

	function handleSelect(event) {
		event.stopPropagation();
		onSelect();
	}

	// Derived values
	const cardTypeColor = $derived(getTypeColor(card.type));
</script>

<div
	class={`collapse-arrow collapse border-l-4 ${cardTypeColor} bg-base-100 rounded-box shadow-sm`}
	data-expanded={showDescription ? 'true' : undefined}
>
	<input type="checkbox" checked={showDescription} />
	<div class="collapse-title flex items-center justify-between px-4 py-2">
		<div class="flex items-center gap-2">
			<p class="font-medium">{card.name}</p>
			{#if card.quantity && card.quantity > 1}
				<span class="badge badge-outline">x{card.quantity}</span>
			{/if}
		</div>
		<div class="flex items-center">
			{#if clickable}
				<button
					class="btn btn-success btn-circle btn-sm"
					aria-label="Select card"
					onclick={handleSelect}
				>
					<span>{@html feather.icons.check.toSvg({ width: 16, height: 16 })}</span>
				</button>
			{/if}
		</div>
	</div>
	<div class="collapse-content pb-4">
		<div class="mt-2">
			<CardDetails {card} {imageUrl} {smallImageUrl} compact={true} />
		</div>
	</div>
</div>
