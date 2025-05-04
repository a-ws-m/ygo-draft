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
    // Set basic draft properties
    store.draftId = data.id;
    store.draftMethod = data.draftMethod;
    store.numberOfPlayers = data.numberOfPlayers;
    store.numberOfPiles = data.numberOfPiles || 3;
    store.packSize = data.packSize || 15;
    
    // Set optional properties if provided
    if (data.participants) store.participants = data.participants;
    if (data.connectedUsers !== undefined) store.connectedUsers = data.connectedUsers;
    if (data.draftReady !== undefined) store.draftReady = data.draftReady;
    if (data.draftStarted !== undefined) store.draftStarted = data.draftStarted;
    if (data.currentPlayer !== undefined) store.currentPlayer = data.currentPlayer;
    if (data.piles) store.piles = data.piles;
    if (data.deck) store.deck = data.deck;
    if (data.draftedDeck) store.draftedDeck = data.draftedDeck;
    if (data.allFinished !== undefined) store.allFinished = data.allFinished;
    if (data.playerFinished !== undefined) store.playerFinished = data.playerFinished;
    
    // Rochester specific fields
    if (data.rounds) store.rounds = data.rounds;
    if (data.currentRound !== undefined) store.currentRound = data.currentRound;
    if (data.currentPackIndex) store.currentPackIndex = data.currentPackIndex;
    if (data.draftStrategy) store.draftStrategy = data.draftStrategy;
    
    console.log('Draft store initialized with data:', data);
    return store;
}

// Get current user ID
export async function getCurrentUserId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
}

// Reset all fields to default values
export function resetDraftStore() {
    // First clean up any existing channel
    if (store.channel) {
        store.channel.unsubscribe();
        store.channel = null;
    }
    
    // Reset all store properties
    store.draftId = '';
    store.connectedUsers = 0;
    store.currentPileIndex = 0;
    store.draftReady = false;
    store.participants = [];
    store.draftStarted = false;
    store.piles = [];
    store.deck = [];
    store.draftedDeck = [];
    store.currentPlayer = 0;
    store.channel = null;
    store.draftMethod = '';
    store.numberOfPlayers = 0;
    store.numberOfPiles = 3;
    store.packSize = 15;
    store.allFinished = false;
    store.lastAcceptedPile = null;
    store.playerFinished = false;
    store.rounds = [];
    store.currentRound = 0;
    store.currentPackIndex = {};
    store.selectedPlayers = new Set();
    store.draftStrategy = null;
    store.hasSelected = false;
    
    // Keep userId as it's related to the logged-in user, not the draft
    // store.userId = '';
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
