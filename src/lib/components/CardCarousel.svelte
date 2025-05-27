<script lang="ts">
	import feather from 'feather-icons';
	import { calculatePopupPosition } from '$lib/utils/cardPopupPositioning';
	import { onMount } from 'svelte';
	import { register } from 'swiper/element/bundle';
	import 'swiper/css/bundle';

	// Register Swiper custom elements
	register();

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
	let swiperElement = $state<HTMLElement | null>(null);
	let swiperInstance: any = $state(null);
	let activeCardIndex = $state(0);

	// Get resolved image URL for a card
	function getCardImage(card: any, small = false) {
		return small ? card.smallImageUrl : card.imageUrl;
	}

	// Handle mouse events
	function handleMouseEnter(card: any, event: MouseEvent) {
		// Use the shared positioning utility
		const popupData = calculatePopupPosition(event);

		// Emit event to parent component
		onCardHover(card, popupData.x, popupData.y, popupData.position);
	}

	function handleMouseLeave() {
		onCardLeave();
	}

	function handleCardClick(card: any) {
		if (clickable) {
			onCardClick(card);
		}
	}

	// Initialize Swiper
	onMount(() => {
		if (swiperElement) {
			swiperInstance = swiperElement.swiper;

			// Add event listener for slide change
			swiperElement.addEventListener('slidechange', (event: any) => {
				activeCardIndex = event.detail[0].activeIndex;
			});
		}
	});

	// Function to navigate to previous slide
	function prevSlide() {
		if (swiperInstance) {
			swiperInstance.slidePrev();
		}
	}

	// Function to navigate to next slide
	function nextSlide() {
		if (swiperInstance) {
			swiperInstance.slideNext();
		}
	}
</script>

<div class="flex h-full items-center justify-center px-4">
	<div class="flex w-full flex-col items-center">
		{#if filteredCube.length > 0}
			<div class="relative aspect-[813/1185] w-full max-w-[300px]">
				<swiper-container
					bind:this={swiperElement}
					effect="cards"
                    virtual="true"
                    mousewheel-enabled="true"
					class="h-full w-full"
				>
					{#each filteredCube as card, index}
						<swiper-slide lazy="true">
							<div
								class="card h-full w-full transition-shadow hover:shadow-lg {clickable
									? 'hover:ring-primary ring-opacity-50 cursor-pointer hover:ring'
									: ''}"
								onmouseenter={(e) => handleMouseEnter(card, e)}
								onmouseleave={handleMouseLeave}
								onclick={() => handleCardClick(card)}
							>
								<div class="relative aspect-[813/1185] h-full w-full">
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
											<span>
												{@html feather.icons['image-off'].toSvg({
													width: 24,
													height: 24
												})}
											</span>
										</div>
									{/await}
								</div>
							</div>
						</swiper-slide>
					{/each}
				</swiper-container>
			</div>

			<!-- Card details section -->
			<div class="mt-4 flex w-full flex-col items-center">
				{#if filteredCube[activeCardIndex]}
					<p class="mt-2 w-full truncate text-center font-medium">
						{filteredCube[activeCardIndex].name}
					</p>
					{#if filteredCube[activeCardIndex].quantity && filteredCube[activeCardIndex].quantity > 1}
						<p class="badge badge-neutral text-xs">x{filteredCube[activeCardIndex].quantity}</p>
					{/if}
				{/if}
			</div>

			<!-- Pagination controls -->
			<div class="mt-6 flex w-full justify-center gap-2">
				<button class="btn btn-circle btn-sm" disabled={activeCardIndex === 0} onclick={prevSlide}>
					<span>
						{@html feather.icons['chevron-left'].toSvg({
							width: 18,
							height: 18
						})}
					</span>
				</button>
				<span class="flex items-center">
					{activeCardIndex + 1}/{filteredCube.length}
				</span>
				<button
					class="btn btn-circle btn-sm"
					disabled={activeCardIndex === filteredCube.length - 1}
					onclick={nextSlide}
				>
					<span>
						{@html feather.icons['chevron-right'].toSvg({
							width: 18,
							height: 18
						})}
					</span>
				</button>
			</div>
		{:else}
			<div class="p-8 text-center opacity-50">
				<span>
					{@html feather.icons['image-off'].toSvg({
						width: 48,
						height: 48
					})}
				</span>
				<p class="mt-4">No cards available</p>
			</div>
		{/if}
	</div>
</div>

<style>
	swiper-container {
		width: 100%;
		height: 100%;
	}

	swiper-slide {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
