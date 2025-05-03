import { supabase } from '$lib/supabaseClient';

// Create a store object instead of individual exported states
export const store = $state({
    draftId: '',
    connectedUsers: 0,
    currentPileIndex: 0,
    draftReady: false,
    participants: [] as string[],
    draftStarted: false,
    piles: [],
    deck: [],
    draftedDeck: [],
    currentPlayer: 0,
    userId: '',
    channel: null,
    draftMethod: '',
    numberOfPlayers: 0,
    numberOfPiles: 3,  // Default to 3
    packSize: 15,       // Default to 5
    allFinished: false,
    lastAcceptedPile: null,
    playerFinished: false, // Added flag for individual player completion

    // Rochester draft specific fields
    rounds: [],            // Array of rounds, each containing packs
    currentRound: 0,       // Current draft round
    currentPackIndex: {},  // Map of player index to their current pack index
    selectedPlayers: new Set(), // Set of players who have made selections for the current turn
    draftStrategy: null,   // The current draft strategy instance
    hasSelected: false, // Flag to indicate if the player has selected a card
});

// Initialize the draft store with data
export function initializeDraft(data) {
    store.draftId = data.id;
    store.draftMethod = data.draftMethod;
    store.numberOfPlayers = data.numberOfPlayers;
    store.numberOfPiles = data.numberOfPiles || 3;
    store.packSize = data.packSize || 15;
}

// Get current user ID
export async function getCurrentUserId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
}

// Reset all fields to default values
export function resetDraftStore() {
    store.piles = [];
    store.deck = [];
    store.rounds = [];
    store.currentRound = 0;
    store.currentPackIndex = {};
    store.selectedPlayers = new Set();
    store.currentPileIndex = 0;
    store.lastAcceptedPile = null;
    store.allFinished = false;
    store.hasSelected = false;
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
            .not('pile', 'is', null)
            .order('pile', { ascending: true });

        if (error) {
            console.error('Error fetching updated piles:', error);
            return;
        }

        store.piles = Array.from({ length: store.numberOfPiles }, (_, i) =>
            updatedPiles.filter(card => card.pile === i)
        );
    } catch (error) {
        console.error('Error updating piles:', error);
    }
}

export function resetCurrentPileIndex() {
    // Find the first non-empty pile
    const firstNonEmptyPileIndex = store.piles.findIndex(pile => pile && pile.length > 0);

    // Set to the first non-empty pile if one exists, otherwise set to 0
    store.currentPileIndex = firstNonEmptyPileIndex >= 0 ? firstNonEmptyPileIndex : 0;
}

export function incrementCurrentPileIndex() {
    if (store.currentPileIndex < store.piles.length - 1) {
        store.currentPileIndex++;
    } else {
        resetCurrentPileIndex();
    }
}

export function addToDraftedDeck(cards) {
    store.draftedDeck = [...store.draftedDeck, ...cards];
}

// Get the current pack for a player in Rochester draft
export function getCurrentPack(playerIndex) {
    if (store.draftMethod !== 'rochester') return null;
    if (store.rounds.length === 0) return null;

    const packIndex = store.currentPackIndex[playerIndex];
    if (packIndex === undefined || store.currentRound >= store.rounds.length) return null;

    return store.rounds[store.currentRound][packIndex];
}
