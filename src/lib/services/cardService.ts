import { supabase } from "$lib/supabaseClient";

// Cache for storing S3 URLs to reduce redundant calls
interface UrlCache {
    url: string;
    lastChecked: number; // Unix timestamp in milliseconds
}

// URL cache: cardId_size -> {url, lastChecked}
const imageUrlCache = new Map<string, UrlCache>();

// S3 bucket configuration for images
const S3_BUCKET_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1';
const S3_BUCKET_AVIF = import.meta.env.VITE_S3_BUCKET_AVIF || 'ygo-card-images-avif';
const USE_DIRECT_S3 = true; // Flag to toggle between direct S3 URLs and Supabase Storage

/**
 * Constructs the storage path for a card image
 * @param cardId The ID of the card
 * @param isSmall Whether to use the small image bucket
 * @returns The storage path for the image
 */
export function getCardImagePath(cardId: number, isSmall: boolean = false): string {
    return `${cardId}${isSmall ? '_small' : ''}.avif`;
}

/**
 * Generates a direct S3 URL for a card image
 * @param cardId The ID of the card
 * @param isSmall Whether to get the small image
 * @returns URL string pointing to the S3 object
 */
export function getDirectS3Url(cardId: number, isSmall: boolean = false): string {
    // Generate the filename
    const fileName = `${cardId}${isSmall ? '_small' : ''}.avif`;
    
    // Construct and return the S3 URL
    return `https://${S3_BUCKET_AVIF}.s3.${S3_BUCKET_REGION}.amazonaws.com/${fileName}`;
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
 * Gets a direct URL for a card image from S3
 * @param cardId The ID of the card
 * @param isSmall Whether to get the small image
 * @returns Promise with the URL string
 */
export async function getImageUrl(cardId: number, isSmall: boolean = false): Promise<string> {
    const cacheKey = `${cardId}_${isSmall ? 'small' : 'full'}`;
    const now = Date.now();
    
    // Use cache if available and not too old (1 day cache validity)
    const cached = imageUrlCache.get(cacheKey);
    if (cached && (now - cached.lastChecked) < 24 * 60 * 60 * 1000) {
        return cached.url;
    }
    
    try {
        // Get a direct S3 URL for the AVIF image
        const imageUrl = getDirectS3Url(cardId, isSmall);
        
        // Verify the image exists with a HEAD request
        const response = await fetch(imageUrl, { method: 'HEAD' });
        
        if (response.ok) {
            // Update cache with the AVIF URL
            imageUrlCache.set(cacheKey, {
                url: imageUrl,
                lastChecked: now
            });
            
            return imageUrl;
        }
        
        // If the image doesn't exist in S3, use placeholder
        console.warn(`Image not found for card ${cardId} (small: ${isSmall})`);
        return `https://via.placeholder.com/400x586?text=Image+Not+Found`;
    } catch (error) {
        console.error("Error getting image URL:", error);
        return `https://via.placeholder.com/400x586?text=Image+Not+Found`;
    }
}

/**
 * Gets multiple image URLs for card images in a single batch
 * @param cardIds Array of card IDs
 * @param isSmall Whether to get small images
 * @returns Map of card IDs to their URLs
 */
export async function getMultipleImageUrls(cardIds: number[], isSmall: boolean = false): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    const now = Date.now();
    
    // Check cache first and prepare uncached IDs
    const uncachedIds: number[] = [];
    
    for (const cardId of cardIds) {
        const cacheKey = `${cardId}_${isSmall ? 'small' : 'full'}`;
        const cached = imageUrlCache.get(cacheKey);
        
        if (cached && (now - cached.lastChecked) < 24 * 60 * 60 * 1000) {
            // Use cached URL if it's not too old
            result.set(cardId, cached.url);
        } else {
            uncachedIds.push(cardId);
        }
    }
    
    // If all URLs were in cache, return early
    if (uncachedIds.length === 0) {
        return result;
    }
    
    try {
        // Get direct S3 URLs for all uncached IDs
        const promises = uncachedIds.map(async (cardId) => {
            try {
                // Generate S3 URL for AVIF
                const imageUrl = getDirectS3Url(cardId, isSmall);
                
                // Verify the image exists with a HEAD request
                const response = await fetch(imageUrl, { method: 'HEAD' });
                
                if (response.ok) {
                    // Store the URL in the result map
                    result.set(cardId, imageUrl);
                    
                    // Update cache
                    const cacheKey = `${cardId}_${isSmall ? 'small' : 'full'}`;
                    imageUrlCache.set(cacheKey, {
                        url: imageUrl,
                        lastChecked: now
                    });
                } else {
                    // If image doesn't exist, use placeholder
                    console.warn(`Image not found for card ${cardId} (small: ${isSmall})`);
                    result.set(cardId, `https://via.placeholder.com/400x586?text=Image+Not+Found`);
                }
            } catch (error) {
                console.error(`Error getting image URL for card ${cardId}:`, error);
                result.set(cardId, `https://via.placeholder.com/400x586?text=Image+Not+Found`);
            }
        });
        
        // Wait for all promises to resolve
        await Promise.all(promises);
        
        return result;
    } catch (error) {
        console.error("Error getting batch image URLs:", error);
        
        // Set fallback URLs for the uncached IDs
        for (const cardId of uncachedIds) {
            result.set(cardId, `https://via.placeholder.com/400x586?text=Image+Not+Found`);
        }
        
        return result;
    }
}

/**
 * Gets public URLs for card images stored in the public storage bucket
 * @param cardIds Array of card IDs
 * @param isSmall Whether to get small images
 * @returns Map of card IDs to their public URLs
 */
export function getPublicImageUrls(cardIds: number[], isSmall: boolean = false): Map<number, string> {
    const result = new Map<number, string>();

    for (const cardId of cardIds) {
        // Always use direct S3 URLs for AVIF images
        const imageUrl = getDirectS3Url(cardId, isSmall);
        result.set(cardId, imageUrl);
    }

    return result;
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

    // Get direct S3 URLs for all cards
    const fullSizeUrls = USE_DIRECT_S3 
        ? await getMultipleImageUrls(cardIds, false) 
        : getPublicImageUrls(cardIds, false);
    
    const smallSizeUrls = USE_DIRECT_S3
        ? await getMultipleImageUrls(cardIds, true)
        : getPublicImageUrls(cardIds, true);

    // Format each card with the image URLs
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
            rarity: card.api_data.misc_info?.[0]?.md_rarity,
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
        return { cube: [], error: error instanceof Error ? error.message : String(error) };
    }
}