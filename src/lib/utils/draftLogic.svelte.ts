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

        // Update the finished status of the previous player
        draftStore.store.finished[playerId] = finished;

        // Update the piles
        const newPiles = [...draftStore.store.piles];
        for (let i = 0; i < acceptedPileIndex; i++) {
            const newCard = draftStore.store.deck.pop();
            if (newCard) {
                newPiles[i] = [...newPiles[i], newCard];
            } else {
                console.error('No cards left in the deck to add to the pile.');
            }
        }
        
        const newCard = draftStore.store.deck.pop();

        // If we didn't decline all piles
        if (acceptedPileIndex < newPiles.length) {
            if (newCard) {
                newPiles[acceptedPileIndex] = [newCard];
            } else {
                console.error('No cards left in the deck to add to the pile.');
            }
        }

        draftStore.store.piles = newPiles;

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

        const finished = draftStore.store.draftedDeck.length >= draftStore.store.minimumDeckSize;
        draftStore.store.finished[draftStore.store.currentPlayer] = finished;

        let nextPlayer = (draftStore.store.currentPlayer + 1) % draftStore.store.numberOfPlayers;

        // Check if the next player is finished, and keep incrementing until we find one who isn't
        let allFinished = true;
        for (let i = 0; i < draftStore.store.numberOfPlayers; i++) {
            if (!draftStore.store.finished[nextPlayer]) {
                allFinished = false;
                break;
            }
            nextPlayer = (nextPlayer + 1) % draftStore.store.numberOfPlayers;
        }

        // If all players are finished, call finishDraft
        if (allFinished) {
            await finishDraft();
            return draftStore.store.currentPlayer; // Return the current player as no next player exists
        }

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

export async function initializeWinstonDraft(numberOfPiles: number) {
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
    if (!draftStore.store.deck || draftStore.store.deck.length === 0) {
        console.error('Deck is undefined or empty. Cannot handle accept pile.');
        return;
    }

    const cardIndexes = draftStore.store.piles[draftStore.store.currentPileIndex].map((card) => card.index);
    const acceptedPileIndex = draftStore.store.currentPileIndex;

    try {

        // Add the accepted cards to the local drafted deck
        draftStore.addToDraftedDeck(draftStore.store.piles[draftStore.store.currentPileIndex]);

        // Refresh the pile with one card from the deck
        const newCard = draftStore.store.deck.pop();
        if (newCard) {
            // Create a copy of the current piles
            const newPiles = [...draftStore.store.piles];

            // Update the current pile by adding the new card
            newPiles[draftStore.store.currentPileIndex] = [newCard];

            // Update the store with the new piles
            draftStore.store.piles = newPiles;

        } else {
            console.error('No cards left in the deck to add to the pile.');
        }

        // Move to the next player (broadcasting happens inside moveToNextPlayer)
        await moveToNextPlayer(acceptedPileIndex, cardIndexes);

    } catch (error) {
        console.error('Error handling accept pile:', error);
    } finally {
        // Reset the current pile index for the next player
        draftStore.resetCurrentPileIndex();
    }
}

export async function handleDeclineCurrentPile() {
    if (!draftStore.store.deck || draftStore.store.deck.length === 0) {
        console.error('Deck is undefined or empty. Cannot handle decline pile.');
        return;
    }

    const newCard = draftStore.store.deck.pop();

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

    if (draftStore.store.currentPileIndex < draftStore.store.piles.length - 1) {
        draftStore.incrementCurrentPileIndex();
    } else {
        const newCard = draftStore.store.deck.pop();
        if (newCard) {
            draftStore.addToDraftedDeck([newCard]);
        } else {
            console.error('No cards left in the deck to add to the drafted deck.');
        }
        // If all piles have been declined, move to the next player
        // (broadcasting happens inside moveToNextPlayer)
        await moveToNextPlayer(draftStore.store.currentPileIndex + 1);

        // Reset the current pile index for the next player
        draftStore.resetCurrentPileIndex();
    }
}