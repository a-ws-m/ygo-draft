import { createDraftStrategy } from './draftStrategies';
import * as draftStore from '$lib/stores/draftStore.svelte';
import { handleNextPlayer } from './winstonDraftLogic';

export async function initializeDraft() {
    const { store } = draftStore;

    // Create the appropriate draft strategy
    const strategy = createDraftStrategy(store.draftMethod);
    store.draftStrategy = strategy;

    // Initialize the draft using the strategy
    return await strategy.initialize();
}

// Update the parameter type to be more flexible - accept either a number or a selection object
export async function handleCardSelection(cardIndex: number | { selectionType: 'row' | 'column', index: number }) {
    const { store } = draftStore;

    if (!store.draftStrategy) {
        console.error('No draft strategy initialized');
        return;
    }

    await store.draftStrategy.handlePickCard(cardIndex);
}

export async function handleCardDecline() {
    const { store } = draftStore;

    if (!store.draftStrategy || !store.draftStrategy.handleDeclineOption) {
        console.error('This draft type does not support declining');
        return;
    }

    await store.draftStrategy.handleDeclineOption();
}

export function canPlayerDeclineCurrentOption() {
    const { store } = draftStore;

    if (!store.draftStrategy || !store.draftStrategy.canDecline) {
        return false;
    }

    return store.draftStrategy.canDecline();
}

// Handles broadcast events for different draft types
export async function handleDraftBroadcast(event: string, payload: any) {
    const { store } = draftStore;

    switch (event) {
        case 'draft-started':
            store.draftStarted = true;
            await initializeDraft();
            break;

        case 'new-player':
            // Winston-specific event
            if (store.draftMethod === 'winston') {
                await handleNextPlayer(payload);
            }
            break;

        case 'player-selected':
            // Rochester-specific event
            if (store.draftMethod === 'rochester') {
                const { playerIndex, packIndex, cardIndex } = payload;

                // Find the pack
                const pack = store.rounds[store.currentRound][packIndex];

                if (pack) {
                    // Find and remove the card
                    const cardToPickIndex = pack.findIndex(card => card.index === cardIndex);
                    if (cardToPickIndex !== -1) {
                        pack.splice(cardToPickIndex, 1);
                    }

                    // Add player to the selected array if not already there
                    if (!store.selectedPlayers.includes(playerIndex)) {
                        store.selectedPlayers.push(playerIndex);
                    }

                    // Check if the current player has completed drafting in the last round
                    const currentPlayerIndex = store.participants.indexOf(store.userId);
                    if (currentPlayerIndex === playerIndex &&
                        store.currentRound === store.rounds.length - 1) {
                        // Check if player's pack is empty
                        const currentPlayerPack = store.rounds[store.currentRound][store.currentPackIndex[currentPlayerIndex]];
                        if (!currentPlayerPack || currentPlayerPack.length === 0) {
                            store.playerFinished = true;
                        }
                    }
                }
            }
            break;

        case 'packs-rotated':
            // Rochester-specific event
            if (store.draftMethod === 'rochester') {
                const { round, packAssignments } = payload;

                store.currentRound = round;
                store.currentPackIndex = packAssignments;
                store.selectedPlayers = [];
                store.hasSelected = false;

                // Check if the player now has an empty pack in the final round
                const playerIndex = store.participants.indexOf(store.userId);
                if (playerIndex !== -1 && store.currentRound === store.rounds.length - 1) {
                    const currentPack = store.rounds[store.currentRound][store.currentPackIndex[playerIndex]];
                    if (!currentPack || currentPack.length === 0) {
                        // Player has an empty pack in the final round - they are finished
                        store.playerFinished = true;
                    }
                }
            }
            break;

        case 'grid-selection':
            // Grid-specific event
            if (store.draftMethod === 'grid') {
                const { player, selectionType, index, isDraftFinished, completedPlayers } = payload;
                const gridSize = store.numberOfPiles || 3;

                // Get the selected cards based on the selection info
                const selectedCards = [];

                // Process the selection locally
                if (selectionType === 'row') {
                    // Get all cards from the selected row
                    selectedCards.push(...store.grid[index].filter(card => card));

                    // Clear the selected row
                    for (let col = 0; col < gridSize; col++) {
                        store.grid[index][col] = null;
                    }
                } else if (selectionType === 'column') {
                    // Get all cards from the selected column
                    for (let row = 0; row < gridSize; row++) {
                        if (store.grid[row][index]) {
                            selectedCards.push(store.grid[row][index]);
                            store.grid[row][index] = null;
                        }
                    }
                }

                // Refill empty spots with cards from the deck
                for (let row = 0; row < gridSize; row++) {
                    for (let col = 0; col < gridSize; col++) {
                        if (!store.grid[row][col] && store.deck.length > 0) {
                            store.grid[row][col] = store.deck.shift();
                        }
                    }
                }

                // Update the current player
                store.currentPlayer = player;

                // Update completed players
                if (completedPlayers) {
                    store.completedPlayers = completedPlayers;
                }

                // Check if the draft is finished
                if (isDraftFinished) {
                    store.allFinished = true;
                }
            }
            break;

        case 'draft-finished':
            store.allFinished = true;
            break;
    }
}