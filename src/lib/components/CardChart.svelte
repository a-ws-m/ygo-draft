<script lang="ts">
	import { onMount } from 'svelte';
	import feather from 'feather-icons';
	import { store as themeStore } from '$lib/stores/themeStore.svelte';
	import { Chart, ArcElement, Tooltip, Legend, DoughnutController, Colors } from 'chart.js';
	import { circIn } from 'svelte/easing';

	// Register required Chart.js components
	Chart.register(ArcElement, Tooltip, Legend, DoughnutController, Colors);

	let {
		cube = [],
		property = 'type',
		title = 'Card Distribution',
		maxSlices = 10,
		showLegend = true,
		chartProperties = [
			{ value: 'type', label: 'Card Type' },
			{ value: 'archetype', label: 'Archetype' },
			{ value: 'attribute', label: 'Attribute' },
			{ value: 'race', label: 'Race/Spell Type' },
			{ value: 'level', label: 'Level/Rank' },
			{ value: 'rarity', label: 'Rarity' }
		],
		filteredProperty = $bindable(''),
		filteredValue = $bindable('')
	} = $props<{
		cube: any[];
		property?: string;
		title?: string;
		maxSlices?: number;
		showLegend?: boolean;
		chartProperties?: Array<{ value: string; label: string }>;
		filteredProperty?: string;
		filteredValue?: string;
	}>();

	let chartCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance = $state<Chart | null>(null);
	let selectedProperty = $state(property);
	let distributionData = $state<{
		[k: string]: Promise<{ category: string; count: number }[]>;
	}>({});
	let chartData = $derived.by(() => {
		const data = distributionData[selectedProperty];
		if (!data) {
			return Promise.resolve({ labels: [], datasets: [] });
		}

		return data.then((result) => {
			return {
				labels: result.map((item) => item.category),
				datasets: [
					{
						data: result.map((item) => item.count)
					}
				]
			};
		});
	});

	function calculateAllDistributions(): {
		[k: string]: Promise<{ category: string; count: number }[]>;
	} {
		// Return property information with a promise for each distribution
		return Object.fromEntries(
			chartProperties.map((prop) => [prop.value, getDistribution(cube, prop.value)])
		);
	}

	// Process data to get distribution based on the selected property
	async function getDistribution(
		cards: any[],
		prop: string
	): Promise<{ category: string; count: number }[]> {
		const distribution: Record<string, number> = {};

		cards.forEach((card) => {
			let value;

			// Extract the property value based on the property name
			if (prop === 'type') {
				value = card.apiData?.type || card.type || null;
			} else if (prop === 'archetype') {
				value = card.apiData?.archetype || 'Non-Archetype';
			} else if (prop === 'attribute') {
				value = card.apiData?.attribute || null;
			} else if (prop === 'race') {
				value = card.apiData?.race || null;
			} else {
				value = card.apiData?.[prop] || card[prop] || null;
			}

			// Count by quantity if available
			if (value !== null) {
				const quantity = card.quantity || 1;
				distribution[value] = (distribution[value] || 0) + quantity;
			}
		});

		// Convert to array for Chart.js
		let result = Object.entries(distribution).map(([category, count]) => ({
			category,
			count: Number(count)
		}));

		// If we're filtering by level, sort by level
		if (prop === 'level') {
			result.sort((a, b) => {
				const levelA = parseInt(a.category, 10);
				const levelB = parseInt(b.category, 10);
				return levelA - levelB; // Sort by level ascending
			});
		}
		// If we're filtering by rarity, sort by rarity
		else if (prop === 'rarity') {
			const rarityOrder = {
				Common: 1,
				Uncommon: 2,
				Rare: 3,
				'Super Rare': 4,
				'Ultra Rare': 5
			};
			result.sort(
				(a, b) =>
					(rarityOrder[a.category as keyof typeof rarityOrder] || 0) -
					(rarityOrder[b.category as keyof typeof rarityOrder] || 0)
			);
		} else {
			result.sort((a, b) => b.count - a.count); // Sort by count descending
		}

		// Limit the number of slices by combining smaller categories into "Other"
		if (result.length > maxSlices) {
			const mainCategories = result.slice(0, maxSlices - 1);
			const otherCategories = result.slice(maxSlices - 1);
			const otherCount = otherCategories.reduce((sum, item) => sum + item.count, 0);

			result = [...mainCategories, { category: 'Other', count: otherCount }];
		}

		return result;
	}

	// Create chart when data changes
	async function initializeChart() {
		if (!chartCanvas) return;

		const ctx = chartCanvas.getContext('2d');
		if (!ctx) return;

		const textColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-base-content')
			.trim();

		chartInstance = new Chart(ctx, {
			type: 'doughnut',
			data: await chartData,
			options: {
				responsive: true,
				maintainAspectRatio: true,
				plugins: {
					legend: {
						display: showLegend,
						position: 'bottom',
						labels: {
							color: textColor
						},
						onClick: (event, legendItem, legend) => {
							if (legendItem && legendItem.datasetIndex !== undefined) {
								const label = legendItem.text;
								filteredValue = label;
							}
						}
					}
				},
				onClick: (event, elements) => {
					if (elements && elements.length > 0) {
						const index = elements[0].index;
						filteredValue = distributionData[index].category;
					}
				}
			}
		});
	}

	$effect(() => {
		if (chartInstance) {
			// Update visibility of chart segments based on filtered value
			let meta = chartInstance.getDatasetMeta(0);
			if (!meta) return;
			const legendItems = chartInstance.legend?.legendItems;
			if (!legendItems) return;

			// Set the hidden property for each data point
			legendItems.forEach((item, index) => {
				const labelValue = item.text;
				const isHidden = (filteredValue && filteredProperty && labelValue !== filteredValue);

				meta.data[index].hidden = isHidden;
			});

			chartInstance.update();
		}
	});

	onMount(() => {
		distributionData = calculateAllDistributions();

		distributionData[selectedProperty].then(initializeChart);
		return () => {
			if (chartInstance) {
				chartInstance.destroy();
			}
		};
	});

	// Icon for dropdown
	const chartIcon = feather.icons['pie-chart'].toSvg({ width: 18, height: 18 });
</script>

<div class="collapse-arrow bg-base-200 rounded-box collapse w-full">
	<input type="checkbox" class="peer" />
	<div class="collapse-title flex items-center justify-center gap-2 font-medium">
		<span class="flex items-center gap-1">
			{@html chartIcon}
			Card Distribution Graph
		</span>
	</div>
	<div class="collapse-content">
		<div class="card-distribution w-full rounded-lg p-4">
			<!-- Chart Title with Property Selector -->
			{#if chartProperties && chartProperties.length > 0}
				<div class="chart-title mb-4 text-center">
					<fieldset class="fieldset">
						<span class="label">View by</span>
						<select bind:value={selectedProperty} class="select select-lg h-full w-full">
							{#each chartProperties as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</fieldset>
				</div>
			{:else}
				<div class="chart-title mb-4 text-center">
					<span class="font-bold">{title}</span>
				</div>
			{/if}

			<div class="chart-layout flex flex-col gap-6">
				<div class="chart-wrapper flex items-center justify-center">
					<div class="chart-container aspect-square w-full max-w-md">
						<canvas bind:this={chartCanvas}></canvas>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.card-distribution {
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	.chart-container {
		position: relative;
	}
</style>
