<script lang="ts">
	import feather from 'feather-icons';
	import { onMount } from 'svelte';
	import CardDetails from './CardDetails.svelte';
	import Swiper from 'swiper';
	import { Virtual, EffectCards, Mousewheel, Scrollbar } from 'swiper/modules';
	import 'swiper/css';
	import 'swiper/css/effect-cards';
	import 'swiper/css/scrollbar';

	// Props
	const {
		filteredCube = [],
		clickable = false,
		onCardClick = (card: any) => {},
		selectedCardIndices = []
	} = $props<{
		filteredCube: any[];
		clickable?: boolean;
		onCardClick?: (card: any) => void;
		selectedCardIndices?: number[];
	}>();

	// Reactive state
	let swiperContainer = $state<HTMLElement | null>(null);
	let swiperInstance: Swiper | null = null;
	let activeCardIndex = $state(0);

	// Function to check if a card is selected
	function isCardSelected(card, index) {
		const cardIndex = card.card_index || card.index || index;
		return selectedCardIndices.includes(cardIndex);
	}

	$effect(() => {
		selectedCardIndices; // Ensure this effect runs when selectedCardIndices changes
		if (swiperInstance && filteredCube) {
			// Update virtual slides when filteredCube changes
			swiperInstance.removeAllSlides();
			swiperInstance.appendSlide(filteredCube);
			swiperInstance.update();

			// Reset active index if it's out of bounds
			if (activeCardIndex >= filteredCube.length) {
				activeCardIndex = filteredCube.length > 0 ? 0 : -1;
				swiperInstance.slideTo(0, 0);
			}
		}
	});

	// Initialize Swiper when component is mounted
	onMount(() => {
		if (swiperContainer && filteredCube.length > 0) {
			swiperInstance = new Swiper(swiperContainer, {
				modules: [Mousewheel, Virtual, EffectCards, Scrollbar],
				centeredSlides: true,
				effect: 'cards',
				cardsEffect: {
					slideShadows: false,
					perSlideOffset: 20,
					perSlideRotate: 2
				},
				grabCursor: true,
				mousewheel: {
					enabled: true,
                    releaseOnEdges: true
				},
				scrollbar: {
					el: '.swiper-scrollbar',
					draggable: true,
					hide: false
				},
				virtual: {
					enabled: true,
					slides: filteredCube,
					addSlidesAfter: 10,
					addSlidesBefore: 10,
					renderSlide: (card, index) => {
						// Check if card is selected
						const isSelected = isCardSelected(card, index);
						
						// Create a template string to render each slide
						return `
							<div class="swiper-slide">
								<div
									class="card transition-shadow hover:shadow-lg ${
										clickable ? 'hover:ring-primary ring-opacity-50 cursor-pointer hover:ring' : ''
									} ${
										isSelected ? 'bg-primary bg-opacity-20 ring-primary ring-2 ring-opacity-70' : ''
									}"
									data-card-index="${index}"
									style="max-width: 813px; height: auto; aspect-ratio: 421/614;"
								>
									<div class="relative h-full w-full">
										${isSelected ? 
											`<div class="absolute top-2 right-2 z-10">
												<div class="badge badge-primary badge-lg">
													<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check"><polyline points="20 6 9 17 4 12"></polyline></svg>
												</div>
											</div>` : 
											''}
										<picture>
											<source media="(max-width: 296px)" srcset="${card.smallImageUrl || ''}" />
											<source media="(min-width: 297px)" srcset="${card.imageUrl || ''}" />
											<img
												src="${card.smallImageUrl || ''}"
												alt="${card.name || ''}"
												class="h-full w-full rounded object-contain shadow"
											/>
										</picture>
									</div>
								</div>
							</div>
						`;
					}
				},
				// Custom handler for card clicks
				on: {
					click: (swiper, event) => {
						if (!clickable) return;
						onCardClick(swiper.activeIndex >= 0 ? filteredCube[swiper.activeIndex] : null);
					},
					slideChange: () => {
						if (swiperInstance) {
							activeCardIndex = swiperInstance.activeIndex;
						}
					}
				}
			});
		}

		return () => {
			// Cleanup when component is destroyed
			if (swiperInstance) {
				swiperInstance.destroy();
				swiperInstance = null;
			}
		};
	});
</script>

<div class="flex h-full flex-col items-center justify-center px-4">
	<div class="carousel-container flex h-full w-full flex-col items-center overflow-x-hidden">
		{#if filteredCube.length > 0}
			<div class="relative w-full" style="height: min(70%, calc(100% - 200px));">
				<div bind:this={swiperContainer} class="swiper h-full w-full">
					<div class="swiper-wrapper pb-4">
						<!-- Slides will be rendered by Swiper Virtual -->
					</div>
				</div>
				<!-- Add scrollbar below cards but above details -->
				<div class="swiper-scrollbar"></div>
			</div>

			<!-- Card details section with auto height -->
			<div class="mt-2 w-full overflow-visible">
				{#if filteredCube[activeCardIndex]}
					<div class="card-details-wrapper">
						<CardDetails card={filteredCube[activeCardIndex]} useMaxWidth={false}></CardDetails>
					</div>
				{/if}
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
	:root {
		--swiper-scrollbar-bg-color: var(--color-neutral);
		--swiper-scrollbar-drag-bg-color: var(--color-neutral-content);
	}

	.swiper {
		max-width: 30%;
		height: auto;
		margin: 0 auto;
		padding: 5px 0;
	}

	:global(.swiper-wrapper) {
		height: 100%;
	}

	:global(.swiper-slide) {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Ensure card details container adjusts properly */
	:global(.carousel-container) {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	:global(.card-details-wrapper) {
		width: 100%;
		max-width: 800px;
		margin: 0 auto;
	}
</style>
