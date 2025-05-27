<script lang="ts">
	import feather from 'feather-icons';
	import { calculatePopupPosition } from '$lib/utils/cardPopupPositioning';
	import { onMount } from 'svelte';

	// Props
	const {
		filteredCube = [],
		clickable = false,
		onCardClick = (card: any) => {},
		onCardHover = (card: any, x: number, y: number, position: string) => {},
		onCardLeave = () => {}
	} = $props<{
		filteredCube: any[];
		clickable?: boolean;
		onCardClick?: (card: any) => void;
		onCardHover?: (card: any, x: number, y: number, position: string) => void;
		onCardLeave?: () => void;
	}>();

	// Reactive state
	let carouselIndex = $state(0);
	let touchStartY = $state(0);
	let touchStartX = $state(0);
	let isDragging = $state(false);
	let isMiddleCardHovered = $state(false);
	let lastHoverEvent = $state(null);
	let hoveredCardPositionIndex = $state(-1);
	let centerSectionElement = $state(null);

	// Get resolved image URL for a card
	function getCardImage(card, small = false) {
		return small ? card.smallImageUrl : card.imageUrl;
	}

	// Handle mouse events
	function handleMouseEnter(card, event) {
		// Use the shared positioning utility
		const popupData = calculatePopupPosition(event);

		// Emit event to parent component
		onCardHover(card, popupData.x, popupData.y, popupData.position);

		// Track hover state for carousel view
		if (visibleCenterCards.includes(card)) {
			isMiddleCardHovered = true;
			lastHoverEvent = event;
			hoveredCardPositionIndex = visibleCenterCards.indexOf(card);
		} else {
			isMiddleCardHovered = false;
		}
	}

	function handleMouseLeave() {
		onCardLeave();
		isMiddleCardHovered = false;
		lastHoverEvent = null;
	}

	function handleCardClick(card) {
		if (clickable) {
			onCardClick(card);
		}
	}

	// Carousel navigation
	function carouselNext() {
		// Calculate the max index based on visible center cards
		const maxPossibleIndex = Math.max(0, filteredCube.length - visibleCenterCards.length);
		if (carouselIndex < maxPossibleIndex) {
			carouselIndex++;
		}
	}

	function carouselPrev() {
		if (carouselIndex > 0) {
			carouselIndex--;
		}
	}

	// Handle touch events for swiping
	function handleTouchStart(event) {
		touchStartY = event.touches[0].clientY;
		touchStartX = event.touches[0].clientX;
		isDragging = true;
	}

	function handleTouchMove(event) {
		if (!isDragging) return;

		const touchY = event.touches[0].clientY;
		const touchX = event.touches[0].clientX;

		// Calculate vertical and horizontal movement
		const deltaY = touchStartY - touchY;
		const deltaX = touchStartX - touchX;

		// If horizontal movement is dominant and significant
		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
			event.preventDefault(); // Prevent default scrolling
			return;
		}

		// If vertical movement is significant, navigate carousel
		if (Math.abs(deltaY) > 30) {
			if (deltaY > 0) {
				carouselNext();
			} else {
				carouselPrev();
			}
			isDragging = false; // Reset dragging state to prevent multiple triggers
		}
	}

	function handleTouchEnd() {
		isDragging = false;
	}

	// Handle wheel events for carousel
	function handleWheel(event) {
		if (event.deltaY > 0) {
			carouselNext();
		} else {
			carouselPrev();
		}
		event.preventDefault();
	}

	// Add an effect to update hoveredCard when carouselIndex changes
	$effect(() => {
		// If we're hovering the middle card and the carousel index changes,
		// we need to update the hoveredCard
		if (isMiddleCardHovered && visibleCenterCards.length > 0 && lastHoverEvent) {
			// Update the hovered card to the card at the same position in the new visibleCenterCards array
			if (hoveredCardPositionIndex >= 0 && hoveredCardPositionIndex < visibleCenterCards.length) {
				// Update to the card that's now at the same position
				const hoveredCard = visibleCenterCards[hoveredCardPositionIndex];
				// Recalculate popup position with the last hover event
				handleMouseEnter(hoveredCard, lastHoverEvent);
			}
		}
	});

	// Calculate center cards for carousel
	const visibleCenterCards = $derived.by(() => {
		if (!centerSectionElement || filteredCube.length === 0) return [];

		const centerSectionWidth = centerSectionElement?.clientWidth || 400;
		const cardWidth = Math.min(271, centerSectionWidth - 32);
		const cardSpacing = 16;
		const cardsPerRow = Math.max(1, Math.floor(centerSectionWidth / (cardWidth + cardSpacing)));

		// Always start from the current carousel index
		const endIndex = Math.min(carouselIndex + cardsPerRow, filteredCube.length);

		return filteredCube.slice(carouselIndex, endIndex);
	});

	// Modified leftStack and rightStack calculations
	const leftStack = $derived(filteredCube.slice(0, carouselIndex).reverse());
	const rightStack = $derived(filteredCube.slice(carouselIndex + visibleCenterCards.length));

	// Calculate the last index in the center view for the counter
	const lastVisibleCardIndex = $derived(carouselIndex + visibleCenterCards.length - 1);
</script>

<div
	class="flex h-full items-center justify-center"
	onwheel={handleWheel}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
