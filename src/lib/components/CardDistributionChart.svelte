<script lang="ts">
	import * as d3 from 'd3';
	import { onMount } from 'svelte';

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
			{ value: 'level', label: 'Level/Rank' }
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
	let legendElement = $state();
	let containerWidth = $state();
	let containerHeight = $state();
	let selectedProperty = $state(property);
	let distributionData = $state([]);
	let colorScale;

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

	// Create separate legend
	function createLegend(data) {
		if (!legendElement) return;

		// Clear previous legend if any
		d3.select(legendElement).selectAll('*').remove();

		const totalCount = data.reduce((sum, d) => sum + d.count, 0);

		const legendContainer = d3
			.select(legendElement)
			.append('div')
			.attr('class', 'legend-container');

		// Create legend items
		const legendItems = legendContainer
			.selectAll('.legend-item')
			.data(data)
			.enter()
			.append('div')
			.attr('class', 'legend-item')
			.attr('data-category', (d) => d.category)
			.style('margin-bottom', '10px')
			.style('display', 'flex')
			.style('align-items', 'center');

		// Add color box
		legendItems
			.append('div')
			.attr('class', 'color-box')
			.style('width', '15px')
			.style('height', '15px')
			.style('margin-right', '8px')
			.style('flex-shrink', '0')
			.style('background-color', (d, i) => colorScale(i));

		// Add text with category and count
		const textContainer = legendItems
			.append('div')
			.attr('class', 'legend-text')
			.style('display', 'flex')
			.style('flex-direction', 'column');

		textContainer
			.append('div')
			.attr('class', 'category-name')
			.style('font-size', '14px')
			.style('line-height', '1.2')
			.text((d) => (d.category.length > 20 ? d.category.substring(0, 17) + '...' : d.category));

		textContainer
			.append('div')
			.attr('class', 'category-count')
			.style('font-size', '12px')
			.style('color', '#666')
			.text((d) => `${d.count} (${Math.round((d.count / totalCount) * 100)}%)`);

		// Add legend note if we have too many categories
		if (data.length > maxSlices) {
			legendContainer
				.append('div')
				.attr('class', 'legend-note')
				.style('font-size', '11px')
				.style('font-style', 'italic')
				.style('color', '#666')
				.style('margin-top', '8px')
				.text(`+ ${data.length - maxSlices} more categories`);
		}
	}

	// Create pie chart using D3
	function createPieChart(data) {
		if (!chartElement) return;

		// Clear previous chart if any
		d3.select(chartElement).selectAll('*').remove();

		// Remove previous tooltip if exists
		d3.select(chartElement.parentElement).select('.tooltip').remove();

		// Set up color scale globally so legend can access it
		colorScale = d3.scaleOrdinal(d3.schemeCategory10);

		// Update the distribution data for the legend
		distributionData = data;

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
			.on('mouseover', function (event, d) {
				// Scale up the pie segment
				d3.select(this).style('transform', 'scale(1.05)');

				// Highlight the corresponding legend item
				d3.selectAll(`.legend-item[data-category="${d.data.category}"]`)
					.style('font-weight', 'bold')
					.style('transform', 'scale(1.05)')
					.style('transition', 'all 0.2s');
			})
			.on('mouseout', function (event, d) {
				// Return pie segment to normal
				d3.select(this).style('transform', 'scale(1)');

				// Remove highlight from legend item
				d3.selectAll(`.legend-item[data-category="${d.data.category}"]`)
					.style('font-weight', 'normal')
					.style('transform', 'scale(1)');
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

		// Create separate legend
		if (showLegend) {
			createLegend(data);
		}
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
</script>

<details class="card-distribution-accordion w-full" open>
	<summary class="card-distribution-summary text-center cursor-pointer py-2 px-4 border border-gray-200 rounded select-none">Card Distribution Graph</summary>
	<div class="card-distribution">
		<!-- Chart Title with Property Selector (replacing the title) -->
		{#if chartProperties && chartProperties.length > 0}
			<div class="chart-title">
				<span class="font-bold">
					<select
						bind:value={selectedProperty}
						class="cursor-pointer appearance-auto border-0 border-b-2 border-gray-200 bg-transparent font-bold focus:border-gray-400 focus:ring-0 focus:outline-none"
					>
						{#each chartProperties as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</span>
			</div>
		{:else}
			<div class="chart-title">
				<span class="font-bold">{title}</span>
			</div>
		{/if}

		<div class="chart-layout">
			{#if showLegend}
				<div class="legend-container" bind:this={legendElement}></div>
			{/if}
			<div class="chart-container" bind:this={chartElement}></div>
		</div>
	</div>
</details>

<style>
	.card-distribution {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
	}

	.chart-layout {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: row;
	}

	.legend-container {
		flex: 1;
		padding: 10px;
		padding-top: 20px;
		overflow-y: auto;
		max-height: 100%;
	}

	.chart-container {
		flex: 2;
		position: relative;
	}

	.chart-title {
		text-align: center;
		margin-bottom: 0.5rem;
		font-size: 16px;
		width: 100%;
	}

	.chart-title select {
		-webkit-appearance: none;
		-moz-appearance: none;
		appearance: none;
		background-repeat: no-repeat;
		background-position: right 0.25rem center;
		background-size: 1em;
		padding-right: 1.5rem;
	}

	:global(.legend-item) {
		transition: all 0.2s;
	}

	:global(.legend-item:hover) {
		transform: scale(1.05);
		font-weight: bold;
		cursor: pointer;
	}

	.card-distribution-summary {
		cursor: pointer;
		padding: 10px;
		user-select: none;
	}

	.card-distribution-accordion {
		width: 100%;
	}
</style>
