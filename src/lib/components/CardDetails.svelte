<script lang="ts">
	import feather from 'feather-icons';

	// Props using $props rune
	const { card, compact = false } = $props<{
		card: {
			name?: string;
			type: string;
			custom_rarity?: string;
			apiData: {
				type: string;
				desc: string;
				atk?: number;
				def?: number;
				level?: number;
				race: string;
				attribute?: string;
				archetype?: string;
				rarity?: string;
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

	// Helper function to get the color class for the rarity
	function getRarityColorClass(rarity: string | null) {
		if (!rarity) return '';

		const lowerRarity = rarity.toLowerCase();
		if (lowerRarity.includes('common')) return 'badge-ghost';
		if (
			lowerRarity.includes('rare') &&
			!lowerRarity.includes('super') &&
			!lowerRarity.includes('ultra')
		)
			return 'badge-primary';
		if (lowerRarity.includes('super')) return 'badge-warning';
		if (lowerRarity.includes('ultra')) return 'badge-secondary';

		return 'badge-ghost'; // Default
	}

	// Check for custom rarity first, then fall back to API rarity
	const displayRarity = $derived(card.custom_rarity || card.apiData.rarity);
	const raritySource = $derived(card.custom_rarity ? 'Custom Rarity' : 'Master Duel Rarity');
	const rarityColorClass = $derived(getRarityColorClass(displayRarity));

	// Get icons for properties
	const monsterIcon = feather.icons.zap.toSvg({ width: 16, height: 16 });
	const typeIcon = feather.icons.tag.toSvg({ width: 16, height: 16 });
	const archetypeIcon = feather.icons.package.toSvg({ width: 16, height: 16 });
	const atkIcon = feather.icons.crosshair.toSvg({ width: 16, height: 16 });
	const defIcon = feather.icons.shield.toSvg({ width: 16, height: 16 });
	const levelIcon = feather.icons.star.toSvg({ width: 16, height: 16 });
	const raceIcon = feather.icons.users.toSvg({ width: 16, height: 16, class: 'ml-0.5' });
	const attributeIcon = feather.icons.droplet.toSvg({ width: 16, height: 16 });
</script>

<div class={compact ? 'p-2' : 'card bg-base-100 shadow-md'}>
	<div class={compact ? '' : 'card-body p-4'}>
		{#if !compact && card.name}
			<div class="flex w-full items-center justify-between">
				<h3 class="card-title break-words">{card.name}</h3>
			</div>
		{/if}

		<div class={`flex w-full flex-col space-y-2 ${!compact ? 'max-w-xl' : ''}`}>
			<div class="flex w-full flex-wrap items-stretch justify-between">
				<div class="flex flex-col justify-between space-y-2">
					<div class="flex items-center gap-2">
						<span class="text-opacity-70" title={isMonsterCard ? 'Type' : 'Card Type'}>
							{@html typeIcon}
						</span>
						<span class="badge badge-sm"
							>{isMonsterCard ? card.type : `${formatSpellTrapRace()}`}</span
						>
					</div>

					{#if card.apiData.archetype}
						<div class="flex items-center gap-2">
							<span class="text-opacity-70" title="Archetype">
								{@html archetypeIcon}
							</span>
							<span class="badge badge-sm badge-outline">{card.apiData.archetype}</span>
						</div>
					{:else}
						<div class="h-6"></div>
						<!-- Spacer when no archetype -->
					{/if}

					{#if displayRarity}
						<div class="flex items-center gap-2">
							<span class="text-xs opacity-70">{raritySource}:</span>
							<span class={`badge badge-sm ${rarityColorClass}`}>{displayRarity}</span>
						</div>
					{:else}
						<div class="h-6"></div>
						<!-- Spacer when no rarity -->
					{/if}
				</div>

				{#if isMonsterCard}
					<div class="ml-auto flex flex-col items-end justify-start gap-1 text-xs">
						<!-- ATK/DEF stats with join component -->
						<div class="join join-vertical lg:join-horizontal gap-1">
							<span class="join-item flex items-center gap-1">
								{@html atkIcon}
								<span class="font-semibold">{card.apiData.atk}</span> ATK
							</span>
							<span class="join-item flex items-center gap-1">
								{@html defIcon}
								<span class="font-semibold">{card.apiData.def}</span> DEF
							</span>
						</div>
						<!-- Level, Attribute and Race with join component -->
						<div class="join join-vertical lg:join-horizontal mt-1 gap-1">
							<span class="join-item flex items-center gap-1">
								{@html levelIcon}
								LVL <span class="font-semibold">{card.apiData.level}</span>
							</span>
							<span class="join-item flex items-center gap-1">
								{@html attributeIcon}
								<span class="font-semibold">{card.apiData.attribute}</span>
							</span>
							<span class="join-item flex items-center gap-1">
								{@html raceIcon}
								<span class="font-semibold">{card.apiData.race}</span>
							</span>
						</div>
					</div>
				{/if}
			</div>

			<div class="divider my-1"></div>

			<div class="prose prose-sm max-w-none">
				<p class="text-sm">{card.apiData.desc}</p>
			</div>
		</div>
	</div>
</div>
