<script lang="ts">
	import feather from 'feather-icons';
	import { calculatePopupPosition } from '$lib/utils/cardPopupPositioning';
	import { onMount } from 'svelte';
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
	let swiperContainer = $state<HTMLElement | null>(null);
	let swiperInstance: Swiper | null = $state(null);
	let activeCardIndex = $state(0);

	// Initialize Swiper when component is mounted
	onMount(() => {
		if (swiperContainer && filteredCube.length > 0) {
			swiperInstance = new Swiper(swiperContainer, {
				modules: [Virtual, EffectCards, Mousewheel, Scrollbar],
				centeredSlides: true,
				effect: 'cards',
				cardsEffect: {
					slideShadows: false
				},
				grabCursor: true,
				mousewheel: {
					enabled: true
				},
				scrollbar: {
					el: '.swiper-scrollbar',
					draggable: true,
					hide: false
				},
				virtual: {
					enabled: true
				},
				on: {
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

</script>

<div class="flex h-full items-center justify-center px-4">
	<div class="flex w-full flex-col items-center overflow-visible">
		{#if filteredCube.length > 0}
			<div class="relative w-full">
				<div bind:this={swiperContainer} class="swiper h-full w-full">
					<div class="swiper-wrapper">
						{#each filteredCube as card, index}
							<div class="swiper-slide" style="width: auto;">
								<div
									class="card h-full w-auto transition-shadow hover:shadow-lg {clickable
										? 'hover:ring-primary ring-opacity-50 cursor-pointer hover:ring'
										: ''}"
									onmouseenter={(e) => handleMouseEnter(card, e)}
									onmouseleave={handleMouseLeave}
									onclick={() => handleCardClick(card)}
								>
									<div class="relative aspect-[813/1185] h-[280px]">
										<img
											src={card.imageUrl}
											alt={card.name}
											class="h-full w-auto rounded object-cover shadow"
										/>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
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

			<!-- Add scrollbar -->
			<div class="swiper-scrollbar"></div>
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
		width: 95%;
		height: 100%;
	}

	.swiper-slide {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
