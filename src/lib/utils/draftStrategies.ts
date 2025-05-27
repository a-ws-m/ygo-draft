import * as draftStore from '$lib/stores/draftStore.svelte';
import { handleAcceptPile, handleDeclineCurrentPile, finishDraft } from './winstonDraftLogic';
import { fetchCubeWithCardData } from '$lib/services/cardService';

export interface DraftStrategy {
    initialize(): Promise<boolean>;
    handlePickCard(cardIndex: number | any): Promise<void>;
    handleDeclineOption?(): Promise<void>; // Optional method for Winston
    canDecline?(): boolean; // Optional check for Winston
}

// Winston Draft Implementation
export class WinstonDraftStrategy implements DraftStrategy {
    async initialize(): Promise<boolean> {
        // Updated Winston initialization logic to use cardService
        const { store } = draftStore;

        try {
            // Fetch cards using the cardService
            const { cube, error } = await fetchCubeWithCardData(store.draftId);

            if (error) {
                console.error('Error fetching cards for Winston draft:', error);
                return false;
            }

            // Filter cards that don't have an owner
            const availableCards = cube.filter(card => !card.owner);

            // Initialize the deck with the fetched cards
            store.deck = availableCards;

            // Create the specified number of piles, each starting with one card
            const newPiles = Array.from({ length: store.numberOfPiles }, () => [store.deck.shift()]);
            store.piles = newPiles;

            return true;
        } catch (error) {
            console.error('Error initializing Winston draft:', error);
            return false;
        }
    }

    async handlePickCard(): Promise<void> {
        await handleAcceptPile(); // Reuse existing function
    }

    async handleDeclineOption(): Promise<void> {
        await handleDeclineCurrentPile(); // Reuse existing function
    }

    canDecline(): boolean {
        // Reuse existing logic from the component
        const { store } = draftStore;

        // Can decline if the deck is not empty
        if (store.deck && store.deck.length > 0) {
            return true;
        }

        // Can decline if there's a non-empty pile with index greater than current pile index
        if (
            store.piles &&
            store.currentPileIndex < store.piles.length - 1
        ) {
            return store.piles.some(
                (pile, index) => index > store.currentPileIndex && pile.length > 0
            );
        }

        return false;
    }
}

// Rochester Draft Implementation
export class RochesterDraftStrategy implements DraftStrategy {
    async initialize(): Promise<boolean> {
        const { store } = draftStore;

        try {
            // Fetch cards using the cardService
            const { cube, error } = await fetchCubeWithCardData(store.draftId);

            if (error) {
                console.error('Error fetching cards for Rochester draft:', error);
                return false;
            }

            // Filter cards that haven't been drafted yet
            const availableCards = cube.filter(card => !card.owner);

            // Initialize the deck with the fetched cards
            store.deck = availableCards;

            // Calculate the number of rounds and packs
            const totalCards = store.deck.length;
            const cardsPerRound = store.numberOfPlayers * store.packSize;
            const fullRounds = Math.floor(totalCards / cardsPerRound);
            const remainingCards = totalCards % cardsPerRound;

            // Create rounds and packs
            store.rounds = [];
            let cardIndex = 0;

            // Create full rounds with full-sized packs
            for (let round = 0; round < fullRounds; round++) {
                const roundPacks = [];
                for (let player = 0; player < store.numberOfPlayers; player++) {
                    const pack = [];
                    for (let i = 0; i < store.packSize; i++) {
                        if (cardIndex < store.deck.length) {
                            pack.push(store.deck[cardIndex]);
                            cardIndex++;
                        }
                    }
                    roundPacks.push(pack);
                }
                store.rounds.push(roundPacks);
            }

            // Create the final round if there are remaining cards
            if (remainingCards > 0) {
                // Calculate cards per pack in the final round
                const cardsPerPack = Math.floor(remainingCards / store.numberOfPlayers);

                // Only create final round if each pack will have at least 1 card
                if (cardsPerPack > 0) {
                    const finalRound = [];
                    for (let player = 0; player < store.numberOfPlayers; player++) {
                        const pack = [];
                        for (let i = 0; i < cardsPerPack; i++) {
                            if (cardIndex < store.deck.length) {
                                pack.push(store.deck[cardIndex]);
                                cardIndex++;
                            }
                        }
                        finalRound.push(pack);
                    }

                    // Only add the final round if all packs have cards
                    if (finalRound.every(pack => pack.length === cardsPerPack)) {
                        store.rounds.push(finalRound);
                    }
                }
            }

            // Initialize current round and pack assignments
            store.currentRound = 0;
            store.currentPackIndex = {};

            // Assign initial packs to players
            for (let i = 0; i < store.numberOfPlayers; i++) {
                store.currentPackIndex[i] = i;
            }

            // Track players who have made their selection for the current turn
            store.selectedPlayers = [];

            return true;
        } catch (error) {
            console.error('Error initializing Rochester draft:', error);
            return false;
        }
    }

