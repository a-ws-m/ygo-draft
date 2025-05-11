<script lang="ts">
	import * as d3 from 'd3';
	import { onMount, createEventDispatcher } from 'svelte';
	import feather from 'feather-icons';

	// Event dispatcher for chart interactions
	const dispatch = createEventDispatcher();

	// Props
	const {
		cube = [],
		property = 'type', // 'type', 'archetype', 'attribute', 'race', etc.
		title = 'Card Distribution',
		maxSlices = 10, // Limit number of slices for readability
		showLegend = true,
		chartProperties = [
			{ value: 'type', label: 'Card Type' },
			{ value: 'archetype', label: 'Archetype' },
			{ value: 'attribute', label: 'Attribute' },
			{ value: 'race', label: 'Race/Spell Type' },
			{ value: 'level', label: 'Level/Rank' },
			{ value: 'rarity', label: 'Rarity' }
		] // New property for selector options
	} = $props<{
		cube: any[];
		property?: string;
		width?: number;
		height?: number;
		title?: string;
		maxSlices?: number;
		showLegend?: boolean;
		chartProperties?: Array<{ value: string; label: string }>;
	}>();

	let chartElement = $state();
	let containerWidth = $state();
	let containerHeight = $state();
	let selectedProperty = $state(property);
	let distributionData = $state<Array<{ category: string; count: number }>>([]);
	let hoveredCategory = $state<string | null>(null);
	const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

	// Process data to get distribution based on the selected property
	function getDistribution(cards, prop) {
		const distribution = {};

		cards.forEach((card) => {
			let value;

			// Extract the property value based on the property name
			if (prop === 'type') {
				value = card.apiData?.type || card.type || null;
			} else if (prop === 'archetype') {
				// Get archetype or mark as 'Non-Archetype'
				value = card.apiData?.archetype || 'Non-Archetype';
			} else if (prop === 'attribute') {
				value = card.apiData?.attribute || null;
			} else if (prop === 'race') {
				value = card.apiData?.race || null;
			} else {
				// Generic fallback for other properties
				value = card.apiData?.[prop] || card[prop] || null;
			}

			// Count by quantity if available
			if (value !== null) {
				const quantity = card.quantity || 1;
				distribution[value] = (distribution[value] || 0) + quantity;
			}
		});

		// Convert to array for D3
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

	// Create pie chart using D3
	function createPieChart(data) {
		if (!chartElement) return;

		// Clear previous chart if any
		d3.select(chartElement).selectAll('*').remove();

		// Remove previous tooltip if exists
		d3.select(chartElement.parentElement).select('.tooltip').remove();

		// Use the container's width to determine chart size
		// Ensure chart maintains 1:1 aspect ratio
		const size = Math.min(containerWidth || 300, containerHeight || 300);

		const svg = d3
			.select(chartElement)
			.append('svg')
			.attr('width', '100%')
			.attr('height', '100%')
			.attr('viewBox', `0 0 ${size} ${size}`)
			.attr('preserveAspectRatio', 'xMidYMid meet')
			.append('g')
			.attr('transform', `translate(${size / 2}, ${size / 2})`);

		const radius = size / 2 - 40;

		// Create pie layout
		const pie = d3
			.pie()
			.value((d) => d.count)
			.sort(null);

		// Generate arc
		const arc = d3
			.arc()
			.innerRadius(radius * 0.3) // Donut chart
			.outerRadius(radius);

		const totalCount = data.reduce((sum, d) => sum + d.count, 0);

		// Draw pie chart
		const paths = svg
			.selectAll('path')
			.data(pie(data))
			.enter()
			.append('path')
			.attr('d', arc)
			.attr('fill', (d, i) => colorScale(i))
			.attr('stroke', 'white')
			.attr('data-category', (d) => d.data.category)
			.style('stroke-width', '2px')
			.style('transition', 'transform 0.2s')
			.style('cursor', 'pointer')
			.on('click', function (event, d) {
				// Dispatch event when chart segment is clicked
				dispatch('chartClick', {
					property: selectedProperty,
					value: d.data.category
				});
			})
			.on('mouseover', function (event, d) {
				// Scale up the pie segment
				d3.select(this).style('transform', 'scale(1.05)');
				// Set hovered category for legend highlighting
				hoveredCategory = d.data.category;
			})
			.on('mouseout', function (event, d) {
				// Return pie segment to normal
				d3.select(this).style('transform', 'scale(1)');
				// Clear hovered category
				hoveredCategory = null;
			});

		// Add percentage labels
		const arcLabel = d3
			.arc()
			.innerRadius(radius * 0.6)
			.outerRadius(radius * 0.6);

		svg
			.selectAll('text.percentage')
			.data(pie(data))
			.enter()
			.append('text')
			.attr('class', 'percentage')
			.attr('transform', (d) => `translate(${arcLabel.centroid(d)})`)
			.attr('text-anchor', 'middle')
			.style('font-size', '12px')
			.style('font-weight', 'bold')
			.style('fill', 'white')
			.text((d) => {
				const percent = Math.round((d.data.count / totalCount) * 100);
				return percent > 5 ? `${percent}%` : '';
			});
	}

	// Create chart when data or property changes
	$effect(() => {
		// Use selectedProperty instead of property
		const distribution = getDistribution(cube, selectedProperty);
		distributionData = distribution;

		// Only try to render if we have both data and container dimensions
		if (distribution.length > 0 && containerWidth) {
			createPieChart(distribution);
		}
	});

	onMount(() => {
		const resizeObserver = new ResizeObserver((entries) => {
			for (let entry of entries) {
				containerWidth = entry.contentRect.width;
				containerHeight = entry.contentRect.height;
			}
		});

		if (chartElement?.parentElement) {
			resizeObserver.observe(chartElement.parentElement);
		}

		return () => {
			if (chartElement?.parentElement) {
				resizeObserver.unobserve(chartElement.parentElement);
			}
		};
	});

	// Icon for dropdown
	const chartIcon = feather.icons['pie-chart'].toSvg({ width: 18, height: 18 });

	// Calculate total count for percentage display
	const totalCount = $derived(distributionData.reduce((sum, d) => sum + d.count, 0));
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
							class="select select-lg join-item focus:outline-none text-base leading-normal flex items-center h-full py-0"
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
					<div
						class="chart-container min-h-[250px] w-full max-w-[300px]"
						bind:this={chartElement}
					></div>
				</div>

				{#if showLegend && distributionData.length > 0}
					<div class="legend-wrapper w-full">
						<div class="flex flex-wrap justify-center gap-2 p-2">
							{#each distributionData as item, i}
								{@const percentage = Math.round((item.count / totalCount) * 100)}
								{@const isHovered = hoveredCategory === item.category}
								<button
									class="btn btn-ghost btn-sm h-auto overflow-hidden px-3 py-1 text-left normal-case"
									style="transition: all 0.2s"
									onclick={() =>
										dispatch('chartClick', { property: selectedProperty, value: item.category })}
									onmouseenter={() => (hoveredCategory = item.category)}
									onmouseleave={() => (hoveredCategory = null)}
								>
									<div class="flex items-center gap-2">
										<div
											class="h-3 w-3 flex-shrink-0 rounded-sm"
											style="background-color: {colorScale(i)}"
										></div>
										<div class="flex flex-col items-start">
											<span class="text-sm font-medium">{item.category}</span>
											<span class="text-xs opacity-75">{item.count} ({percentage}%)</span>
										</div>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
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
