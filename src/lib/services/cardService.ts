import { supabase } from "$lib/supabaseClient";

// Cache for storing signed URLs with their expiration timestamps
interface SignedUrlCache {
    url: string;
    expiresAt: number; // Unix timestamp in milliseconds
}

// URL cache: cardId_size -> {url, expiresAt}
const signedUrlCache = new Map<string, SignedUrlCache>();

/**
 * Constructs the storage path for a card image
 * @param cardId The ID of the card
 * @param isSmall Whether to use the small image bucket
 * @returns The storage path for the image
 */
export function getCardImagePath(cardId: number, isSmall: boolean = false): string {
    const bucketName = isSmall ? 'card_images_small' : 'card_images';
    const fileName = `${cardId}${isSmall ? '_small' : ''}.jpg`;
    return fileName;
}

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

        let existingCards: any[] = [];
        let dbError = null;

        // Handle pagination for large card sets due to Supabase's 1000 row limit
        if (cardIds.length > 1000) {
            // Process in chunks of 1000
            const chunks = [];
            for (let i = 0; i < cardIds.length; i += 1000) {
                chunks.push(cardIds.slice(i, i + 1000));
            }

            // Fetch each chunk and combine results
            for (const chunk of chunks) {
                const { data: chunkData, error: chunkError } = await supabase
                    .from('cards')
                    .select('*')
                    .in('id', chunk);

                if (chunkError) {
                    dbError = chunkError;
                    console.error("Error fetching cards from database:", chunkError);
                    break;
                }

                if (chunkData) {
                    existingCards = [...existingCards, ...chunkData];
                }
            }
        } else {
            // For smaller sets, use the original approach
            const { data, error } = await supabase
                .from('cards')
                .select('*')
                .in('id', cardIds);

            dbError = error;
            existingCards = data || [];

            if (error) {
                console.error("Error fetching cards from database:", error);
            }
        }

        if (dbError) {
            // Continue to try the edge function as fallback
        } else {
            // Check if all requested cards were found in the database
            const foundCardIds = existingCards.map(card => card.id);
            const missingCardIds = cardIds.filter(id => !foundCardIds.includes(id));

            // If all cards were found in the database, return them
            if (missingCardIds.length === 0) {
                return { cards: existingCards, error: null };
            }

            // If some cards are missing, we need to fetch them
            // Only request the missing card IDs from the edge function
            cardIds = missingCardIds;
        }

        // Call the Supabase edge function to fetch and cache missing card data
        const { data, error } = await supabase.functions.invoke("fetch-card-data", {
            body: { cardIds }
        });

        if (error) {
            console.error("Error fetching card data:", error);
            return { cards: existingCards || [], error: error.message };
        }

        // Combine existing cards with newly fetched cards
        const allCards = [...(existingCards || []), ...(data.data || [])];

        // Remove duplicates (in case there were any)
        const uniqueCards = Array.from(
            new Map(allCards.map(card => [card.id, card])).values()
        );

        return { cards: uniqueCards, error: null };
    } catch (error) {
        console.error("Error in fetchCardData:", error);
        return { cards: [], error: error.message };
    }
}

/**
 * Gets a signed URL for a card image stored in the private storage bucket
 * @param cardId The ID of the card
 * @param isSmall Whether to get the small image
 * @returns Promise with the signed URL string
 */
export async function getSignedImageUrl(cardId: number, isSmall: boolean = false): Promise<string> {
    const bucketName = isSmall ? 'card_images_small' : 'card_images';
    const fileName = getCardImagePath(cardId, isSmall);
    const cacheKey = `${cardId}_${isSmall ? 'small' : 'full'}`;

    // Check if we have a valid cached URL
    const cached = signedUrlCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
        // Use cached URL if it's still valid
        return cached.url;
    }

    try {
        const tenDaysInSeconds = 10 * 24 * 60 * 60; // 10 days in seconds
        const { data, error } = await supabase
            .storage
            .from(bucketName)
            .createSignedUrl(fileName, tenDaysInSeconds);

        if (error) {
            console.error("Error creating signed URL:", error);
            // Return a fallback URL or placeholder
            return `https://via.placeholder.com/400x586?text=Image+Not+Found`;
        }

        // Cache the URL with its expiration time
        // Set expiration a bit earlier than the actual expiry to be safe
        const expiresAt = now + (tenDaysInSeconds * 1000) - (60 * 1000); // 1 minute buffer
        signedUrlCache.set(cacheKey, {
            url: data.signedUrl,
            expiresAt
        });

        return data.signedUrl;
    } catch (error) {
        console.error("Error getting signed image URL:", error);
        return `https://via.placeholder.com/400x586?text=Image+Not+Found`;
    }
}

/**
 * Gets multiple signed URLs for card images in a single batch request
 * @param cardIds Array of card IDs
 * @param isSmall Whether to get small images
 * @returns Map of card IDs to their signed URLs
 */
