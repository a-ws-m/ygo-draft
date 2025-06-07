<script lang="ts">
	import { onMount } from 'svelte';
	import feather from 'feather-icons';
    import { store as themeStore } from '$lib/stores/themeStore.svelte';
	import { Chart, ArcElement, Tooltip, Legend, DoughnutController, Colors } from 'chart.js';

	// Register required Chart.js components
	Chart.register(ArcElement, Tooltip, Legend, DoughnutController, Colors);

	const {
		cube = [],
		property = 'type',
		title = 'Card Distribution',
		maxSlices = 10,
		showLegend = true,
		onChartClick = undefined,
		chartProperties = [
			{ value: 'type', label: 'Card Type' },
			{ value: 'archetype', label: 'Archetype' },
			{ value: 'attribute', label: 'Attribute' },
			{ value: 'race', label: 'Race/Spell Type' },
			{ value: 'level', label: 'Level/Rank' },
			{ value: 'rarity', label: 'Rarity' }
		]
	} = $props<{
		cube: any[];
		property?: string;
		title?: string;
		maxSlices?: number;
		showLegend?: boolean;
		onChartClick?: (event: { property: string; value: string }) => void;
		chartProperties?: Array<{ value: string; label: string }>;
	}>();

	let chartCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance = $state<Chart | null>(null);
	let selectedProperty = $state(property);
	let currentData;

	// Process data to get distribution based on the selected property
	function getDistribution(cards: any[], prop: string) {
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
		let result = Object.entries(distribution)
			.map(([category, count]) => ({
				category,
				count: Number(count)
			}))
			.sort((a, b) => b.count - a.count); // Sort by count descending

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
	function initializeChart() {
		if (!chartCanvas) return;

		const ctx = chartCanvas.getContext('2d');
		if (!ctx) return;

		currentData = getDistribution(cube, selectedProperty);
		const data = currentData;

        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-base-content').trim();

		// Prepare data for Chart.js
		const chartData = {
			labels: data.map((item) => item.category),
			datasets: [
				{
					data: data.map((item) => item.count)
				}
			]
		};

		chartInstance = new Chart(ctx, {
			type: 'doughnut',
			data: chartData,
			options: {
				responsive: true,
				maintainAspectRatio: true,
				plugins: {
					legend: {
						display: showLegend,
						position: 'bottom',
						labels: {
							color: textColor
						}
					},
					tooltip: {
						callbacks: {
							label: (context) => {
								const label = context.label || '';
								const value = context.raw as number;
								const total = context.dataset.data.reduce(
									(sum: number, val: number) => sum + val,
									0
								);
								const percentage = Math.round((value / total) * 100);
								return `${label}: ${value} (${percentage}%)`;
							}
						}
					}
				},
				onClick: (event, elements) => {
					if (elements && elements.length > 0 && onChartClick) {
						const index = elements[0].index;
						onChartClick({
							property: selectedProperty,
							value: currentData[index].category
						});
					}
				}
			}
		});
	}

	onMount(() => {
		initializeChart();
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
		<div class="card-distribution bg-base-100 w-full rounded-lg p-4 shadow">
			<!-- Chart Title with Property Selector -->
			{#if chartProperties && chartProperties.length > 0}
				<div class="chart-title mb-4 text-center">
					<div class="join items-center">
						<span class="join-item btn btn-sm btn-ghost no-animation">View by:</span>
						<select
							bind:value={selectedProperty}
							class="select select-lg join-item flex h-full items-center py-0 text-base leading-normal focus:outline-none"
						>
							{#each chartProperties as option}
								<option value={option.value} class="text-base">{option.label}</option>
							{/each}
						</select>
					</div>
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
