<script lang="ts">
	import { onMount } from 'svelte';
	import feather from 'feather-icons';
	import {
		store as themeStore,
		lightChartColors,
		darkChartColors,
		secondaryChartColors
	} from '$lib/stores/themeStore.svelte';
	import {
		Chart,
		ArcElement,
		Tooltip,
		Legend,
		DoughnutController,
		type ChartType,
		type ChartDataset,
		type ChartData
	} from 'chart.js';

	// Register required Chart.js components
	Chart.register(ArcElement, Tooltip, Legend, DoughnutController);

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
	let oldProperty = $state(property);
	let distributionData = $state<{
		[k: string]: Promise<{ category: string; count: number }[]>;
	}>({});
	let chartColors = $derived(themeStore.useDarkMode ? darkChartColors : lightChartColors);
	let chartData = $derived.by(async () => {
		const data = distributionData[selectedProperty];
		if (!data) {
			return Promise.resolve({ labels: [], datasets: [] });
		}

		const colors = chartColors;

		// Special handling for type and race with multi-layer charts
		if (selectedProperty === 'type' || selectedProperty === 'race') {
			return getMultiSeriesChartData(selectedProperty);
		}

		// Standard single-layer doughnut chart for other properties
		return data.then((distribution) => {
			return {
				labels: distribution.map((item) => item.category),
				datasets: [
					{
						data: distribution.map((item) => item.count),
						backgroundColor: distribution.map((item, index) => colors[index % chartColors.length]),
						borderWidth: 1,
						borderColor: themeStore.baseContentColor
					}
				]
			};
		});
	});

	// Process data for multi-series pie/doughnut chart (type and race)
	async function getMultiSeriesChartData(prop: string) {
		// Map to track card counts for both main categories and specific types
		const mainCategoryCounts: Record<string, number> = {};
		const specificTypeCounts: Record<
			string,
			{ category: string; count: number; mainCategory: string }
		> = {};

		// Process cards
		cube.forEach((card: any) => {
			const cardType = card.apiData?.type || card.type;
			if (!cardType) return;

			const quantity = card.quantity || 1;

			// Determine main category (Monster, Spell, Trap)
			let mainCategory = '';
			if (cardType.includes('Monster')) {
				mainCategory = 'Monster';
			} else if (cardType.includes('Spell')) {
				mainCategory = 'Spell';
			} else if (cardType.includes('Trap')) {
				mainCategory = 'Trap';
			}

			// Add to main category count
			if (mainCategory) {
				mainCategoryCounts[mainCategory] = (mainCategoryCounts[mainCategory] || 0) + quantity;
			}

			// If we're looking at race/type, handle the specific values
			if (prop === 'type') {
				const key = cardType;
				if (!specificTypeCounts[key]) {
					specificTypeCounts[key] = { category: cardType, count: 0, mainCategory };
				}
				specificTypeCounts[key].count += quantity;
			} else if (prop === 'race') {
				const race = card.apiData?.race;
				if (race) {
					const key = race + '-' + mainCategory;
					if (!specificTypeCounts[key]) {
						specificTypeCounts[key] = { category: race, count: 0, mainCategory };
					}
					specificTypeCounts[key].count += quantity;
				}
			}
		});

		// Convert to arrays for Chart.js
		const mainCategoryData = Object.entries(mainCategoryCounts)
			.map(([category, count]) => ({ category, count }))
			.sort((a, b) => b.count - a.count);

		// Group specific types by their main category
		const specificTypesByMainCategory: Record<string, (typeof specificTypeCounts)[string][]> = {};

		// Organize specific types by their main category
		Object.values(specificTypeCounts).forEach((item) => {
			if (!specificTypesByMainCategory[item.mainCategory]) {
				specificTypesByMainCategory[item.mainCategory] = [];
			}
			specificTypesByMainCategory[item.mainCategory].push(item);
		});

		// Sort main categories first, then specific types within each category
		const orderedSpecificTypeData: (typeof specificTypeCounts)[string][] = [];

		// For each main category (in the order they'll appear in the chart)
		mainCategoryData.forEach((mainCategory) => {
			// Get the specific types for this main category
			const typesInCategory = specificTypesByMainCategory[mainCategory.category] || [];

			// Sort the specific types within this category by count
			typesInCategory.sort((a, b) => b.count - a.count);

			// Add them to our ordered array
			orderedSpecificTypeData.push(...typesInCategory);
		});

		// Now specificTypeData is ordered to match main categories
		const specificTypeData = orderedSpecificTypeData;

		// Prepare colors based on main categories
		const mainCategoryColors = mainCategoryData.map((item, index) => {
			const baseColor = chartColors[index % chartColors.length];
			return baseColor;
		});

		// Create colors for specific types based on their main category
		const specificTypeColors = specificTypeData.map((item, index) => {
			// Use secondaryChartColors for inner segments
			return secondaryChartColors[index % secondaryChartColors.length];
		});

		// Prepare datasets for multi-layer pie/doughnut chart
		return {
			labels: [
				...mainCategoryData.map((item) => item.category),
				...specificTypeData.map((item) => item.category)
			],
			datasets: [
				{
					// Outer ring - main categories (Monster, Spell, Trap)
					label: 'Card Categories',
					data: [...mainCategoryData.map((item) => item.count), ...specificTypeData.map(() => 0)],
					backgroundColor: [...mainCategoryColors, ...specificTypeData.map(() => 'rgba(0,0,0,0)')],
					borderWidth: 1,
					borderColor: themeStore.baseContentColor
				},
				{
					// Inner ring - specific types
					label: 'Specific Types',
					data: [...mainCategoryData.map(() => 0), ...specificTypeData.map((item) => item.count)],
					backgroundColor: [...mainCategoryData.map(() => 'rgba(0,0,0,0)'), ...specificTypeColors],
					borderWidth: 1,
					borderColor: themeStore.baseContentColor
				}
			]
		};
	}

	function calculateAllDistributions(): {
		[k: string]: Promise<{ category: string; count: number }[]>;
	} {
		// Return property information with a promise for each distribution
		return Object.fromEntries(
			chartProperties.map((prop: { value: string; label: string }) => [
				prop.value,
				getDistribution(cube, prop.value)
			])
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

		// Always use doughnut chart regardless of whether it's multi-series or not
		const isMultiSeries = selectedProperty === 'type' || selectedProperty === 'race';
		const chartType = 'doughnut';

		// If there's an existing chart, destroy it
		if (chartInstance) {
			chartInstance.destroy();
		}

		// Get the data for multi-series charts
		let mainCategoryData: { category: string; count: number }[] = [];
		let specificTypeData: { category: string; count: number; mainCategory: string }[] = [];

		if (isMultiSeries) {
			// Pre-fetch the multi-series data for tooltip access
			const multiSeriesData = await getMultiSeriesChartData(selectedProperty);
			// Extract the main categories and specific types
			const totalLabels = multiSeriesData.labels.length;
			const mainCategoryCount = multiSeriesData.datasets[0].data.filter(
				(v) => Number(v) > 0
			).length;

			// Extract main categories (from first half of labels)
			mainCategoryData = multiSeriesData.labels.slice(0, mainCategoryCount).map((label, index) => ({
				category: label as string,
				count: Number(multiSeriesData.datasets[0].data[index])
			}));

			// Extract specific types (from second half of labels)
			const rawSpecificTypes = multiSeriesData.labels
				.slice(mainCategoryCount)
				.map((label, index) => {
					// Find which main category this belongs to by iterating through the data
					const realIndex = index + mainCategoryCount;
					let mainCategory = '';

					// Loop through main categories to find which one this specific type belongs to
					for (let i = 0; i < mainCategoryCount; i++) {
						if (
							multiSeriesData.datasets[1].backgroundColor?.[realIndex] ===
							multiSeriesData.datasets[1].backgroundColor?.[i]
						) {
							mainCategory = multiSeriesData.labels[i] as string;
							break;
						}
					}

					return {
						category: label as string,
						count: Number(multiSeriesData.datasets[1].data[realIndex]),
						mainCategory
					};
				});

			specificTypeData = rawSpecificTypes.filter((item) => item.count > 0);
		}

		const config: any = {
			type: chartType,
			data: await chartData,
			options: {
				responsive: true,
				maintainAspectRatio: true,
				borderColor: themeStore.baseContentColor,
				plugins: {
					legend: {
						display: showLegend,
						position: 'bottom',
						labels: {
							color: themeStore.baseContentColor,
							generateLabels: function (chart) {
								// Custom legend labels for multi-series charts
								if (isMultiSeries) {
									const {
										labels: { pointStyle, color }
									} = chart.legend.options;

									// Create legend items for main categories (outer ring)
									const mainLabels = mainCategoryData.map((item, index) => {
										const isHidden =
											filteredValue && filteredProperty && item.category !== filteredValue;

										const meta = chart.getDatasetMeta(0);
										const style = meta.controller.getStyle(index);

										return {
											text: `${item.category} (${item.count})`,
											fillStyle: chartColors[index % chartColors.length],
											strokeStyle: style.borderColor,
											fontColor: color,
											lineWidth: 1,
											hidden: isHidden,
											index: index,
											datasetIndex: 0
										};
									});

									// Create legend items for specific types (inner ring)
									const specificLabels = specificTypeData.map((item, index) => {
										const isHidden =
											filteredValue && filteredProperty && item.category !== filteredValue;
										const meta = chart.getDatasetMeta(1);
										const style = meta.controller.getStyle(index);
										return {
											text: `${item.category} (${item.count})`,
											fillStyle: secondaryChartColors[index % secondaryChartColors.length],
											fontColor: color,
											strokeStyle: style.borderColor,
											lineWidth: 1,
											hidden: isHidden,
											index: index + mainCategoryData.length,
											datasetIndex: 1
										};
									});

									// Return combined legend items
									return [...mainLabels, ...specificLabels];
								}

								// Use default legend generation for single series charts
								// @ts-ignore - Chart.js types are incomplete
								let labels =
									Chart.overrides['doughnut'].plugins.legend.labels.generateLabels(chart);
								labels = labels.map((label, index) => {
									// Get the count value from the dataset
									const count = chart.data.datasets[0].data[index];
									return {
										...label,
										text: `${label.text} (${count})`
									};
								});
								return labels;
							}
						},
						onClick: (event: any, legendItem: any, legend: any) => {
							if (legendItem && legendItem.text) {
								// For multi-series charts, check if we're clicking on main category legend item
								const isMultiSeries = selectedProperty === 'type' || selectedProperty === 'race';

								if (isMultiSeries && legendItem.datasetIndex === 0) {
									// Don't apply filtering for main categories (outer ring)
									return;
								}

								// Extract the category name without the count
								const categoryName = legendItem.text.replace(/\s*\(\d+\)$/, '');
								filteredValue = categoryName;
								filteredProperty = selectedProperty;

								// Update chart visibility
								if (chartInstance) {
									chartInstance.update();
								}
							}
						}
					},
					tooltip: {
						callbacks: {
							// Customize tooltip to show the correct label and value
							title: function (context: any) {
								const labelIndex = context[0].dataIndex;
								const datasetIndex = context[0].datasetIndex;
								const label = context[0].chart.data.labels[labelIndex];

								// For multi-series chart, add more context to the tooltip
								if (isMultiSeries) {
									// Get the value to check if this is a placeholder (zero) segment
									const value = context[0].raw;
									if (value === 0) return null;

									// For outer ring (main categories)
									if (datasetIndex === 0 && labelIndex < mainCategoryData.length) {
										return `${label} Cards`;
									}
									// For inner ring (specific types)
									else if (datasetIndex === 1) {
										const specificIndex = labelIndex - mainCategoryData.length;
										if (specificIndex >= 0 && specificIndex < specificTypeData.length) {
											const specificType = specificTypeData[specificIndex];
											if (specificType) {
												return specificType.category;
											}
										}
									}
								}

								return label;
							},
							label: function (context: any) {
								const value = context.raw;
								if (value === 0) return null; // Don't show tooltip for placeholder values
								return `Count: ${value}`;
							}
						}
					}
				}
			}
		};

		// Apply doughnut chart settings for all charts
		config.options.cutout = '35%'; // Inner cutout percentage
		config.options.radius = '90%'; // Overall chart radius

		// Special settings for multi-series charts
		if (isMultiSeries) {
			// Set up tooltip colors directly via the tooltip properties
			config.options.plugins.tooltip.boxWidth = 12;
			config.options.plugins.tooltip.boxHeight = 12;
			config.options.plugins.tooltip.boxPadding = 3;
			config.options.plugins.tooltip.usePointStyle = true; // Enable point style

			// Setup tooltip color boxes for dataset items
			// These will be used as the color boxes in tooltips
			config.options.plugins.tooltip.itemSort = function (a, b) {
				// Sort items to ensure main categories come first, then specific types
				return a.datasetIndex - b.datasetIndex;
			};

			// Set the tooltip backgroundColor property to use these colors
			config.options.plugins.tooltip.backgroundColor = themeStore.useDarkMode
				? 'rgba(0, 0, 0, 0.8)'
				: 'rgba(255, 255, 255, 0.8)';
			config.options.plugins.tooltip.titleColor = themeStore.baseContentColor;
			config.options.plugins.tooltip.bodyColor = themeStore.baseContentColor;
			config.options.plugins.tooltip.padding = 10;
		} // Add click handler for chart segments
		config.options.onClick = async (event: any, elements: any) => {
			if (elements && elements.length > 0) {
				const index = elements[0].index;
				const datasetIndex = elements[0].datasetIndex;
				filteredProperty = selectedProperty;

				if (isMultiSeries) {
					// For multi-series charts, check if we're clicking on main category (outer ring)
					// or specific type (inner ring)

					// Main categories are in datasetIndex 0 and specific types are in datasetIndex 1
					// Only apply filter if clicking on specific types (inner ring, datasetIndex 1)
					if (datasetIndex === 1) {
						const value = chartInstance?.data.datasets[datasetIndex].data[index];
						if (value && Number(value) > 0) {
							filteredValue = chartInstance?.data.labels?.[index] || '';
						}
					}
					// Clicking on main categories (outer ring) doesn't do anything
				} else {
					// For regular pie charts, get the value from distributionData
					const propertyData = await distributionData[selectedProperty];
					filteredValue = propertyData[index].category;
				}
			}
		};

		chartInstance = new Chart(ctx, config);
	}

	$effect(() => {
		if (!chartInstance) return;

		const updateChart = async () => {
			if (selectedProperty !== oldProperty) {
				oldProperty = selectedProperty;
				// Re-initialize the chart when property changes
				initializeChart();
				return;
			}

			// At this point we know chartInstance is not null
			const chart = chartInstance!;

			// For multi-series charts (type and race), handle visibility differently
			const isMultiSeries = selectedProperty === 'type' || selectedProperty === 'race';

			if (isMultiSeries) {
				// For multi-series, update visibility based on dataset and index
				if (filteredValue && filteredProperty) {
					// Find the index of the filtered value in the labels array
					const labelIndex = chart.data.labels?.indexOf(filteredValue) ?? -1;

					if (labelIndex >= 0) {
						// For each dataset, hide all data points except the matching one
						chart.data.datasets.forEach((dataset, datasetIndex) => {
							const meta = chart.getDatasetMeta(datasetIndex);
							meta.data.forEach((dataPoint, index) => {
								// Only show the selected segment and hide others
								const value = Number(dataset.data[index]);
								// @ts-ignore - Chart.js types don't properly expose the hidden property
								dataPoint.hidden = index !== labelIndex && value > 0;
							});
						});
					}
				} else {
					// If no filter is applied, show all segments
					chart.data.datasets.forEach((dataset, datasetIndex) => {
						const meta = chart.getDatasetMeta(datasetIndex);
						meta.data.forEach((dataPoint, index) => {
							const value = Number(dataset.data[index]);
							// @ts-ignore - Chart.js types don't properly expose the hidden property
							dataPoint.hidden = value === 0; // Hide only placeholder values
						});
					});
				}
			} else {
				// Original handling for single-series charts
				const meta = chart.getDatasetMeta(0);
				if (!meta) return;
				const legendItems = chart.legend?.legendItems;
				if (!legendItems) return;

				// Set the hidden property for each data point
				legendItems.forEach((item, index) => {
					const labelText = item.text;
					// Extract the category name without the count for comparison
					const categoryName = labelText.replace(/\s*\(\d+\)$/, '');
					const isHidden = filteredValue && filteredProperty && categoryName !== filteredValue;

					// @ts-ignore - Chart.js types don't properly expose the hidden property
					meta.data[index].hidden = isHidden;
				});
			}

			// Update colors
			if (chart.options.plugins?.legend?.labels) {
				// @ts-ignore - Chart.js types are incomplete for this property
				chart.options.plugins.legend.labels.color = themeStore.baseContentColor;
			}

			chart.options.borderColor = themeStore.baseContentColor;
			chart.update();
		};

		updateChart();
	});

	onMount(() => {
		distributionData = calculateAllDistributions();

		// Initialize chart after data is loaded
		if (selectedProperty === 'type' || selectedProperty === 'race') {
			// For multi-series charts, we can initialize right away
			initializeChart();
		} else {
			// For regular pie charts, wait for data to load
			distributionData[selectedProperty].then(initializeChart);
		}

		return () => {
			if (chartInstance) {
				chartInstance.destroy();
			}
		};
	});

	// Icon for dropdown
	const chartIcon = feather.icons['pie-chart'].toSvg({ width: 18, height: 18 });
</script>

<div class="collapse-arrow bg-base-300 rounded-box collapse w-full">
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
