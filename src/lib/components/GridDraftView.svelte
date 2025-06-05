<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { handleCardSelection } from '$lib/utils/draftManager.svelte';
	import * as draftStore from '$lib/stores/draftStore.svelte';
	import CardDetails from '$lib/components/CardDetails.svelte';
	import CardList from '$lib/components/CardList.svelte';
	import feather from 'feather-icons';
	import { store } from '$lib/stores/authStore.svelte';
	import tippy from 'tippy.js';
	import 'tippy.js/dist/tippy.css';

	// Track whether the current player's turn is active
	let isMyTurn = $derived(
		draftStore.store.participants[draftStore.store.currentPlayer] === draftStore.store.userId
	);

	// Grid-specific derived values
	let gridSize = $derived(draftStore.store.numberOfPiles); // Grid size is stored in numberOfPiles
	let grid = $derived(draftStore.store.grid || []); // 2D array of cards

	// UI state for showing cards and hover effects
	let selectedRow = $state(-1);
	let selectedCol = $state(-1);
	let selectionType = $state<'row' | 'column' | null>(null);
	let showSelectionConfirm = $state(false);
	let showConfirmationModal = $state(false); // New state for modal

	// Get flat array of selected cards based on row or column
	let selectedCards = $derived.by(() => {
		if (!grid || grid.length === 0) return [];

		if (selectionType === 'row' && selectedRow >= 0 && selectedRow < grid.length) {
			return grid[selectedRow].filter((card) => card); // Filter out null/undefined
		} else if (selectionType === 'column' && selectedCol >= 0) {
			const columnCards = grid.map((row) => row[selectedCol]).filter((card) => card); // Filter out null/undefined
			return columnCards;
		}
		return [];
	});

	// Initialize a timer to check turn state regularly
	let turnCheckInterval: number;

	// Function to create tooltips for card details
	function tooltip() {
		return (element) => {
			const tooltipInstance = tippy(element, {
				content: element.querySelector('.card-details-content')?.innerHTML,
				allowHTML: true,
				maxWidth: 500,
				interactive: false,
				arrow: false,
				trigger: 'mouseenter focus',
				hideOnClick: false,
				placement: 'auto',
				duration: [200, 0],
				animation: 'shift-away',
				theme: 'daisy'
			});
			return tooltipInstance.destroy;
		};
	}

	onMount(() => {
		// Check turn state every second
		turnCheckInterval = window.setInterval(() => {
			// This will automatically update isMyTurn through the $derived binding
		}, 1000);
	});

	onDestroy(() => {
		if (turnCheckInterval) {
			clearInterval(turnCheckInterval);
		}
	});

	// Helper function to get card image URL
	function getCardImage(card, small = false) {
		return small ? card.smallImageUrl : card.imageUrl;
	}

	function selectRow(rowIndex: number) {
		if (!isMyTurn) return;

		selectedRow = rowIndex;
		selectedCol = -1;
		selectionType = 'row';
		showConfirmationModal = true; // Show the modal instead of inline confirmation
	}

	function selectColumn(colIndex: number) {
		if (!isMyTurn) return;

		selectedCol = colIndex;
		selectedRow = -1;
		selectionType = 'column';
		showConfirmationModal = true; // Show the modal instead of inline confirmation
	}

	async function confirmSelection() {
		if (!isMyTurn || !selectionType) return;

		try {
			// Use the selection type and index to make a selection
			await handleCardSelection({
				selectionType,
				index: selectionType === 'row' ? selectedRow : selectedCol
			});

			// Reset selection state
			resetSelection();
		} catch (error) {
			console.error('Error confirming selection:', error);
		}
	}

	function cancelSelection() {
		resetSelection();
	}

	function resetSelection() {
		selectedRow = -1;
		selectedCol = -1;
		selectionType = null;
		showSelectionConfirm = false;
		showConfirmationModal = false; // Also reset the modal state
	}

	// Function to determine if a cell is highlighted (part of selected row/column)
	function isCellHighlighted(rowIndex: number, colIndex: number): boolean {
		return (
			(selectionType === 'row' && rowIndex === selectedRow) ||
			(selectionType === 'column' && colIndex === selectedCol)
		);
	}
</script>

