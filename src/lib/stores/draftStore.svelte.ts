import { supabase } from '$lib/supabaseClient';

// Create a store object instead of individual exported states
export const store = $state({
    draftId: '',
    connectedUsers: 0,
    currentPileIndex: 0,
    draftReady: false,
    participants: [],
    draftStarted: false,
    piles: [],
    deck: [],
    draftedDeck: [],
    currentPlayer: 0,
    minimumDeckSize: 40,
    userId: '',
    channel: null,
    draftMethod: '',
    numberOfPlayers: 0
});

// Initialize the draft store with data
export function initializeDraft(data) {
    store.draftId = data.id;
    store.draftMethod = data.draftMethod;
    store.numberOfPlayers = data.numberOfPlayers;
}

// Helpers to update state without returning values
export async function updateDeck() {
    try {
        const { data: remainingCards, error } = await supabase
            .from('cubes')
            .select('*')
            .eq('draft_id', store.draftId)
            .is('owner', null)
            .is('pile', null)
            .order('index', { ascending: true });

        if (error) {
            console.error('Error fetching remaining cards for the deck:', error);
            return;
        }

        store.deck = remainingCards;
    } catch (error) {
        console.error('Error updating deck:', error);
    }
}

export async function updatePiles() {
    try {
        const { data: updatedPiles, error } = await supabase
            .from('cubes')
            .select('*')
            .eq('draft_id', store.draftId)
            .is('pile', null)
            .not('owner', null)
            .order('pile', { ascending: true });

        if (error) {
            console.error('Error fetching updated piles:', error);
            return;
        }

        store.piles = Array.from({ length: 3 }, (_, i) =>
            updatedPiles.filter(card => card.pile === i)
        );
    } catch (error) {
        console.error('Error updating piles:', error);
    }
}

export function resetCurrentPileIndex() {
    store.currentPileIndex = 0;
}

export function incrementCurrentPileIndex() {
    if (store.currentPileIndex < store.piles.length - 1) {
        store.currentPileIndex++;
    } else {
        resetCurrentPileIndex();
    }
}

export function updateCurrentPlayer(newPlayer) {
    store.currentPlayer = newPlayer;
}

export function addToDraftedDeck(cards) {
    store.draftedDeck = [...store.draftedDeck, ...cards];
}

export function setUserId(id) {
    store.userId = id;
}

export function setChannel(newChannel) {
    store.channel = newChannel;
}

export function setDraftStarted(started) {
    store.draftStarted = started;
}

export function setDraftReady(ready) {
    store.draftReady = ready;
}

export function setConnectedUsers(count) {
    store.connectedUsers = count;
}

export function setParticipants(newParticipants) {
    store.participants = newParticipants;
}