import { supabase } from '$lib/supabaseClient';
import { assignCardsToPlayer, updateDraftState } from './draftManager';
import * as draftStore from '$lib/stores/draftStore.svelte';

/**
 * Moves to the next player in the draft and updates the draft state in the database.
 */
export async function moveToNextPlayer(
    pileIndex: number | null = null,
    cardIndexes: number[] = []
): Promise<number> {
    try {
        // Fetch the number of cards each player has from the `player_card_counts` view
        const { data: playerCardCounts, error } = await supabase
            .from('player_card_counts')
            .select('*');

        if (error) {
            console.error('Error fetching player card counts:', error);
            return draftStore.store.currentPlayer;
        }

        // Create a map of player IDs to their card counts
        const cardCounts = Object.fromEntries(
            playerCardCounts.map((entry) => [entry.owner, entry.card_count])
        );

        // Find the next player who hasn't reached the minimum deck size
        let nextPlayer = draftStore.store.currentPlayer;
        let attempts = 0;
        do {
            nextPlayer = (nextPlayer + 1) % draftStore.store.participants.length;
            attempts++;
        } while (
            cardCounts[draftStore.store.participants[nextPlayer]] >= draftStore.store.minimumDeckSize &&
            attempts < draftStore.store.participants.length
        );

        // If all players have the required number of cards, end the draft
        if (attempts >= draftStore.store.participants.length) {
            console.log('All players have the required number of cards. Ending draft.');
            return nextPlayer; // Optionally, handle draft completion here
        }

        // Update the draft state in the database
        await updateDraftState(
            draftStore.store.draftId, 
            nextPlayer, 
            pileIndex, 
            cardIndexes, 
            draftStore.store.participants[nextPlayer],
            draftStore.store.piles
        );

        // Update the store
        draftStore.store.currentPlayer = nextPlayer;
        
        // Broadcast the new player ID to all clients
        await draftStore.store.channel.send({
            type: 'broadcast',
            event: 'new-player',
            payload: {
                currentPlayer: nextPlayer,
            }
        });
        
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

        // Update the `pile` column in the `cubes` table
        for (let i = 0; i < draftStore.store.piles.length; i++) {
            const pileCardIndexes = draftStore.store.piles[i].map((card) => card.index);
            await supabase
                .from('cubes')
                .update({ pile: i }) // Assign the pile index
                .eq('draft_id', draftStore.store.draftId)
                .in('index', pileCardIndexes);
        }

        // Update the deck with the remaining cards
        await draftStore.updateDeck();

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

    const playerId = draftStore.store.participants[draftStore.store.currentPlayer];
    const cardIndexes = draftStore.store.piles[draftStore.store.currentPileIndex].map((card) => card.index);
    const acceptedPileIndex = draftStore.store.currentPileIndex;

    try {
        // Assign the cards in the pile to the current player in the database
        await assignCardsToPlayer(draftStore.store.draftId, playerId, cardIndexes);

        // Add the accepted cards to the local drafted deck
        draftStore.addToDraftedDeck(draftStore.store.piles[draftStore.store.currentPileIndex]);

        // Refresh the pile with one card from the deck
        const newCard = draftStore.store.deck.pop();
        if (newCard) {
            // Create a copy of the current piles
            const newPiles = [...draftStore.store.piles];
            
            // Update the current pile by adding the new card
            newPiles[draftStore.store.currentPileIndex] = [ newCard ];
            
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
        
        await draftStore.updateDeck();
    } else {
        console.error('No cards left in the deck to add to the pile.');
    }

    if (draftStore.store.currentPileIndex < draftStore.store.piles.length - 1) {
        draftStore.incrementCurrentPileIndex();
        
        // Update piles in the database without changing the player
        await updateDraftState(
            draftStore.store.draftId,
            draftStore.store.currentPlayer,
            draftStore.store.currentPileIndex,
            [],  // No cards being assigned to a player
            draftStore.store.participants[draftStore.store.currentPlayer],
            draftStore.store.piles
        );
    } else {
        // If all piles have been declined, move to the next player
        // (broadcasting happens inside moveToNextPlayer)
        await moveToNextPlayer();
        
        // Reset the current pile index for the next player
        draftStore.resetCurrentPileIndex();
    }
}