    async handlePickCard(cardIndex: number): Promise<void> {
        const { store } = draftStore;
        const playerIndex = store.participants.indexOf(store.userId);

        if (playerIndex === -1) {
            console.error('Player not found in participants');
            return;
        }

        // Get the current pack for this player
        const packIndex = store.currentPackIndex[playerIndex];
        const pack = store.rounds[store.currentRound][packIndex];

        // Find the card by index
        const cardToPickIndex = pack.findIndex(card => card.index === cardIndex);
        if (cardToPickIndex === -1) {
            console.error('Card not found in current pack');
            return;
        }

        // Remove the card from the pack
        const [pickedCard] = pack.splice(cardToPickIndex, 1);

        // Add the card to the player's drafted deck
        draftStore.addToDraftedDeck([pickedCard]);

        // Mark this player as having made a selection
        if (!store.selectedPlayers.includes(playerIndex)) {
            store.selectedPlayers.push(playerIndex);
        }
        store.hasSelected = true;

        // Check if this player has completed their draft
        this.checkPlayerDraftComplete(playerIndex);

        // Broadcast the selection
        await store.channel.send({
            type: 'broadcast',
            event: 'player-selected',
            payload: {
                playerIndex,
                packIndex,
                cardIndex
            }
        });

        // Check if all players have made selections
        if (store.selectedPlayers.length === store.numberOfPlayers) {
            await this.rotatePacksAndAdvanceRound();
        }
    }

    // Check if a player has completed their draft
    checkPlayerDraftComplete(playerIndex: number): void {
        const { store } = draftStore;

        // If we're in the last round and all packs are empty or have only 1 card left in other players' packs
        if (store.currentRound === store.rounds.length - 1) {
            const availableCards = store.rounds[store.currentRound].reduce(
                (total, pack) => total + pack.length,
                0
            );

            // If there are no more cards or the remaining cards are in other players' packs
            // and this player has already selected
            if (availableCards === 0 ||
                (store.selectedPlayers.includes(playerIndex) &&
                    store.rounds[store.currentRound][store.currentPackIndex[playerIndex]].length === 0)) {
                store.playerFinished = true;
            }
        }
    }

    async rotatePacksAndAdvanceRound(): Promise<void> {
        const { store } = draftStore;

        // Clear selections for next round
        store.selectedPlayers = [];
        store.hasSelected = false;

        // Check if all packs in the current round are empty
        const allPacksEmpty = store.rounds[store.currentRound].every(pack => pack.length === 0);

        if (allPacksEmpty) {
            // Move to the next round if available
            if (store.currentRound < store.rounds.length - 1) {
                store.currentRound++;

                // Reset pack assignments for the new round
                for (let i = 0; i < store.numberOfPlayers; i++) {
                    store.currentPackIndex[i] = i;
                }
            } else {
                // All rounds complete
                await finishDraft();
                return;
            }
        } else {
            // Rotate the packs - odd rounds go clockwise, even rounds go counter-clockwise
            const direction = store.currentRound % 2 === 0 ? 1 : -1;

            for (let i = 0; i < store.numberOfPlayers; i++) {
                // Calculate the new pack index with wrapping
                let newPackIndex = (store.currentPackIndex[i] + direction) % store.numberOfPlayers;
                if (newPackIndex < 0) newPackIndex += store.numberOfPlayers;

                store.currentPackIndex[i] = newPackIndex;
            }
        }

        // Broadcast the rotation
        await store.channel.send({
            type: 'broadcast',
            event: 'packs-rotated',
            payload: {
                round: store.currentRound,
                packAssignments: store.currentPackIndex
            }
        });
    }
}

