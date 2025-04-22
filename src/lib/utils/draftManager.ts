import { supabase } from "$lib/supabaseClient";

/**
 * Starts the draft by updating the database with the list of participants and setting the draft status to active.
 * @param draftId - The ID of the draft.
 * @param participants - An array of user IDs participating in the draft.
 * @returns A promise that resolves when the draft is successfully started.
 */
export async function startDraftInDB(draftId: string, participants: string[]) {
    try {
        // Update the draft with the list of participants and set the status to active
        const { error } = await supabase
            .from("drafts")
            .update({
                participants,
                status: "active",
            })
            .eq("id", draftId);

        if (error) {
            console.error("Error updating draft in database:", error);
            throw new Error("Failed to start the draft.");
        }

        console.log("Draft successfully started in the database.");
    } catch (error) {
        console.error("Error starting draft:", error);
        throw error;
    }
}

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param array - The array to shuffle.
 * @returns The shuffled array.
 */
function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
    return array;
}

/**
 * Creates a new draft in the database and assigns shuffled indexes to the cube cards.
 * @param draftMethod - The drafting method (e.g., "winston" or "rochester").
 * @param poolSize - The size of the card pool.
 * @param numberOfPlayers - The number of players in the draft.
 * @param cube - The cube data (array of cards).
 * @returns A promise that resolves with the draft ID.
 */
export async function createDraft(
    draftMethod: string,
    poolSize: number,
    numberOfPlayers: number,
    cube: { name: string; quantity: number; type: string; apiData: any }[]
): Promise<string> {
    try {
        // Create a new draft session in the `drafts` table
        const { data: draft, error: draftError } = await supabase
            .from("drafts")
            .insert({
                draft_method: draftMethod,
                pool_size: poolSize,
                number_of_players: numberOfPlayers,
                connected_users: 0,
                status: "waiting",
            })
            .select()
            .single();

        if (draftError) throw draftError;

        // Expand the cube into individual cards based on their quantity
        const expandedCube = [];
        for (const card of cube) {
            for (let i = 0; i < card.quantity; i++) {
                expandedCube.push({
                    draft_id: draft.id,
                    card_name: card.name,
                    type: card.type,
                    apiData: card.apiData,
                });
            }
        }

        // Shuffle the expanded cube
        const shuffledCube = shuffleArray(expandedCube);

        // Assign shuffled indexes to the cards
        const cubeWithIndexes = shuffledCube.map((card, index) => ({
            ...card,
            index, // Assign a unique index after shuffling
        }));

        // Insert cube data into the `cubes` table
        const { error: cubeError } = await supabase.from("cubes").insert(cubeWithIndexes);
        if (cubeError) throw cubeError;

        console.log("Draft and cube successfully created in the database.");
        return draft.id;
    } catch (error) {
        console.error("Error creating draft:", error);
        throw error;
    }
}

/**
 * Assigns cards in a pile to a player by updating the `cubes` table.
 * @param draftId - The ID of the draft.
 * @param playerId - The ID of the player.
 * @param cardIndexes - The indexes of the cards to assign.
 */
export async function assignCardsToPlayer(draftId: string, playerId: string, cardIndexes: number[]) {
    try {
        const { error } = await supabase
            .from("cubes")
            .update({ owner: playerId, pile: null }) // Remove the card from the pile and assign it to the player
            .eq("draft_id", draftId)
            .in("index", cardIndexes);

        if (error) {
            console.error("Error assigning cards to player:", error);
            throw new Error("Failed to assign cards to player.");
        }

        console.log(`Cards successfully assigned to player ${playerId}.`);
    } catch (error) {
        console.error("Error assigning cards to player:", error);
        throw error;
    }
}

/**
 * Updates the current player in the `drafts` table.
 * @param draftId - The ID of the draft.
 * @param currentPlayer - The index of the current player.
 */
export async function updateCurrentPlayer(draftId: string, currentPlayer: number) {
    try {
        const { error } = await supabase
            .from("drafts")
            .update({ current_player: currentPlayer })
            .eq("id", draftId);

        if (error) {
            console.error("Error updating current player:", error);
            throw new Error("Failed to update current player.");
        }

        console.log(`Current player updated to ${currentPlayer}.`);
    } catch (error) {
        console.error("Error updating current player:", error);
        throw error;
    }
}