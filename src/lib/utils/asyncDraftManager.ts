import { supabase } from "$lib/supabaseClient";
import { fetchCardData, formatCardsFromDatabase } from "$lib/services/cardService";

/**
 * Loads the current pack for an asynchronous draft
 * @param draftId - The ID of the draft
 * @param userId - The ID of the user
 * @param packNumber - The current pack number
 * @param packSize - The size of each pack
 * @returns A promise that resolves to the cards in the current pack
 */
export async function loadAsyncDraftPack(
    draftId: string,
    userId: string,
    packNumber: number,
    packSize: number
): Promise<any[]> {
    try {
        // First get the draft details to determine user's position in the participants array
        const { data: draft, error: draftError } = await supabase
            .from("drafts")
            .select("participants, picks_per_pack, drafted_deck_size, pool_size, number_of_players")
            .eq("id", draftId)
            .single();

        if (draftError) {
            console.error("Error fetching draft participants:", draftError);
            throw new Error(`Failed to fetch draft details: ${draftError.message}`);
        }

        // Find the index of the current user in participants array
        const participantIndex = draft.participants.findIndex(id => id === userId);

        if (participantIndex === -1) {
            console.error("User is not a participant in this draft");
            throw new Error("You are not a participant in this draft");
        }

        // Calculate totalPacks similar to getAsyncDraftDetails
        const picksPerPack = draft.picks_per_pack;
        const targetDeckSize = draft.drafted_deck_size || Math.floor(draft.pool_size / draft.number_of_players);
        const totalPacks = Math.ceil(targetDeckSize / picksPerPack);

        // Calculate the starting index for this pack, accounting for user position
        // This ensures each user gets a completely different set of cards
        const userOffset = participantIndex * packSize * totalPacks;
        const baseStartIndex = (packNumber - 1) * packSize;
        const startIndex = baseStartIndex + userOffset;
        const endIndex = startIndex + packSize - 1;

        console.log(`Loading pack for user at position ${participantIndex} with offset ${userOffset}`);
        console.log(`Pack range: ${startIndex} to ${endIndex}`);

        // Get cards for the current pack that haven't been picked yet
        const { data: packCards, error } = await supabase
            .from("cubes")
            .select("*")
            .eq("draft_id", draftId)
            .eq("picked", false)
            .gte("index", startIndex)
            .lte("index", endIndex)
            .order("index", { ascending: true });

        if (error) {
            console.error("Error loading async draft pack:", error);
            throw new Error(`Failed to load pack: ${error.message}`);
        }

        if (!packCards || packCards.length === 0) {
            return [];
        }

        // Extract card IDs from the pack cards
        const cardIds = packCards.map(card => card.card_id);

        // Fetch the full card details
        const { cards, error: cardError } = await fetchCardData(cardIds);

        if (cardError) {
            console.error("Error fetching card details:", cardError);
            throw new Error(`Failed to fetch card details: ${cardError}`);
        }

        // Format the cards with their details
        const formattedCards = formatCardsFromDatabase(cards);

        // Create a map for quick card lookup
        const cardMap = new Map(formattedCards.map(card => [card.id, card]));

        // Combine cube entries with card details
        return packCards.map(entry => ({
            ...cardMap.get(entry.card_id),
            card_index: entry.index,
            draft_id: entry.draft_id,
            picked: entry.picked,
            owner: entry.owner,
            pile: entry.pile,
            custom_rarity: entry.custom_rarity
        }));
    } catch (error) {
        console.error("Error in loadAsyncDraftPack:", error);
        throw error;
    }
}

/**
 * Joins an asynchronous draft by adding the user to the participants
 * @param draftId - The ID of the draft to join
 * @returns A promise that resolves when the user successfully joins the draft
 */
export async function joinAsyncDraft(draftId: string): Promise<boolean> {
    try {
        // Call the Supabase function that handles adding a user to participants
        // This will trigger the check_participants_update function
        const { data, error } = await supabase.rpc('join_async_draft', {
            p_draft_id: draftId
        });

        if (error) {
            console.error("Error joining async draft:", error);
            throw new Error(`Failed to join draft: ${error.message}`);
        }

        console.log("Successfully joined draft:", data);
        return true;
    } catch (error) {
        console.error("Error in joinAsyncDraft:", error);
        throw error;
    }
}

/**
 * Picks a card in an asynchronous draft
 * @param draftId - The ID of the draft
 * @param userId - The ID of the user
 * @param cardIndex - The index of the card being picked
 * @returns A promise that resolves when the card is successfully picked
 */
export async function pickCardInAsyncDraft(
    draftId: string,
    userId: string,
    cardIndex: number
): Promise<void> {
    try {
        // Update the card as picked and assign it to the user
        const { error } = await supabase
            .from("cubes")
            .update({
                picked: true,
                owner: userId
            })
            .eq("draft_id", draftId)
            .eq("index", cardIndex);

        if (error) {
            console.error("Error picking card in async draft:", error);
            throw new Error(`Failed to pick card: ${error.message}`);
        }
    } catch (error) {
        console.error("Error in pickCardInAsyncDraft:", error);
        throw error;
    }
}

/**
 * Loads all cards that have been picked by a user in an asynchronous draft
 * @param draftId - The ID of the draft
 * @param userId - The ID of the user
 * @returns A promise that resolves to the cards picked by the user
 */
