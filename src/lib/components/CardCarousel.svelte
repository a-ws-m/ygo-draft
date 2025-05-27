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
		onCardClick = (card: any) => {}
	} = $props<{
		filteredCube: any[];
		clickable?: boolean;
		onCardClick?: (card: any) => void;
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

	// Handle card click
	function handleCardClick(card: any) {
		if (clickable) {
			onCardClick(card);
		}
	}
</script>

<div class="flex h-full flex-col items-center justify-start px-4">
	<div class="flex w-full flex-col items-center overflow-x-hidden">
		{#if filteredCube.length > 0}
			<div class="relative w-full">
				<div bind:this={swiperContainer} class="swiper h-[300px] w-full">
					<!-- Add scrollbar -->
					<div class="swiper-scrollbar mt-4 w-full max-w-md"></div>
					<div class="swiper-wrapper">
						{#each filteredCube as card, index}
							<div class="swiper-slide" style="width: auto;">
								<div
									class="card h-full w-auto transition-shadow hover:shadow-lg {clickable
										? 'hover:ring-primary ring-opacity-50 cursor-pointer hover:ring'
										: ''}"
									onclick={() => handleCardClick(card)}
								>
									<div class="relative aspect-[813/1185] h-[280px]">
										<picture>
											<source media="(max-width: 296px)" srcset={card.smallImageUrl} />
											<source media="(min-width: 297px)" srcset={card.imageUrl} />
											<img
												src={card.smallImageUrl}
												alt={card.name}
												class="h-full w-full rounded object-cover shadow"
											/>
										</picture>
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
					<CardDetails card={filteredCube[activeCardIndex]}></CardDetails>
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
		width: 95%;
		height: 300px;
		max-width: 400px;
		margin: 0 auto;
	}

	.swiper-slide {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.swiper-scrollbar {
		height: 6px;
		border-radius: 3px;
	}
</style>
