import { supabase } from '$lib/supabaseClient';
import * as draftStore from '$lib/stores/draftStore.svelte';

export async function handleNextPlayer(payload: {
    playerId: number;
    currentPlayer: number;
    acceptedPileIndex: number;
    finished: boolean;
}) {
    try {
        const { playerId, currentPlayer, acceptedPileIndex, finished } = payload;

        draftStore.store.allFinished = finished;
        draftStore.store.lastAcceptedPile = acceptedPileIndex;

        // Update the piles
        const newPiles = [...draftStore.store.piles];
        for (let i = 0; i < acceptedPileIndex; i++) {
            const newCard = draftStore.store.deck.shift();
            if (newCard) {
                newPiles[i] = [...newPiles[i], newCard];
            }
        }

        const newCard = draftStore.store.deck.shift();

        // If we didn't decline all piles
        if (acceptedPileIndex < newPiles.length) {
            if (newCard) {
                newPiles[acceptedPileIndex] = [newCard];
            } else {
                newPiles[acceptedPileIndex] = [];
            }
        }

        draftStore.store.piles = newPiles;

        // Reset the current pile index for the next player
        draftStore.resetCurrentPileIndex();

        // Update the current player
        draftStore.store.currentPlayer = currentPlayer;

        console.log('Next player updated successfully:', payload);
    } catch (error) {
        console.error('Error handling next player:', error);
    }
}


export async function finishDraft() {
    try {
        // Send a "finished" event to the channel
        await draftStore.store.channel.send({
            type: 'broadcast',
            event: 'draft-finished',
        });

        draftStore.store.allFinished = true;

        console.log('Draft has been finished successfully.');
    } catch (error) {
        console.error('Error finishing the draft:', error);
    }
}

/**
 * Moves to the next player in the draft and updates the draft state in the database.
 */
export async function moveToNextPlayer(
    pileIndex: number,
): Promise<number> {
    try {
        // Check if the deck is empty and all piles are empty
        const isDeckEmpty = draftStore.store.deck.length === 0;
        const areAllPilesEmpty = draftStore.store.piles.every(pile => pile.length === 0);

        // A player is finished when the deck is empty and all piles are empty
        const finished = isDeckEmpty && areAllPilesEmpty;
        draftStore.store.allFinished = finished;

        // If all players are finished, call finishDraft
        if (draftStore.store.allFinished) {
            await finishDraft();
            return draftStore.store.currentPlayer; // Return the current player as no next player exists
        }

        const nextPlayer = (draftStore.store.currentPlayer + 1) % draftStore.store.numberOfPlayers;

        // Broadcast the new player ID, the accepted pile index and the finished status
        await draftStore.store.channel.send({
            type: 'broadcast',
            event: 'new-player',
            payload: {
                playerId: draftStore.store.currentPlayer,
                currentPlayer: nextPlayer,
                acceptedPileIndex: pileIndex,
                finished: finished
            }
        });

        // Update the store
        draftStore.store.currentPlayer = nextPlayer;

        return nextPlayer;
    } catch (error) {
        console.error('Error moving to the next player:', error);
        return draftStore.store.currentPlayer;
    }
}

export async function initializeWinstonDraft(numberOfPiles: number = draftStore.store.numberOfPiles) {
    try {
        // Fetch cards from the `cubes` table ordered by `index`
        const { data: cards, error } = await supabase
            .from('cubes')
            .select('*')
            .eq('draft_id', draftStore.store.draftId)
            .is('owner', null) // Only fetch cards that are not yet owned
            .order('index', { ascending: true });

        if (error) {
            console.error('Error fetching cards for Winston draft:', error);
            return false;
        }

        // Initialize the deck with the fetched cards
        draftStore.store.deck = cards;

        // Create the specified number of piles, each starting with one card
        const newPiles = Array.from({ length: numberOfPiles }, () => [draftStore.store.deck.shift()]);
        draftStore.store.piles = newPiles;

        return true;
    } catch (error) {
        console.error('Error initializing Winston draft:', error);
        return false;
    }
}

