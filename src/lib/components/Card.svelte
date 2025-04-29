<svelte:options customElement="card-view" />

<script lang="ts">
    // Props using $props rune
    const { 
        card,
        size = 'medium',
        variation = 'image',
        handleMouseEnter = () => {},
        handleMouseLeave = () => {}
    } = $props<{
        card: {
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
            quantity?: number;
        };
        size?: 'small' | 'medium' | 'large';
        variation?: 'image' | 'text';
        handleMouseEnter?: () => void;
        handleMouseLeave?: () => void;
    }>();


    // Reactive state
    let isExpanded = $state(false);

    // Derived values
    const isMonsterCard = $derived(card.apiData.type.toLowerCase().includes('monster'));

    // Determine card dimensions based on size
    const sizeClasses = {
        small: 'w-16 h-24', 
        medium: 'w-32 h-48', 
        large: 'w-48 h-72' 
    };

    // Helper function to format the race for Spell/Trap cards
    function formatSpellTrapRace() {
        const type = card.apiData.type.toLowerCase();
        if (type.includes('spell')) {
            return `${card.apiData.race} Spell`;
        } else if (type.includes('trap')) {
            return `${card.apiData.race} Trap`;
        }
        return card.apiData.race; // Fallback in case it's neither
    }

    // Map card types to colors
    const typeColors = {
        spell: 'border-green-500',
        monster: 'border-yellow-400',
        trap: 'border-fuchsia-400'
    };

    // Function to determine the card type color
    const getTypeColor = (type) => {
        if (type.toLowerCase().includes('spell')) return typeColors.spell;
        if (type.toLowerCase().includes('monster')) return typeColors.monster;
        if (type.toLowerCase().includes('trap')) return typeColors.trap;
        return 'border-gray-500'; // Default color
    };

</script>

{#if variation === 'image'}
    <div class="group relative" onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave}>
        <!-- Card Image -->
        <img
            src={card.imageUrl}
            alt={card.name}
            class={`rounded object-cover shadow ${sizeClasses[size]}`}
        />
    </div>
{:else if variation === 'text'}
    <div
        class={`flex cursor-pointer flex-col rounded border-l-4 p-2 shadow-sm ${getTypeColor(
            card.type
        )}`}
        onclick={() => isExpanded = !isExpanded}
    >
        <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-gray-700">{card.name}</p>
            {#if card.quantity}
                <p class="text-xs text-gray-500">x{card.quantity}</p>
            {/if}
        </div>

        {#if isExpanded}
            <div class="mt-2 text-sm text-gray-600">
                <p>
                    <span class="font-medium">Description:</span>
                    {card.apiData.desc}
                </p>
                {#if isMonsterCard}
                    <div class="mt-2 space-y-1">
                        <p>
                            <span class="font-medium">ATK:</span>
                            {card.apiData.atk}
                        </p>
                        <p>
                            <span class="font-medium">DEF:</span>
                            {card.apiData.def}
                        </p>
                        <p>
                            <span class="font-medium">Level:</span>
                            {card.apiData.level}
                        </p>
                        <p>
                            <span class="font-medium">Race:</span>
                            {card.apiData.race}
                        </p>
                        <p>
                            <span class="font-medium">Attribute:</span>
                            {card.apiData.attribute}
                        </p>
                    </div>
                {:else}
                    <div class="mt-2">
                        <p>{formatSpellTrapRace()}</p>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}
