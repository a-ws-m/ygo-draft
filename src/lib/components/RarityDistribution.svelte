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
<div class={['form-control', useRarityDistribution && 'mb-3']}>
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
	<fieldset class="fieldset bg-base-200 border-base-300 rounded-box w-full border p-4">
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

			<div class="tab-content mt-4 space-y-4">
				<!-- Fixed Card Count Mode -->
				<div>
					<label class="label" for="common-per-pack"> Commons per pack </label>
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
					<label class="label" for="rare-per-pack"> Rares per pack </label>
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
					<label class="label" for="super-rare-per-pack"> Super Rares per pack </label>
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
					<label class="label" for="ultra-rare-per-pack"> Ultra Rares per pack </label>
					<input
						type="number"
						onchange={validateOptions}
						id="ultra-rare-per-pack"
						bind:value={ultraRarePerPack}
						min="0"
						class="input input-bordered w-full"
					/>
				</div>
				<div class={['alert  p-2', totalPerPack === packSize ? 'alert-info' : 'alert-error']}>
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
			<div class="tab-content mt-4 space-y-4">
				<!-- Rarity Rate Mode (Percentage-based) -->
				<div>
					<label class="label" for="common-rate"> Common rate (%) </label>
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
					<label class="label" for="rare-rate"> Rare rate (%) </label>
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
					<label class="label" for="super-rare-rate"> Super Rare rate (%) </label>
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
					<label class="label" for="ultra-rare-rate"> Ultra Rare rate (%) </label>
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
				<div class={['alert  p-2', totalPercentage === 100 ? 'alert-info' : 'alert-error']}>
					<span>
						Total: {totalPercentage}% (must equal 100%)
					</span>
				</div>
			</div>
		</div>
	</fieldset>
{/if}
