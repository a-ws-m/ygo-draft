<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	import { createDraft } from '$lib/utils/supabaseDraftManager';

	const dispatch = createEventDispatcher();

	// Use $state for reactive variables in Svelte 5
	let draftMethod = $state('winston');
	let poolSize = $state(120);
	let numberOfPlayers = $state(2);
	let numberOfPiles = $state(3);
	let packsPerRound = $state(1);
	let packSize = $state(15);
	let extraDeckAtEnd = $state(true); // New state for extra deck option
	let cubeFile = $state(null);
	let isCubeValid = $state(false);
	let isProcessing = $state(false);
	let errorMessage = $state('');
	let optionErrorMessage = $state('');
	let totalCards = $state(0);
	let cube = $state([]);

	// Constants for limits
	const MAX_POOL_SIZE = 1000;
	const MAX_PLAYERS = 10;
	const DAILY_DRAFT_LIMIT = 100; // Not used directly in UI but useful for reference

	function handleFileUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		cubeFile = target.files?.[0] || null;
		if (cubeFile) {
			isProcessing = true;
			errorMessage = '';
			import('$lib/utils/cubeProcessor').then(({ processCubeFile }) => {
				processCubeFile(cubeFile)
					.then((uploadedCube) => {
						console.log('Cube file processed successfully.');
						isCubeValid = true;
						cube = uploadedCube;
						totalCards = cube.reduce((sum, card) => sum + card.quantity, 0);
						dispatch('cubeUploaded', { cube });
						validateOptions();
					})
					.catch((error) => {
						console.error('Error processing cube file:', error);
						isCubeValid = false;
						errorMessage = error.message;
					})
					.finally(() => {
						isProcessing = false;
					});
			});
		} else {
			isCubeValid = false;
			errorMessage = 'No file uploaded. Please select a valid cube file.';
		}
	}

	function validateOptions() {
		optionErrorMessage = '';

		// First check database limits
		if (poolSize > MAX_POOL_SIZE) {
			optionErrorMessage = `Pool size cannot exceed ${MAX_POOL_SIZE} cards.`;
			return;
		}

		if (numberOfPlayers > MAX_PLAYERS) {
			optionErrorMessage = `Number of players cannot exceed ${MAX_PLAYERS}.`;
			return;
		}

		// Then check other validations
		if (poolSize > totalCards) {
			optionErrorMessage = 'Pool size cannot exceed the total number of cards in the cube.';
		} else if (draftMethod === 'rochester') {
			if (packSize < numberOfPlayers) {
				optionErrorMessage = 'Pack size must be at least equal to the number of players.';
			} else if (poolSize < packSize * packsPerRound) {
				optionErrorMessage =
					'Pool size must be at least equal to pack size times the number of packs.';
			}
		} else if (draftMethod === 'winston') {
			if (poolSize < numberOfPiles) {
				optionErrorMessage = 'Pool size must be at least equal to the number of piles.';
			}
		}
	}

	async function startDraft() {
		if (!isCubeValid || optionErrorMessage) return;

		isProcessing = true;

		try {
			// Ensure all necessary data is included in the draft creation
			const draftId = await createDraft(
				draftMethod,
				poolSize,
				numberOfPlayers,
				cube.map((card) => ({
					id: card.id, // Add the id field which is required for card_id
					name: card.name,
					quantity: card.quantity,
					type: card.type,
					apiData: card.apiData,
					imageUrl: card.imageUrl,
					smallImageUrl: card.smallImageUrl
				})),
				draftMethod === 'winston' ? numberOfPiles : 3,
				draftMethod === 'rochester' ? packSize : 5,
				extraDeckAtEnd // Pass the extra deck option to createDraft
			);

			// Store draft settings in sessionStorage for additional backup
			sessionStorage.setItem(
				'draftSettings',
				JSON.stringify({
					draftMethod,
					poolSize,
					numberOfPlayers,
					numberOfPiles: draftMethod === 'winston' ? numberOfPiles : undefined,
					packsPerRound: draftMethod === 'rochester' ? packsPerRound : undefined,
					packSize: draftMethod === 'rochester' ? packSize : undefined,
					extraDeckAtEnd // Include in saved settings
				})
			);

			// Navigate to the draft page
			goto(`/draft?id=${draftId}`);
		} catch (error) {
			console.error('Error starting draft:', error);
			errorMessage = 'Failed to start draft. Please try again.';
		} finally {
			isProcessing = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Cube File Upload -->
	<div>
		<label for="cube-file" class="mb-1 block text-sm font-medium text-gray-700">
			Upload Cube File (.csv)
		</label>
		<div class="relative">
			<input
				type="file"
				id="cube-file"
				accept=".csv"
				onchange={handleFileUpload}
				class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border file:border-gray-300 file:bg-gray-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-100"
				disabled={isProcessing}
			/>
			{#if isProcessing}
				<!-- Spinner -->
				<div class="bg-opacity-75 absolute inset-0 flex items-center justify-center bg-white">
					<svg
						class="h-6 w-6 animate-spin text-indigo-600"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
				</div>
			{/if}
		</div>
		{#if errorMessage}
			<!-- Error Message -->
			<p class="mt-2 text-sm text-red-600">{errorMessage}</p>
		{/if}
	</div>

	<!-- Draft Method Selection -->
	<div>
		<label for="draft-method" class="mb-1 block text-sm font-medium text-gray-700">
			Draft Method
		</label>
		<select
			id="draft-method"
			bind:value={draftMethod}
			onchange={validateOptions}
			class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
		>
			<option value="winston">Winston Draft</option>
			<option value="rochester">Rochester Draft</option>
		</select>
	</div>

	<!-- Pool Size -->
	<div>
		<label for="pool-size" class="mb-1 block text-sm font-medium text-gray-700"> 
			Pool Size <span class="text-xs text-gray-500">(max: {MAX_POOL_SIZE})</span>
		</label>
		<input
			type="number"
			id="pool-size"
			bind:value={poolSize}
			min="1"
			max={MAX_POOL_SIZE}
			oninput={validateOptions}
			class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
		/>
	</div>

	<!-- Number of Players -->
	<div>
		<label for="number-of-players" class="mb-1 block text-sm font-medium text-gray-700">
			Number of Players <span class="text-xs text-gray-500">(max: {MAX_PLAYERS})</span>
		</label>
		<input
			type="number"
			id="number-of-players"
			bind:value={numberOfPlayers}
			min="2"
			max={MAX_PLAYERS}
			oninput={validateOptions}
			class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
		/>
	</div>

	<!-- Rochester Draft Options -->
	{#if draftMethod === 'rochester'}
		<div>
			<label for="pack-size" class="mb-1 block text-sm font-medium text-gray-700">
				Pack Size
			</label>
			<input
				type="number"
				id="pack-size"
				bind:value={packSize}
				min="1"
				oninput={validateOptions}
				class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
			/>
		</div>
		<!-- Winston Draft Options -->
	{:else if draftMethod === 'winston'}
		<div>
			<label for="number-of-piles" class="mb-1 block text-sm font-medium text-gray-700">
				Number of Piles
			</label>
			<input
				type="number"
				id="number-of-piles"
				bind:value={numberOfPiles}
				min="1"
				oninput={validateOptions}
				class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
			/>
		</div>
	{/if}

	<!-- Extra Deck at End Option -->
	<div class="flex items-center">
		<input
			type="checkbox"
			id="extra-deck-at-end"
			bind:checked={extraDeckAtEnd}
			class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
		/>
		<label for="extra-deck-at-end" class="ml-2 block text-sm text-gray-700">
			Move extra deck cards to end of the pool
		</label>
	</div>

	<!-- Option Validation Error -->
	{#if optionErrorMessage}
		<p class="mt-2 text-sm text-red-600">{optionErrorMessage}</p>
	{/if}

	<!-- Submit Button -->
	<div>
		<button
			type="button"
			class="w-full rounded-md bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
			onclick={startDraft}
			disabled={!isCubeValid || isProcessing || optionErrorMessage}
		>
			Start Draft
		</button>
	</div>
</div>
