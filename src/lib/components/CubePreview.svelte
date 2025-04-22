<script>
    import { onMount } from "svelte"; // Import Svelte's onMount lifecycle function
    import Card from "$lib/components/Card.svelte"; // Import the Card component

    export let cube = []; // The cube data passed as a prop
    let showAll = false; // Controls whether to show all cards
    let viewMode = "tile"; // Controls the view mode: "tile" or "list"

    // Limit the number of cards displayed initially
    const initialDisplayLimit = 8;

    // Determine the default view mode based on screen size
    onMount(() => {
        if (window.innerWidth <= 768) {
            viewMode = "list"; // Default to list mode on mobile
        }
    });

    // Map card types to colors
    const typeColors = {
        spell: "border-green-500",
        monster: "border-yellow-400",
        trap: "border-fuchsia-400",
    };

    // Function to determine the card type color
    const getTypeColor = (type) => {
        if (type.toLowerCase().includes("spell")) return typeColors.spell;
        if (type.toLowerCase().includes("monster")) return typeColors.monster;
        if (type.toLowerCase().includes("trap")) return typeColors.trap;
        return "border-gray-500"; // Default color
    };
</script>

<div class="space-y-4">
    <!-- Total Cards -->
    <p class="text-lg font-medium text-gray-700">
        Total Cards: {cube.reduce((sum, card) => sum + card.quantity, 0)}
    </p>

    <!-- View Mode Toggle -->
    <div class="flex justify-end">
        <button
            on:click={() => (viewMode = viewMode === "tile" ? "list" : "tile")}
            class="px-4 py-2 text-sm font-medium rounded shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 bg-indigo-600 text-white hover:bg-indigo-700"
        >
            {viewMode === "tile" ? "Switch to List View" : "Switch to Tile View"}
        </button>
    </div>

    <!-- Card Previews -->
    {#if viewMode === "tile"}
        <div class="grid grid-cols-4 gap-4">
            {#each (showAll ? cube : cube.slice(0, initialDisplayLimit)) as card}
                <div class="flex flex-col items-center">
                    <!-- Use the Card component with small size -->
                    <Card {card} size="small" />
                    <!-- Card Name and Quantity -->
                    <p class="mt-1 text-sm text-gray-600 text-center">{card.name}</p>
                    <p class="text-xs text-gray-500">x{card.quantity}</p>
                </div>
            {/each}
        </div>
    {:else}
        <div class="space-y-2">
            {#each (showAll ? cube : cube.slice(0, initialDisplayLimit)) as card}
                <div
                    class={`flex items-center justify-between p-2 border-l-4 rounded shadow-sm ${getTypeColor(
                        card.type
                    )}`}
                >
                    <!-- Card Name -->
                    <p class="text-sm font-medium text-gray-700">{card.name}</p>
                    <!-- Card Quantity -->
                    <p class="text-xs text-gray-500">x{card.quantity}</p>
                </div>
            {/each}
        </div>
    {/if}

    <!-- Show More/Show Less Button -->
    {#if cube.length > initialDisplayLimit}
        <button
            on:click={() => (showAll = !showAll)}
            class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
            {showAll ? "Show Less" : `Show All (${cube.length - initialDisplayLimit} more)`}
        </button>
    {/if}
</div>