>
	<div class="flex w-full items-center justify-between px-4">
		<!-- Left stack (viewed cards) -->
		<div class="relative flex w-1/4 justify-center">
			{#if leftStack.length > 0}
				<div class="stack stack-start max-w-[180px]">
					{#each leftStack.slice(0, 3) as card, idx}
						<button
							type="button"
							class="card bg-base-100 cursor-pointer"
							onclick={carouselPrev}
							onkeydown={(e) => e.key === 'Enter' && carouselPrev()}
						>
							<div class="aspect-[813/1185] w-full max-w-[180px]">
								{#await getCardImage(card, true)}
									<div class="skeleton absolute inset-0"></div>
								{:then smallImageUrl}
									<img
										loading="lazy"
										src={smallImageUrl}
										alt={card.name}
										class="h-full w-full rounded object-cover shadow"
									/>
								{:catch error}
									<div class="bg-base-200 flex h-full items-center justify-center rounded">
										<span
											>{@html feather.icons['image-off'].toSvg({
												width: 24,
												height: 24
											})}</span
										>
									</div>
								{/await}
							</div>
						</button>
					{/each}
				</div>
				{#if leftStack.length > 3}
					<div class="badge badge-neutral absolute bottom-4 left-1/2 -translate-x-1/2">
						+{leftStack.length - 3} more
					</div>
				{/if}
			{:else}
				<div class="text-center opacity-30">
					<span>{@html feather.icons['chevron-up'].toSvg({ width: 32, height: 32 })}</span>
					<p class="text-sm">No previous cards</p>
				</div>
			{/if}
		</div>

		<!-- Center card (current focus) -->
		<div class="relative flex w-2/4 justify-center" bind:this={centerSectionElement}>
			{#if filteredCube.length > 0}
				<!-- Calculate card width based on container width -->
				{@const centerSectionWidth = centerSectionElement?.clientWidth || 400}
				{@const cardWidth = Math.min(271, centerSectionWidth - 32)}

				<div class="flex flex-col">
					<div class="flex justify-center gap-4">
						{#each visibleCenterCards as card, idx}
							<div class="relative flex flex-col items-center" style="width: {cardWidth}px;">
								<button
									class="card relative w-full transition-shadow hover:shadow-lg {clickable
										? 'hover:ring-primary ring-opacity-50 cursor-pointer hover:ring'
										: ''}"
									type="button"
									onmouseenter={(e) => handleMouseEnter(card, e)}
									onmouseleave={handleMouseLeave}
									onclick={() => handleCardClick(card)}
								>
									<div class="relative aspect-[813/1185] w-full">
										{#await getCardImage(card, false)}
											<div class="skeleton absolute inset-0"></div>
										{:then imageUrl}
											<img
												loading="lazy"
												src={imageUrl}
												alt={card.name}
												class="h-full w-full rounded object-cover shadow"
											/>
										{:catch error}
											<div class="bg-base-200 flex h-full items-center justify-center rounded">
												<span
													>{@html feather.icons['image-off'].toSvg({
														width: 24,
														height: 24
													})}</span
												>
											</div>
										{/await}
									</div>
								</button>
								<p class="mt-2 w-full truncate text-center font-medium">{card.name}</p>
								{#if card.quantity && card.quantity > 1}
									<p class="badge badge-neutral text-xs">x{card.quantity}</p>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Moved pagination controls below card names and quantity badges -->
					<div class="mt-6 flex w-full justify-center gap-2">
						<button
							class="btn btn-circle btn-sm"
							disabled={carouselIndex === 0}
							onclick={carouselPrev}
						>
							<span
								>{@html feather.icons['chevron-up'].toSvg({
									width: 18,
									height: 18
								})}</span
							>
						</button>
						<span class="flex items-center">
							{carouselIndex + 1}-{lastVisibleCardIndex + 1}/{filteredCube.length}
						</span>
						<button
							class="btn btn-circle btn-sm"
							disabled={rightStack.length === 0}
							onclick={carouselNext}
						>
							<span
								>{@html feather.icons['chevron-down'].toSvg({
									width: 18,
									height: 18
								})}</span
							>
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Right stack (upcoming cards) -->
		<div class="relative flex w-1/4 justify-center">
			{#if rightStack.length > 0}
				<div class="stack stack-end max-w-[180px]">
					{#each rightStack.slice(0, 3) as card, idx}
						<button
							type="button"
							class="card bg-base-100 cursor-pointer"
							onclick={carouselNext}
							onkeydown={(e) => e.key === 'Enter' && carouselNext()}
						>
							<div class="aspect-[813/1185] w-full max-w-[180px]">
								{#await getCardImage(card, true)}
									<div class="skeleton absolute inset-0"></div>
								{:then smallImageUrl}
									<img
										loading="lazy"
										src={smallImageUrl}
										alt={card.name}
										class="h-full w-full rounded object-cover shadow"
									/>
								{:catch error}
									<div class="bg-base-200 flex h-full items-center justify-center rounded">
										<span
											>{@html feather.icons['image-off'].toSvg({
												width: 24,
												height: 24
											})}</span
										>
									</div>
								{/await}
							</div>
						</button>
					{/each}
				</div>
				{#if rightStack.length > 3}
					<div class="badge badge-neutral absolute bottom-4 left-1/2 -translate-x-1/2">
						+{rightStack.length - 3} more
					</div>
				{/if}
			{:else}
				<div class="text-center opacity-30">
					<span>{@html feather.icons['chevron-down'].toSvg({ width: 32, height: 32 })}</span>
					<p class="text-sm">No more cards</p>
				</div>
			{/if}
		</div>
	</div>
</div>