<div class="flex flex-col gap-6 md:flex-row">
	<!-- Grid and Selection Area -->
	<div class="card bg-base-100 flex-1 shadow-xl">
		<div class="card-body">
			<h2 class="card-title flex justify-between">
				<span>Grid Draft</span>
				<div class="badge badge-lg {isMyTurn ? 'badge-success' : 'badge-info'}">
					{isMyTurn ? 'Your Turn' : 'Waiting for other player'}
				</div>
			</h2>

			{#if grid && grid.length > 0}
				<div class="w-full overflow-hidden">
					<div class="grid-container w-full">
						<!-- Column selection buttons at top -->
						<div class="column-buttons mb-2 flex w-full">
							<div class="w-12"></div>
							<!-- Spacer for alignment with grid -->
							{#each Array(gridSize).fill(0) as _, colIndex}
								<button
									class="btn btn-sm mx-1 flex-1 {selectedCol === colIndex
										? 'btn-primary'
										: 'btn-outline'}"
									disabled={!isMyTurn}
									onclick={() => selectColumn(colIndex)}
								>
									<span>{@html feather.icons['arrow-down'].toSvg({ width: 16, height: 16 })}</span>
									<span class="sr-only">Select Column {colIndex + 1}</span>
								</button>
							{/each}
						</div>

						<!-- Grid with row selection buttons -->
						<div class="w-full">
							{#each grid as row, rowIndex}
								<div class="grid-row flex w-full items-center">
									<!-- Row selection button -->
									<button
										class="btn btn-sm mr-2 {selectedRow === rowIndex
											? 'btn-primary'
											: 'btn-outline'}"
										disabled={!isMyTurn}
										onclick={() => selectRow(rowIndex)}
									>
										<span
											>{@html feather.icons['arrow-right'].toSvg({ width: 16, height: 16 })}</span
										>
										<span class="sr-only">Select Row {rowIndex + 1}</span>
									</button>

									<!-- Row cards -->
									<div class="flex w-full justify-between">
										{#each row as card, colIndex}
											<div
												class="card-cell relative m-1 transition-all duration-200 {isCellHighlighted(
													rowIndex,
													colIndex
												)
													? 'ring-primary ring-2'
													: ''}"
											>
												{#if card}
													<div
														class="aspect-[813/1185] cursor-pointer overflow-hidden rounded shadow-md transition-transform hover:scale-105"
														{@attach tooltip()}
														role="img"
														aria-label={card.name}
													>
														<picture>
															{#await getCardImage(card, true)}
																<div class="skeleton h-full w-full"></div>
															{:then smallImageUrl}
																<source media="(max-width: 296px)" srcset={smallImageUrl} />
																{#await getCardImage(card) then imageUrl}
																	<source media="(min-width: 297px)" srcset={imageUrl} />
																{/await}
																<img
																	src={smallImageUrl}
																	alt={card.name}
																	class="h-full w-full object-cover"
																	loading="lazy"
																	onerror={(e) => {
																		e.target.src =
																			'https://via.placeholder.com/400x586?text=Image+Not+Found';
																	}}
																/>
																<div class="card-details-content hidden">
																	<CardDetails {card} />
																</div>
															{:catch}
																<div
																	class="bg-base-200 flex h-full w-full items-center justify-center"
																>
																	<span>{@html feather.icons['image-off'].toSvg()}</span>
																</div>
															{/await}
														</picture>
													</div>
												{:else}
													<div
														class="bg-base-200 flex aspect-[813/1185] items-center justify-center rounded"
													>
														<span class="opacity-30">{@html feather.icons.x.toSvg()}</span>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>

				{#if !isMyTurn}
					<div class="alert alert-info mt-4">
						<span>{@html feather.icons.info.toSvg()}</span>
						<span>Waiting for other player to make their selection...</span>
					</div>
				{/if}
			{:else}
				<div class="flex h-64 items-center justify-center">
					<span class="loading loading-spinner loading-lg text-primary"></span>
					<p class="ml-3">Loading grid...</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Drafted Cards Area -->
	<div class="card bg-base-100 w-full shadow-xl md:w-1/3">
		<div class="card-body">
			<h2 class="card-title">Your Drafted Cards</h2>
			<CardList cube={draftStore.store.draftedDeck} preferredViewMode="list" showChart={true} />
		</div>
	</div>
</div>

<!-- Selection Confirmation Modal -->
{#if showConfirmationModal && selectedCards.length > 0}
	<div class="modal modal-open">
		<div class="modal-box max-w-3xl">
			<h3 class="mb-4 text-lg font-semibold">Confirm your selection</h3>

			<div class="mb-4">
				<p class="mb-3">
					You're selecting {selectionType === 'row' ? 'Row' : 'Column'}
					{selectionType === 'row' ? selectedRow + 1 : selectedCol + 1}
					({selectedCards.length} cards)
				</p>

				<!-- Use CardList to display the selected cards -->
				<div class="bg-base-200 rounded-lg p-4">
					<CardList
						cube={selectedCards}
						border={false}
						preferredViewMode="tile"
						showDescription={false}
					/>
				</div>
			</div>

			<div class="modal-action">
				<button class="btn" onclick={cancelSelection}>Cancel</button>
				<button class="btn btn-primary" onclick={confirmSelection}> Confirm Selection </button>
			</div>
		</div>

		<!-- Backdrop -->
		<div class="modal-backdrop" onclick={cancelSelection}></div>
	</div>
{/if}

<style>
	.grid-container {
		display: flex;
		flex-direction: column;
	}

	.grid-row {
		display: flex;
		margin-bottom: 0.5rem;
	}

	.card-cell {
		flex: 1;
		min-width: 0; /* Allow shrinking below min-content */
	}

	/* Responsive adjustments */
	@media (min-width: 640px) {
		.card-cell {
			min-width: 0;
		}
	}

	@media (min-width: 768px) {
		.card-cell {
			min-width: 0;
		}
	}
</style>
