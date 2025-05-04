import { supabase } from "$lib/supabaseClient";

/**
 * Fetches card data from the database or the edge function if not already cached
 * @param cardIds Array of card IDs to fetch
 * @returns Array of card data objects
 */
export async function fetchCardData(cardIds: number[]) {
    try {
        if (!cardIds || cardIds.length === 0) {
            return { cards: [], error: null };
        }

        // Call the Supabase edge function to fetch and cache card data
        const { data, error } = await supabase.functions.invoke("fetch-card-data", {
            body: { cardIds }
        });

        if (error) {
            console.error("Error fetching card data:", error);
            return { cards: [], error: error.message };
        }

        return { cards: data.data, error: null };
    } catch (error) {
        console.error("Error in fetchCardData:", error);
        return { cards: [], error: error.message };
    }
}

/**
 * Maps data from the cards table format to the format required by the components
 * @param card The card data from the database
 * @returns The formatted card object for components
 */
export function formatCardFromDatabase(card: {
    id: number;
    name: string;
    type: string;
    api_data: any;
    image_url: string;
    small_image_url: string;
    quantity?: number;
}) {
    return {
        id: card.id,
        imageUrl: card.image_url,
        smallImageUrl: card.small_image_url,
        name: card.name,
        type: card.type,
        apiData: {
            type: card.api_data.type,
            desc: card.api_data.desc,
            atk: card.api_data.atk,
            def: card.api_data.def,
            level: card.api_data.level,
            race: card.api_data.race,
            attribute: card.api_data.attribute,
            archetype: card.api_data.archetype,
        },
        quantity: card.quantity || 1
    };
}

/**
 * Fetches cube data along with associated card data
 * @param draftId The ID of the draft
 * @returns The cube data with associated card information
 */
export async function fetchCubeWithCardData(draftId: string) {
    try {
        // First fetch cube entries
        const { data: cubeEntries, error: cubeError } = await supabase
            .from("cubes")
            .select("card_id, index, owner, pile")
            .eq("draft_id", draftId);

        if (cubeError) {
            console.error("Error fetching cube entries:", cubeError);
            return { cube: [], error: cubeError.message };
        }

        if (!cubeEntries || cubeEntries.length === 0) {
            return { cube: [], error: null };
        }

        // Extract unique card IDs from cube entries
        const cardIds = [...new Set(cubeEntries.map(entry => entry.card_id))];

        // Fetch the card data for those IDs
        const { cards, error: cardsError } = await fetchCardData(cardIds);

        if (cardsError) {
            return { cube: [], error: cardsError };
        }

        // Create a map for quick lookup of card data by ID
        const cardMap = new Map(cards.map(card => [card.id, card]));

        // Combine cube entries with their card data
        const cube = cubeEntries.map(entry => {
            const card = cardMap.get(entry.card_id);
            if (!card) {
                console.warn(`Card data not found for ID: ${entry.card_id}`);
                return null;
            }

            return {
                ...formatCardFromDatabase(card),
                index: entry.index,
                owner: entry.owner,
                pile: entry.pile
            };
        }).filter(Boolean); // Remove any null entries

        return { cube, error: null };
    } catch (error) {
        console.error("Error in fetchCubeWithCardData:", error);
        return { cube: [], error: error.message };
    }
}