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
                const { player, selectionType, index, grid, isDraftFinished } = payload;
                
                // Update the grid
                store.grid = grid;
                
                // Update the current player
                store.currentPlayer = player;
                
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