<script lang="ts">
	// Define bindable props using Svelte 5 syntax
	let {
		useRarityDistribution = $bindable(false),
		commonPerPack = $bindable(7),
		rarePerPack = $bindable(5),
		superRarePerPack = $bindable(2),
		ultraRarePerPack = $bindable(1),
		// New rate-based props
		useRarityRates = $bindable(false),
		commonRate = $bindable(45),
		rareRate = $bindable(30),
		superRareRate = $bindable(15),
		ultraRareRate = $bindable(10),
		packSize,
		extraDeckAtEnd,
		validateOptions,
		checkForCardsWithoutRarity
	} = $props();

	$effect(() => {
		if (useRarityDistribution) {
			extraDeckAtEnd = false;
			validateOptions?.();
		}
	});

	// Function to calculate total percentage
	let totalPercentage = $derived(commonRate + rareRate + superRareRate + ultraRareRate);
	let totalPerPack = $derived(commonPerPack + rarePerPack + superRarePerPack + ultraRarePerPack);
</script>

<!-- Rarity Distribution Option -->
<div class="form-control">
	<label class="label cursor-pointer">
		<input
			type="checkbox"
			id="use-rarity-distribution"
			bind:checked={useRarityDistribution}
			onchange={checkForCardsWithoutRarity}
			disabled={extraDeckAtEnd}
			class="checkbox checkbox-primary"
		/>
		<span class="label-text ml-2">Use pack rarity distribution</span>
	</label>
</div>

<!-- Rarity Distribution Settings -->
{#if useRarityDistribution}
	<fieldset class="w-full fieldset bg-base-200 border-base-300 rounded-box border p-4 space-y-2">
		<!-- Distribution Mode Tabs -->
		<div class="tabs tabs-border">
			<input
				type="radio"
				class="tab"
				value={false}
				bind:group={useRarityRates}
				onchange={validateOptions}
				name="rarity-mode"
				aria-label="Fixed Card Counts"
			/>

			<div class="tab-content">
				<!-- Fixed Card Count Mode -->
				<div>
					<label for="common-per-pack" class="text-base-content mb-1 block text-sm font-medium">
						Commons per pack
					</label>
					<input
						type="number"
						onchange={validateOptions}
						id="common-per-pack"
						bind:value={commonPerPack}
						min="0"
						class="input input-bordered w-full"
					/>
				</div>
				<div>
					<label for="rare-per-pack" class="text-base-content mb-1 block text-sm font-medium">
						Rares per pack
					</label>
					<input
						type="number"
						onchange={validateOptions}
						id="rare-per-pack"
						bind:value={rarePerPack}
						min="0"
						class="input input-bordered w-full"
					/>
				</div>
				<div>
					<label for="super-rare-per-pack" class="text-base-content mb-1 block text-sm font-medium">
						Super Rares per pack
					</label>
					<input
						type="number"
						onchange={validateOptions}
						id="super-rare-per-pack"
						bind:value={superRarePerPack}
						min="0"
						class="input input-bordered w-full"
					/>
				</div>
				<div>
					<label for="ultra-rare-per-pack" class="text-base-content mb-1 block text-sm font-medium">
						Ultra Rares per pack
					</label>
					<input
						type="number"
						onchange={validateOptions}
						id="ultra-rare-per-pack"
						bind:value={ultraRarePerPack}
						min="0"
						class="input input-bordered w-full"
					/>
				</div>
				<div class="alert alert-info p-2">
					<span>
						Total: {totalPerPack}
						(must equal pack size of {packSize})
					</span>
				</div>
			</div>

			<input
				type="radio"
				class="tab"
				value={true}
				bind:group={useRarityRates}
				onchange={validateOptions}
				name="rarity-mode"
				aria-label="Rarity Rates"
			/>
			<div class="tab-content">
				<!-- Rarity Rate Mode (Percentage-based) -->
				<div>
					<label for="common-rate" class="text-base-content mb-1 block text-sm font-medium">
						Common rate (%)
					</label>
					<input
						type="number"
						onchange={validateOptions}
						id="common-rate"
						bind:value={commonRate}
						min="0"
						max="100"
						class="input input-bordered w-full"
					/>
				</div>
				<div>
					<label for="rare-rate" class="text-base-content mb-1 block text-sm font-medium">
						Rare rate (%)
					</label>
					<input
						type="number"
						onchange={validateOptions}
						id="rare-rate"
						bind:value={rareRate}
						min="0"
						max="100"
						class="input input-bordered w-full"
					/>
				</div>
				<div>
					<label for="super-rare-rate" class="text-base-content mb-1 block text-sm font-medium">
						Super Rare rate (%)
					</label>
					<input
						type="number"
						onchange={validateOptions}
						id="super-rare-rate"
						bind:value={superRareRate}
						min="0"
						max="100"
						class="input input-bordered w-full"
					/>
				</div>
				<div>
					<label for="ultra-rare-rate" class="text-base-content mb-1 block text-sm font-medium">
						Ultra Rare rate (%)
					</label>
					<input
						type="number"
						onchange={validateOptions}
						id="ultra-rare-rate"
						bind:value={ultraRareRate}
						min="0"
						max="100"
						class="input input-bordered w-full"
					/>
				</div>
				<div class="alert {totalPercentage === 100 ? 'alert-info' : 'alert-error'} p-2">
					<span>
						Total: {totalPercentage}% (must equal 100%)
					</span>
				</div>
			</div>
		</div>
	</fieldset>
{/if}
