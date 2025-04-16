<script lang="ts">
    export let card: {
        imageUrl: string;
        name: string;
        type: string;
        apiData: {
            type: string;
            desc: string;
            atk?: number;
            def?: number;
            level?: number;
            race: string;
            attribute?: string;
            archetype?: string;
        };
    }; // The card data passed as a prop

    export let size: "small" | "medium" | "large" = "medium"; // The size of the card

    // Helper function to determine if the card is a Monster card
    const isMonsterCard = card.apiData.type.toLowerCase().includes("monster");

    // Determine card dimensions based on size
    const sizeClasses: Record<typeof size, string> = {
        small: "w-16 h-24", // Small size
        medium: "w-32 h-48", // Medium size
        large: "w-48 h-72", // Large size
    };

    // Helper function to format the race for Spell/Trap cards
    function formatSpellTrapRace(): string {
        const type = card.apiData.type.toLowerCase();
        if (type.includes("spell")) {
            return `${card.apiData.race} Spell`;
        } else if (type.includes("trap")) {
            return `${card.apiData.race} Trap`;
        }
        return card.apiData.race; // Fallback in case it's neither
    }
</script>

<div class="relative group">
    <!-- Card Image -->
    <img
        src={card.imageUrl}
        alt={card.name}
        class={`object-cover rounded shadow ${sizeClasses[size]}`}
    />

    <!-- Pop-up Details -->
    <div
        class="absolute left-0 top-full mt-2 w-64 bg-white p-4 rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 transition-opacity duration-300 z-10"
    >
        <!-- Card Name -->
        <h3 class="text-lg font-bold text-gray-800">{card.name}</h3>

        <!-- Card Type and Archetype -->
        <p class="text-sm text-gray-600">
            <span class="font-medium">Type:</span> {card.type}
        </p>
        {#if card.apiData.archetype}
            <p class="text-sm text-gray-600">
                <span class="font-medium">Archetype:</span> {card.apiData.archetype}
            </p>
        {/if}

        <!-- Card Description -->
        <p class="text-sm text-gray-600 mt-2">
            <span class="font-medium">Description:</span> {card.apiData.desc}
        </p>

        <!-- Monster Card Details -->
        {#if isMonsterCard}
            <div class="mt-2 space-y-1">
                <p class="text-sm text-gray-600">
                    <span class="font-medium">ATK:</span> {card.apiData.atk}
                </p>
                <p class="text-sm text-gray-600">
                    <span class="font-medium">DEF:</span> {card.apiData.def}
                </p>
                <p class="text-sm text-gray-600">
                    <span class="font-medium">Level:</span> {card.apiData.level}
                </p>
                <p class="text-sm text-gray-600">
                    <span class="font-medium">Race:</span> {card.apiData.race}
                </p>
                <p class="text-sm text-gray-600">
                    <span class="font-medium">Attribute:</span> {card.apiData.attribute}
                </p>
            </div>
        {/if}

        <!-- Spell/Trap Card Details -->
        {#if !isMonsterCard}
            <div class="mt-2">
                <p class="text-sm text-gray-600">
                    {formatSpellTrapRace()}
                </p>
            </div>
        {/if}
    </div>
</div>