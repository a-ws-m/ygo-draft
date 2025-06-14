<script lang="ts">
	import { onMount } from 'svelte';
	import feather from 'feather-icons';
	import { store as themeStore } from '$lib/stores/themeStore.svelte';
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
	import chroma from 'chroma-js';
	import { color } from 'chart.js/helpers';

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
		filteredValue = $bindable(''),
		filteredIndices = $bindable([])
	} = $props<{
		cube: any[];
		property?: string;
		title?: string;
		maxSlices?: number;
		showLegend?: boolean;
		chartProperties?: Array<{ value: string; label: string }>;
		filteredProperty?: string;
		filteredValue?: string;
		filteredIndices?: number[];
	}>();

	let chartCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance = $state<Chart | null>(null);
	let selectedProperty = $state(property);
	let oldProperty = $state(property);

	// Generate a colorPalette based on the selected property
	let colorPalette = $derived.by(() => {
		// Create different color palettes based on property type
		if (selectedProperty === 'type') {
			// For card types, use colors that match Yu-Gi-Oh card type colors
			return {
				Monster: '#f8d66d', // Gold for Monsters
				Spell: '#1d9e74', // Green for Spells
				Trap: '#bc5a84', // Magenta for Traps
				// Specific monster types
				'Normal Monster': '#fbe68d',
				'Effect Monster': '#ff8b53',
				'Fusion Monster': '#a086b7',
				'Synchro Monster': '#eeeeee',
				'Xyz Monster': '#000000',
				'Link Monster': '#00008b',
				'Ritual Monster': '#9db5cc',
				'Pendulum Monster': '#7fbce6',
				// Default colors for other types
				default: chroma.brewer.Set3 // Use a qualitative palette for other types
			};
		} else if (selectedProperty === 'attribute') {
			return {
				DARK: '#6a329f', // Purple for DARK
				LIGHT: '#fff44f', // Yellow for LIGHT
				EARTH: '#8b4513', // Brown for EARTH
				WATER: '#1e90ff', // Blue for WATER
				FIRE: '#ff4500', // Red-orange for FIRE
				WIND: '#7cfc00', // Bright green for WIND
				DIVINE: '#ffd700', // Gold for DIVINE
				default: chroma.brewer.Set3 // Use a qualitative palette for other types
			};
		} else if (selectedProperty === 'race') {
			// Colors for races and spell/trap types
			return {
				Monster: '#f8d66d', // Gold for Monsters
				Spell: '#1d9e74', // Green for Spells
				Trap: '#bc5a84', // Magenta for Traps
				default: chroma.brewer.Set3 // Use a qualitative palette for other types
			};
		} else if (selectedProperty === 'level') {
			// Sequential color scale for levels
			return {
				default: chroma.brewer.Set3 // Use a qualitative palette for other types
			};
		} else if (selectedProperty === 'rarity') {
			return {
				Common: '#b0b0b0',
				Uncommon: '#5fbb97',
				Rare: '#4a69bd',
				'Super Rare': '#f6b93b',
				'Ultra Rare': '#e55039',
				default: chroma.brewer.Set3 // Use a qualitative palette for other types
			};
		} else {
			// For other properties, use a qualitative palette
			return {
				default: chroma.brewer.Set3 // Use a qualitative palette for other types
			};
		}
	});

	let distributionData = $derived<{
		[k: string]: Promise<{ category: string; count: number }[]>;
	}>(calculateAllDistributions());

	let chartData = $derived.by(async () => {
		const data = distributionData[selectedProperty];
		if (!data) {
			return Promise.resolve({ labels: [], datasets: [] });
		}

		// Special handling for type and race with multi-layer charts
		if (selectedProperty === 'type' || selectedProperty === 'race') {
			return getMultiSeriesChartData(selectedProperty);
		}

		// Standard single-layer doughnut chart for other properties
		return data.then((distribution) => {
			// Get appropriate colors based on categories
			const colors = distribution.map((item, index) => {
				return getColorForCategory(item.category, index)[0];
			});

			return {
				labels: distribution.map((item) => item.category),
				datasets: [
					{
						data: distribution.map((item) => item.count),
						backgroundColor: colors,
						borderWidth: 1,
						borderColor: themeStore.baseContentColor
					}
				]
			};
		});
	});

	function getColorForCategory(category: string, index: number): [string, boolean] {
		// Get the color for a specific category from the color palette
		if (colorPalette[category]) {
			return [colorPalette[category], true];
		}

		for (const [key, value] of Object.entries(colorPalette)) {
			if (key === 'default') continue; // Skip default palette
			if (category.toLowerCase().startsWith(key.toLowerCase())) {
				return [value, true]; // Return the color for the main category
			}
		}

		// If no specific color, use default palette
		const defaultColors = colorPalette.default;
		return [defaultColors[index % defaultColors.length], false];
	}

	let mainCategoryData: { category: string; count: number }[] = [];
	let specificTypeData: { category: string; count: number; mainCategory: string }[] = [];

	// Process data for multi-series pie/doughnut chart (type and race)
	async function getMultiSeriesChartData(prop: string) {
		// Map to track card counts for both main categories and specific types
		const mainCategoryCounts: Record<string, number> = {};
		const specificTypeCounts: Record<
			string,
			{ category: string; count: number; mainCategory: string }
		> = {};

		// Process cards
		const filteredCube = filteredIndices.length > 0 ? filteredIndices.map((i) => cube[i]) : cube;
		filteredCube.forEach((card: any) => {
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
		mainCategoryData = Object.entries(mainCategoryCounts)
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
		specificTypeData = orderedSpecificTypeData;

		let paletteIndex = 0;
		// Prepare datasets for multi-layer pie/doughnut chart
		// Generate colors for main categories
		const mainCategoryColors = mainCategoryData.map((item) => {
			const [color, isSpecific] = getColorForCategory(item.category, paletteIndex);
			if (!isSpecific) {
				paletteIndex++;
			}
			return color;
		});

		// Generate colors for specific types
		const specificTypeColors = specificTypeData.map((item) => {
			const [color, isSpecific] = getColorForCategory(item.category, paletteIndex);
			if (!isSpecific) {
				paletteIndex++;
			}
			return color;
		});

		return {
			labels: [
				...mainCategoryData.map((item) => item.category),
				...specificTypeData.map((item) => item.category)
			],
			datasets: [
				{
					// Outer ring - main categories (Monster, Spell, Trap)
					label: 'Card Categories',
					data: mainCategoryData.map((item) => item.count),
					backgroundColor: mainCategoryColors,
					borderWidth: 1,
					borderColor: themeStore.baseContentColor
				},
				{
					// Inner ring - specific types
					label: 'Specific Types',
					data: specificTypeData.map((item) => item.count),
					backgroundColor: specificTypeColors,
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
				getDistribution(
					filteredIndices.map((i) => cube[i]),
					prop.value
				)
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

		const config: any = {
			type: chartType,
			data: await chartData,
			options: {
				animation: {
					duration: 0
				},
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
								// Get the default label list
								const original = Chart.overrides.doughnut.plugins.legend.labels.generateLabels;
								const labelsOriginal = original.call(this, chart);

								// Build an array of colors used in the datasets of the chart
								let datasetColors = chart.data.datasets.map(function (e) {
									return e.backgroundColor;
								});
								datasetColors = datasetColors.flat();

								// Modify the color and hide state of each label
								labelsOriginal.forEach((label) => {
									// Change the color to match the dataset
									label.fillStyle = datasetColors[label.index];
								});

								return labelsOriginal;
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
										const specificIndex = labelIndex;
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

		// Special settings for multi-series charts
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
							filteredValue = specificTypeData[index].category;
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

			// Update the chart data
			chart.data = await chartData;
			chart.update();

			// For multi-series charts (type and race), handle visibility differently
			const isMultiSeries = selectedProperty === 'type' || selectedProperty === 'race';

			if (isMultiSeries) {
				// For multi-series, update visibility based on dataset and index
				if (filteredValue && filteredProperty === selectedProperty) {
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
					const isHidden =
						filteredValue && filteredProperty == selectedProperty && categoryName !== filteredValue;

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
