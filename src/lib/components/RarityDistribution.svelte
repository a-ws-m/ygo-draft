<script lang="ts">
	// Define props using Svelte 5 syntax
	let {
		useRarityDistribution,
		commonPerPack,
		rarePerPack,
		superRarePerPack,
		ultraRarePerPack,
		packSize,
		extraDeckAtEnd,
		onDistributionChange,
		validateOptions,
		checkForCardsWithoutRarity
	} = $props();

	$effect(() => {
		// Validate whenever any of the rarity values change
		if (useRarityDistribution) {
			validateOptions?.();
		}
	});

	function handleUseRarityChange() {
		if (useRarityDistribution) {
			extraDeckAtEnd = false;
			checkForCardsWithoutRarity?.();
		}
		validateOptions?.();
		
		// Notify parent component about the change
		onDistributionChange?.({ useRarityDistribution });
	}
</script>

<div>
	<!-- Rarity Distribution Option -->
	<div class="form-control">
		<label class="label cursor-pointer">
			<input
				type="checkbox"
				id="use-rarity-distribution"
				bind:checked={useRarityDistribution}
				onchange={handleUseRarityChange}
				disabled={extraDeckAtEnd}
				class="checkbox checkbox-primary"
			/>
			<span class="label-text ml-2">Use pack rarity distribution</span>
		</label>
	</div>

	<!-- Rarity Distribution Settings -->
	{#if useRarityDistribution}
		<div class="border-primary/20 bg-primary/5 ml-6 space-y-3 rounded-md border p-4">
			<div>
				<label for="common-per-pack" class="text-base-content mb-1 block text-sm font-medium">
					Commons per pack
				</label>
				<input
					type="number"
					id="common-per-pack"
					bind:value={commonPerPack}
					min="0"
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>
			<div>
				<label for="rare-per-pack" class="text-base-content mb-1 block text-sm font-medium">
					Rares per pack
				</label>
				<input
					type="number"
					id="rare-per-pack"
					bind:value={rarePerPack}
					min="0"
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>
			<div>
				<label
					for="super-rare-per-pack"
					class="text-base-content mb-1 block text-sm font-medium"
				>
					Super Rares per pack
				</label>
				<input
					type="number"
					id="super-rare-per-pack"
					bind:value={superRarePerPack}
					min="0"
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>
			<div>
				<label
					for="ultra-rare-per-pack"
					class="text-base-content mb-1 block text-sm font-medium"
				>
					Ultra Rares per pack
				</label>
				<input
					type="number"
					id="ultra-rare-per-pack"
					bind:value={ultraRarePerPack}
					min="0"
					oninput={validateOptions}
					class="input input-bordered w-full"
				/>
			</div>
			<div class="alert alert-info p-2">
				<span>
					Total: {commonPerPack + rarePerPack + superRarePerPack + ultraRarePerPack}
					(must equal pack size of {packSize})
				</span>
			</div>
		</div>
	{/if}
</div>