// Grid Draft Implementation
export class GridDraftStrategy implements DraftStrategy {
    async initialize(): Promise<boolean> {
        const { store } = draftStore;

        try {
            // Fetch cards using the cardService
            const { cube, error } = await fetchCubeWithCardData(store.draftId);

            if (error) {
                console.error('Error fetching cards for Grid draft:', error);
                return false;
            }

            // Filter cards that don't have an owner
            const availableCards = cube.filter(card => !card.owner);

            // Initialize the deck with the fetched cards
            store.deck = availableCards;

            // Calculate the grid size (stored in numberOfPiles)
            const gridSize = store.numberOfPiles || 3;

            // Initialize the grid with cards
            await this.initializeGrid(gridSize);

            // Initialize round and turn tracking
            store.currentRound = 0;
            store.currentPlayer = 0; // First player starts

            return true;
        } catch (error) {
            console.error('Error initializing Grid draft:', error);
            return false;
        }
    }

    private async initializeGrid(gridSize: number): Promise<void> {
        const { store } = draftStore;

        // Create a 2D array for the grid
        const grid = Array.from({ length: gridSize }, () =>
            Array.from({ length: gridSize }, () => null)
        );

        // Fill the grid with cards from the deck
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                if (store.deck.length > 0) {
                    grid[row][col] = store.deck.shift();
                }
            }
        }

        // Store the grid in the store
        store.grid = grid;
    }

    async handlePickCard(selection: { selectionType: 'row' | 'column', index: number }): Promise<void> {
        const { store } = draftStore;
        const { selectionType, index } = selection;
        const gridSize = store.numberOfPiles || 3;

        // Get the selected cards
        const selectedCards = [];

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

        // Add the selected cards to the player's drafted deck
        draftStore.addToDraftedDeck(selectedCards);

        // Refill the grid if possible
        await this.refillGrid();

        // Move to the next player
        await this.moveToNextPlayer(selectionType, index);
    }

    private async refillGrid(): Promise<void> {
        const { store } = draftStore;
        const gridSize = store.numberOfPiles || 3;

        // Fill empty spots with cards from the deck
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                if (!store.grid[row][col] && store.deck.length > 0) {
                    store.grid[row][col] = store.deck.shift();
                }
            }
        }
    }

    private async moveToNextPlayer(selectionType: 'row' | 'column', index: number): Promise<void> {
        const { store } = draftStore;

        // Check if the current player has completed their draft (reached their target deck size)
        const currentPlayerIndex = store.participants.indexOf(store.userId);
        const playerDraftedCards = store.draftedDeck.length;

        // Use the stored draftedDeckSize value instead of hardcoded value
        const targetDeckSize = store.draftedDeckSize || 60; // Default to 60 if not specified

        // Check if current player has completed their draft
        const hasCompletedDraft = playerDraftedCards >= targetDeckSize;

        // Track completed players in an array if it doesn't exist
        if (!store.completedPlayers) {
            store.completedPlayers = [];
        }

        // Add current player to completed list if they've reached target size
        if (hasCompletedDraft && !store.completedPlayers.includes(currentPlayerIndex)) {
            store.completedPlayers.push(currentPlayerIndex);
        }

        // Check if all players have completed their draft
        const allPlayersCompleted = store.completedPlayers.length === store.numberOfPlayers;

        if (allPlayersCompleted) {
            // All players have reached their target deck size - draft is finished
            await finishDraft();
            return;
        }

        // Move to the next player (skip completed players)
        let nextPlayer = (store.currentPlayer + 1) % store.numberOfPlayers;

        // Skip players who have already completed their draft
        // Fix: directly check if nextPlayer is in completedPlayers
        while (store.completedPlayers.includes(nextPlayer) && !allPlayersCompleted) {
            nextPlayer = (nextPlayer + 1) % store.numberOfPlayers;
        }

        store.currentPlayer = nextPlayer;

        // Set flag to indicate if current player has finished
        store.playerFinished = hasCompletedDraft;

        // Broadcast only the selection information, not the grid
        await store.channel.send({
            type: 'broadcast',
            event: 'grid-selection',
            payload: {
                player: store.currentPlayer,
                selectionType,
                index,
                isDraftFinished: allPlayersCompleted,
                completedPlayers: store.completedPlayers
            }
        });
    }
}

// Factory function to create the appropriate strategy
export function createDraftStrategy(draftMethod: string): DraftStrategy {
    switch (draftMethod.toLowerCase()) {
        case 'winston':
            return new WinstonDraftStrategy();
        case 'rochester':
            return new RochesterDraftStrategy();
        case 'grid':
            return new GridDraftStrategy();
        default:
            throw new Error(`Unsupported draft method: ${draftMethod}`);
    }
}