export async function getMultipleSignedImageUrls(cardIds: number[], isSmall: boolean = false): Promise<Map<number, string>> {
    const bucketName = isSmall ? 'card_images_small' : 'card_images';
    const result = new Map<number, string>();
    const now = Date.now();
    const tenDaysInSeconds = 10 * 24 * 60 * 60; // 10 days in seconds

    // Filter out IDs that we already have cached URLs for
    const uncachedIds: number[] = [];
    const paths: string[] = [];

    // Check cache first and prepare uncached IDs
    for (const cardId of cardIds) {
        const cacheKey = `${cardId}_${isSmall ? 'small' : 'full'}`;
        const cached = signedUrlCache.get(cacheKey);

        if (cached && cached.expiresAt > now) {
            // Use cached URL if it's still valid
            result.set(cardId, cached.url);
        } else {
            uncachedIds.push(cardId);
            paths.push(getCardImagePath(cardId, isSmall));
        }
    }

    // If all URLs were in cache, return early
    if (uncachedIds.length === 0) {
        return result;
    }

    try {
        // Batch request for all uncached URLs
        const { data, error } = await supabase
            .storage
            .from(bucketName)
            .createSignedUrls(paths, tenDaysInSeconds);

        if (error) {
            console.error("Error creating batch signed URLs:", error);
            // Set fallback URLs for the uncached IDs
            for (const cardId of uncachedIds) {
                result.set(cardId, `https://via.placeholder.com/400x586?text=Image+Not+Found`);
            }
            return result;
        }

        // Process and cache the results
        for (let i = 0; i < uncachedIds.length; i++) {
            const cardId = uncachedIds[i];
            const signedData = data[i];

            // Handle case where a specific URL might have failed
            if (signedData && signedData.signedUrl) {
                const cacheKey = `${cardId}_${isSmall ? 'small' : 'full'}`;
                const expiresAt = now + (tenDaysInSeconds * 1000) - (60 * 1000); // 1 minute buffer

                // Cache the URL
                signedUrlCache.set(cacheKey, {
                    url: signedData.signedUrl,
                    expiresAt
                });

                result.set(cardId, signedData.signedUrl);
            } else {
                result.set(cardId, `https://via.placeholder.com/400x586?text=Image+Not+Found`);
            }
        }

        return result;
    } catch (error) {
        console.error("Error getting batch signed image URLs:", error);
        // Set fallback URLs for the uncached IDs
        for (const cardId of uncachedIds) {
            result.set(cardId, `https://via.placeholder.com/400x586?text=Image+Not+Found`);
        }
        return result;
    }
}

/**
 * Maps data from the cards table format to the format required by the components
 * Processes multiple cards in a batch for efficiency
 * @param cards Array of card data from the database
 * @returns Array of formatted card objects for components
 */
export async function formatCardsFromDatabase(cards: Array<{
    id: number;
    name: string;
    type: string;
    api_data: any;
    quantity?: number;
    custom_rarity?: string;
}>): Promise<any[]> {
    if (cards.length === 0) {
        return [];
    }

    // Get all card IDs for image URLs
    const cardIds = cards.map(card => card.id);

    // Fetch all full-size and small image URLs in parallel using the batch method
    const [fullSizeUrls, smallSizeUrls] = await Promise.all([
        getMultipleSignedImageUrls(cardIds, false),
        getMultipleSignedImageUrls(cardIds, true)
    ]);

    // Format each card with the now-available URLs
    return cards.map(card => ({
        id: card.id,
        imageUrl: fullSizeUrls.get(card.id) || '',
        smallImageUrl: smallSizeUrls.get(card.id) || '',
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
            rarity: card.api_data.misc_info[0]?.md_rarity,
        },
        quantity: card.quantity || 1,
        custom_rarity: card.custom_rarity || null
    }));
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
            .select("card_id, index, owner, pile, custom_rarity")
            .eq("draft_id", draftId)
            .order("index", { ascending: true });

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

        // Prepare array of cards to format
        const cardsToFormat = cardIds
            .map(id => cardMap.get(id))
            .filter(Boolean); // Remove any undefined entries

        // Format all cards in a single batch operation
        const formattedCards = await formatCardsFromDatabase(cardsToFormat);

        // Create a map of formatted cards for quick lookup
        const formattedCardMap = new Map(formattedCards.map(card => [card.id, card]));

        // Combine cube entries with their card data
        const cube = cubeEntries.map(entry => {
            const formattedCard = formattedCardMap.get(entry.card_id);
            if (!formattedCard) {
                console.warn(`Formatted card data not found for ID: ${entry.card_id}`);
                return null;
            }

            return {
                ...formattedCard,
                index: entry.index,
                owner: entry.owner,
                pile: entry.pile,
                custom_rarity: entry.custom_rarity || formattedCard.custom_rarity
            };
        }).filter(Boolean); // Remove any null entries

        return { cube, error: null };
    } catch (error) {
        console.error("Error in fetchCubeWithCardData:", error);
        return { cube: [], error: error.message };
    }
}