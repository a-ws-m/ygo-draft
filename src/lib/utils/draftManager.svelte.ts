import { createDraftStrategy } from './draftStrategies';
import * as draftStore from '$lib/stores/draftStore.svelte';
import { handleNextPlayer } from './winstonDraftLogic';

export async function initializeDraft() {
    const { store } = draftStore;

    // Reset the store for a fresh start
    draftStore.resetDraftStore();

    // Create the appropriate draft strategy
    const strategy = createDraftStrategy(store.draftMethod);
    store.draftStrategy = strategy;

    // Initialize the draft using the strategy
    return await strategy.initialize();
}

export async function handleCardSelection(cardIndex: number) {
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

                // Find and remove the card
                const cardToPickIndex = pack.findIndex(card => card.index === cardIndex);
                if (cardToPickIndex !== -1) {
                    pack.splice(cardToPickIndex, 1);
                }

                // Add player to the selected set
                store.selectedPlayers.add(playerIndex);
            }
            break;

        case 'packs-rotated':
            // Rochester-specific event
            if (store.draftMethod === 'rochester') {
                const { round, packAssignments } = payload;

                store.currentRound = round;
                store.currentPackIndex = packAssignments;
                store.selectedPlayers.clear();
                store.hasSelected = false;
            }
            break;

        case 'draft-finished':
            store.allFinished = true;
            break;
    }
}