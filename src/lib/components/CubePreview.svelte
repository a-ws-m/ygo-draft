<script>
    import Card from "$lib/components/Card.svelte"; // Import the Card component
    export let cube = []; // The cube data passed as a prop
    let showAll = false; // Controls whether to show all cards

    // Limit the number of cards displayed initially
    const initialDisplayLimit = 8;
</script>

<div class="space-y-4">
    <!-- Total Cards -->
    <p class="text-lg font-medium text-gray-700">
        Total Cards: {cube.reduce((sum, card) => sum + card.quantity, 0)}
    </p>

    <!-- Card Previews -->
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