export async function handleAcceptPile() {
    const cardIndexes = draftStore.store.piles[draftStore.store.currentPileIndex].map((card) => card.index);
    const acceptedPileIndex = draftStore.store.currentPileIndex;

    try {
        // Add the accepted cards to the local drafted deck
        draftStore.addToDraftedDeck(draftStore.store.piles[draftStore.store.currentPileIndex]);

        // Create a copy of the current piles
        const newPiles = [...draftStore.store.piles];

        // Refresh the pile with one card from the deck if deck is not empty
        if (draftStore.store.deck.length > 0) {
            const newCard = draftStore.store.deck.shift();
            newPiles[draftStore.store.currentPileIndex] = [newCard];
        } else {
            // If deck is empty, set this pile to be empty
            newPiles[draftStore.store.currentPileIndex] = [];
        }

        // Update the store with the new piles
        draftStore.store.piles = newPiles;

        // Move to the next player (broadcasting happens inside moveToNextPlayer)
        await moveToNextPlayer(acceptedPileIndex);

    } catch (error) {
        console.error('Error handling accept pile:', error);
    } finally {
        // Reset the current pile index for the next player
        draftStore.resetCurrentPileIndex();
    }
}

export async function handleDeclineCurrentPile() {
    const isDeckEmpty = draftStore.store.deck.length === 0;

    // Find all non-empty piles
    const nonEmptyPileIndexes = draftStore.store.piles
        .map((pile, index) => pile.length > 0 ? index : -1)
        .filter(index => index !== -1);

    // Check if this is the last non-empty pile and the deck is empty
    const isLastNonEmptyPile = isDeckEmpty &&
        nonEmptyPileIndexes.length === 1 &&
        nonEmptyPileIndexes[0] === draftStore.store.currentPileIndex;

    // If this is the last non-empty pile and the deck is empty, force the player to accept it
    if (isLastNonEmptyPile) {
        console.log("This is the last non-empty pile and the deck is empty. Cannot decline.");
        await handleAcceptPile();
        return;
    }

    if (!isDeckEmpty) {
        const newCard = draftStore.store.deck.shift();

        if (newCard) {
            // Create a copy of the current piles
            const newPiles = [...draftStore.store.piles];

            // Update the current pile by adding the new card
            newPiles[draftStore.store.currentPileIndex] = [
                ...draftStore.store.piles[draftStore.store.currentPileIndex],
                newCard
            ];

            // Update the store with the new piles
            draftStore.store.piles = newPiles;
        } else {
            console.error('No cards left in the deck to add to the pile.');
        }
    }

    // Find the next non-empty pile or handle the decline of all piles
    if (draftStore.store.currentPileIndex < draftStore.store.piles.length - 1) {
        draftStore.incrementCurrentPileIndex();

        // If the new current pile is empty, find the next non-empty pile
        if (draftStore.store.piles[draftStore.store.currentPileIndex].length === 0) {
            // Find the next non-empty pile starting from the current index
            const nextNonEmptyPileIndex = draftStore.store.piles
                .map((pile, index) => ({ pile, index }))
                .filter(({ pile, index }) =>
                    pile.length > 0 && index > draftStore.store.currentPileIndex)
                .map(({ index }) => index)[0];

            if (nextNonEmptyPileIndex !== undefined) {
                // Set the current pile index to the next non-empty pile
                draftStore.store.currentPileIndex = nextNonEmptyPileIndex;
            } else {
                // If no non-empty piles after current index, check for any non-empty piles from the beginning
                const anyNonEmptyPileIndex = draftStore.store.piles
                    .map((pile, index) => ({ pile, index }))
                    .filter(({ pile }) => pile.length > 0)
                    .map(({ index }) => index)[0];

                if (anyNonEmptyPileIndex !== undefined) {
                    draftStore.store.currentPileIndex = anyNonEmptyPileIndex;
                } else {
                    // If all piles are empty, move to the next player
                    await moveToNextPlayer(draftStore.store.piles.length);
                    // Reset the current pile index for the next player
                    draftStore.resetCurrentPileIndex();
                }
            }
        }
    } else {
        // If we're at the last pile, take from the deck if it's not empty
        if (!isDeckEmpty) {
            const newCard = draftStore.store.deck.shift();
            if (newCard) {
                draftStore.addToDraftedDeck([newCard]);
            } else {
                console.error('No cards left in the deck to add to the drafted deck.');
            }
        }

        // Move to the next player (broadcasting happens inside moveToNextPlayer)
        await moveToNextPlayer(draftStore.store.currentPileIndex + 1);

    }
}