export async function loadPickedCards(
    draftId: string,
    userId: string
): Promise<any[]> {
    try {
        // Get all cards that have been picked by this user
        const { data: pickedCards, error } = await supabase
            .from("cubes")
            .select("*")
            .eq("draft_id", draftId)
            .eq("owner", userId)
            .eq("picked", true)
            .order("index", { ascending: true });

        if (error) {
            console.error("Error loading picked cards:", error);
            throw new Error(`Failed to load picked cards: ${error.message}`);
        }

        if (!pickedCards || pickedCards.length === 0) {
            return [];
        }

        // Extract card IDs from the picked cards
        const cardIds = pickedCards.map(card => card.card_id);

        // Fetch the full card details
        const { cards, error: cardError } = await fetchCardData(cardIds);

        if (cardError) {
            console.error("Error fetching card details:", cardError);
            throw new Error(`Failed to fetch card details: ${cardError}`);
        }

        // Format the cards with their details
        const formattedCards = formatCardsFromDatabase(cards);

        // Create a map for quick card lookup
        const cardMap = new Map(formattedCards.map(card => [card.id, card]));

        // Combine cube entries with card details
        return pickedCards.map(entry => ({
            ...cardMap.get(entry.card_id),
            card_index: entry.index,
            draft_id: entry.draft_id,
            picked: entry.picked,
            owner: entry.owner,
            pile: entry.pile,
            custom_rarity: entry.custom_rarity
        }));
    } catch (error) {
        console.error("Error in loadPickedCards:", error);
        throw error;
    }
}

/**
 * Gets the draft details including pack size, picks per pack, and target deck size
 * @param draftId - The ID of the draft
 * @returns A promise that resolves to the draft details
 */
export async function getAsyncDraftDetails(draftId: string): Promise<{
    packSize: number;
    picksPerPack: number;
    targetDeckSize: number;
    totalPacks: number;
    currentPackNumber: number;
    picksRemainingInPack: number;
    participants: string[];
}> {
    try {
        // Get the draft details
        const { data: draft, error } = await supabase
            .from("drafts")
            .select("*")
            .eq("id", draftId)
            .single();

        if (error) {
            console.error("Error getting async draft details:", error);
            throw new Error(`Failed to get draft details: ${error.message}`);
        }

        // Get current user ID
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            throw new Error("No authenticated user found.");
        }

        // Get cards that have already been picked by this user
        const { data: pickedCards, error: pickedError } = await supabase
            .from("cubes")
            .select("*")
            .eq("draft_id", draftId)
            .eq("owner", user.id)
            .eq("picked", true);

        if (pickedError) {
            console.error("Error getting picked cards:", pickedError);
            throw new Error(`Failed to get picked cards: ${pickedError.message}`);
        }

        const packSize = draft.pack_size;
        const picksPerPack = draft.picks_per_pack;
        const targetDeckSize = draft.drafted_deck_size || Math.floor(draft.pool_size / draft.number_of_players);
        const pickedCount = pickedCards?.length || 0;

        // Calculate current pack number and picks remaining
        const currentPackNumber = Math.floor(pickedCount / picksPerPack) + 1;
        const picksRemainingInPack = picksPerPack - (pickedCount % picksPerPack);
        const totalPacks = Math.ceil(targetDeckSize / picksPerPack);

        return {
            packSize,
            picksPerPack,
            targetDeckSize,
            totalPacks,
            currentPackNumber,
            picksRemainingInPack,
            participants: draft.participants || []
        };
    } catch (error) {
        console.error("Error in getAsyncDraftDetails:", error);
        throw error;
    }
}

/**
 * Checks if the async draft is completed for a user
 * @param draftId - The ID of the draft
 * @param userId - The ID of the user
 * @param targetDeckSize - The target deck size for the draft
 * @returns A promise that resolves to true if the draft is completed, false otherwise
 */
export async function isAsyncDraftCompleted(
    draftId: string,
    userId: string,
    targetDeckSize: number
): Promise<boolean> {
    try {
        // Count the number of cards picked by this user
        const { count, error } = await supabase
            .from("cubes")
            .select("*", { count: "exact", head: true })
            .eq("draft_id", draftId)
            .eq("owner", userId)
            .eq("picked", true);

        if (error) {
            console.error("Error checking async draft completion:", error);
            throw new Error(`Failed to check draft completion: ${error.message}`);
        }

        // Draft is completed if the user has picked enough cards
        return (count || 0) >= targetDeckSize;
    } catch (error) {
        console.error("Error in isAsyncDraftCompleted:", error);
        throw error;
    }
}

/**
 * Updates the draft status when a user completes their draft
 * This function is kept for API compatibility but no longer updates completed_users column
 * 
 * @param draftId - The ID of the draft
 * @param userId - The ID of the user
 * @returns A promise that resolves when the draft status is updated
 */
export async function updateDraftStatus(
    draftId: string,
    userId: string
): Promise<void> {
    try {
        // Since we don't need to track completed users in a separate column,
        // we can determine completion by counting picked cards in the cubes table
        console.log(`User ${userId} has completed their draft for draft ${draftId}`);
        
        // No need to update the drafts table, as we'll determine completion status
        // by counting picked cards when needed
    } catch (error) {
        console.error("Error in updateDraftStatus:", error);
        throw error;
    }
}
