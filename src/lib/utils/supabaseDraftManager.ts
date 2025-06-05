import { supabase } from "$lib/supabaseClient";

/**
 * Starts the draft by updating the database with the list of participants and setting the draft status to active.
 * @param draftId - The ID of the draft.
 * @param participants - An array of user IDs participating in the draft.
 * @returns A promise that resolves when the draft is successfully started.
 */
export async function startDraftInDB(draftId: string, participants: string[]) {
    try {
        // Call the start_draft database function which enforces permission checks
        const { error } = await supabase.rpc('start_draft', {
            draft_id: draftId,
            participant_list: participants
        });

        if (error) {
            console.error("Error starting draft in database:", error);
            throw new Error("Failed to start the draft: " + error.message);
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
 * Interface for rarity distribution settings
 */
interface RarityDistribution {
    // Fixed count settings
    commonPerPack: number;
    rarePerPack: number;
    superRarePerPack: number;
    ultraRarePerPack: number;

    // Rate-based settings (percentages)
    useRarityRates?: boolean;
    commonRate?: number;
    rareRate?: number;
    superRareRate?: number;
    ultraRareRate?: number;
}

/**
 * Creates a new draft in the database and assigns shuffled indexes to the cube cards.
 * @param draftMethod - The drafting method (e.g., "winston", "rochester", "grid", or "asynchronous").
 * @param poolSize - The size of the card pool.
 * @param numberOfPlayers - The number of players in the draft.
 * @param cube - The cube data (array of cards).
 * @param numberOfPiles - The number of piles for winston draft, grid size for grid draft, or picks per pack for asynchronous draft.
 * @param packSize - The pack size for rochester or asynchronous draft.
 * @param extraDeckAtEnd - Whether to move extra deck cards to the end of the pool.
 * @param rarityDistribution - Optional settings for rarity distribution in packs.
 * @param drafted_deck_size - The target number of cards each player should draft.
 * @param picksPerPack - Optional parameter for asynchronous draft
 * @param allowOverlap - Whether to allow overlap in player packs for asynchronous draft
 * @returns A promise that resolves with the draft ID.
 */
export async function createDraft(
    draftMethod: string,
    poolSize: number,
    numberOfPlayers: number,
    cube: { id: number; name: string; quantity: number; type: string; imageUrl: string; smallImageUrl: string; apiData: any; custom_rarity?: string }[],
    numberOfPiles: number = 3,
    packSize: number = 5,
    extraDeckAtEnd: boolean = false,
    rarityDistribution: RarityDistribution | null = null,
    drafted_deck_size?: number, // Parameter for draft deck size
    picksPerPack?: number, // Optional parameter for asynchronous draft
    allowOverlap: boolean = false // New parameter for allowing overlap in player packs
): Promise<string> {
    try {
        // Get the current authenticated user
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            throw new Error("No authenticated user found. Please log in to create a draft.");
        }

        // Create a new draft session in the `drafts` table
        const { data: draft, error: draftError } = await supabase
            .from("drafts")
            .insert({
                draft_method: draftMethod,
                pool_size: poolSize,
                number_of_players: numberOfPlayers,
                connected_users: 0,
                status: "waiting",
                number_of_piles: numberOfPiles,
                pack_size: packSize,
                created_by: user.id,
                participants: [user.id],
                drafted_deck_size,
                picks_per_pack: draftMethod === 'asynchronous' ? picksPerPack : undefined, // Store picks per pack for async drafts
            })
            .select()
            .single();

        if (draftError) throw draftError;

        // Expand the cube into individual cards based on their quantity
        const expandedCube = [];
        for (const card of cube) {
            for (let i = 0; i < card.quantity; i++) {
                expandedCube.push({
                    card_id: card.id, // Ensure card_id is properly set from the card.id
                    draft_id: draft.id,
                    apiData: card.apiData, // Include API data for rarity information
                    custom_rarity: card.custom_rarity // Include custom rarity if present
                });
            }
        }

        let cubeWithIndexes = [];

        if (draftMethod === 'asynchronous' && allowOverlap) {
            // For async drafts with overlap, create a separate pool for each player
            const playerPoolSize = Math.floor(poolSize / numberOfPlayers);
            let currentIndex = 0;

            for (let playerIndex = 0; playerIndex < numberOfPlayers; playerIndex++) {
                // Process the card pool for this player
                let limitedPlayerCube = processCardPool(
                    [...expandedCube], // Create a copy of the expanded cube
                    rarityDistribution,
                    packSize,
                    1, // Single player for individual pool
                    playerPoolSize,
                    extraDeckAtEnd,
                    draftMethod
                );

                // Assign player index and global index to each card
                const playerCubeWithIndexes = limitedPlayerCube.map((entry, idx) => ({
                    card_id: entry.card_id,
                    draft_id: entry.draft_id,
                    index: currentIndex + idx, // Global index across all players
                    custom_rarity: entry.custom_rarity,
                }));

                // Add this player's cards to the overall cube
                cubeWithIndexes = [...cubeWithIndexes, ...playerCubeWithIndexes];

                // Update the current index for the next player
                currentIndex += playerPoolSize;
            }

            console.log(`Async draft with overlap: Created ${numberOfPlayers} separate pools of ${playerPoolSize} cards each.`);
        } else {
            // Process the card pool for the draft
            let limitedCube = processCardPool(
                expandedCube,
                rarityDistribution,
                packSize,
                numberOfPlayers,
                poolSize,
                extraDeckAtEnd,
                draftMethod
            );

            // Assign shuffled indexes to the cards
            cubeWithIndexes = limitedCube.map((entry, index) => ({
                card_id: entry.card_id,
                draft_id: entry.draft_id,
                index, // Assign a unique index after shuffling
                custom_rarity: entry.custom_rarity // Add custom rarity to the cube entry
            }));
        }

        // Insert cube data into the `cubes` table
        const { error: cubeError } = await supabase.from("cubes").insert(cubeWithIndexes);
        if (cubeError) throw cubeError;

        console.log(`Draft and cube successfully created in the database for ${draftMethod} draft with ${poolSize} cards.`);
        return draft.id;
    } catch (error) {
        console.error("Error creating draft:", error);
        throw error;
    }
}

/**
 * Processes a card pool by applying shuffling, rarity distribution, and extra deck handling
 * @param cardPool - The pool of cards to process
 * @param rarityDistribution - Optional rarity distribution settings
 * @param packSize - Size of packs for rarity distribution
 * @param numberOfPlayers - Number of players for rarity distribution
 * @param poolSize - Maximum size to limit the card pool
 * @param extraDeckAtEnd - Whether to move extra deck cards to the end
 * @param draftMethod - The drafting method being used
 * @returns Processed card pool
 */
function processCardPool(
    cardPool: any[],
    rarityDistribution: RarityDistribution | null,
    packSize: number,
    numberOfPlayers: number,
    poolSize: number,
    extraDeckAtEnd: boolean,
    draftMethod: string
): any[] {
    let processedPool = cardPool;

    // Apply rarity distribution or shuffle
    if ((draftMethod === 'rochester' || draftMethod === 'asynchronous') && rarityDistribution) {
        processedPool = organizeCardsByRarity(processedPool, rarityDistribution, packSize, numberOfPlayers, poolSize);
        console.log("Organized cards by rarity for Rochester or Asynchronous draft.");
    } else {
        processedPool = shuffleArray(processedPool);
    }

    // Limit to the specified pool size
    let limitedPool = processedPool.slice(0, poolSize);

    // Handle extra deck cards
    if (extraDeckAtEnd) {
        // Separate main deck and extra deck cards
        const mainDeckCards = [];
        const extraDeckCards = [];

        for (const entry of limitedPool) {
            if (isExtraDeckCard(entry.apiData)) {
                extraDeckCards.push(entry);
            } else {
                mainDeckCards.push(entry);
            }
        }

        // Combine them with extra deck at the end
        limitedPool = [...mainDeckCards, ...extraDeckCards];
        console.log(`Rearranged ${extraDeckCards.length} extra deck cards to end of pool for ${draftMethod} draft.`);
    }

    return limitedPool;
}

/**
 * Organizes cards by rarity to ensure the correct distribution in packs
 * @param cards - The expanded card array
 * @param rarityDistribution - The settings for rarity distribution
 * @param packSize - Number of cards per pack
 * @param numberOfPlayers - Number of players
 * @param poolSize - Total card pool size
 * @returns An array of cards ordered by rarity to suit pack creation
 */
function organizeCardsByRarity(
    cards: any[],
    rarityDistribution: RarityDistribution,
    packSize: number,
    numberOfPlayers: number,
    poolSize: number
): any[] {
    // Calculate the number of packs that will be created
    const numberOfPacks = Math.floor(poolSize / packSize);

    // Filter cards by their rarity
    const commons = cards.filter(card => {
        const rarity = getRarityFromCard(card);
        return rarity?.toLowerCase() === 'common';
    });

    const rares = cards.filter(card => {
        const rarity = getRarityFromCard(card);
        return rarity?.toLowerCase() === 'rare';
    });

    const superRares = cards.filter(card => {
        const rarity = getRarityFromCard(card);
        return rarity?.toLowerCase() === 'super rare';
    });

    const ultraRares = cards.filter(card => {
        const rarity = getRarityFromCard(card);
        return rarity?.toLowerCase() === 'ultra rare';
    });

    // Shuffle each rarity pile
    shuffleArray(commons);
    shuffleArray(rares);
    shuffleArray(superRares);
    shuffleArray(ultraRares);

    // Using rate-based approach or fixed counts?
    if (rarityDistribution.useRarityRates) {
        return organizeCardsByRarityRates(
            commons, rares, superRares, ultraRares,
            rarityDistribution,
            packSize,
            numberOfPacks,
            poolSize
        );
    } else {
        return organizeCardsByFixedCounts(
            commons, rares, superRares, ultraRares,
            rarityDistribution,
            packSize,
            numberOfPacks,
            poolSize
        );
    }
}

/**
 * Organizes cards using a stochastic rate-based approach for rarity distribution
 * @param commons - Array of common cards
 * @param rares - Array of rare cards
 * @param superRares - Array of super rare cards
 * @param ultraRares - Array of ultra rare cards
 * @param rarityDistribution - Rarity distribution settings
 * @param packSize - Number of cards per pack
 * @param numberOfPacks - Number of packs to create
 * @param poolSize - Total card pool size
 * @returns An array of cards organized into packs with stochastic rarity distribution
 */
function organizeCardsByRarityRates(
    commons: any[],
    rares: any[],
    superRares: any[],
    ultraRares: any[],
    rarityDistribution: RarityDistribution,
    packSize: number,
    numberOfPacks: number,
    poolSize: number
): any[] {
    // Get the rates (ensure they sum to 100)
    const commonRate = rarityDistribution.commonRate || 0;
    const rareRate = rarityDistribution.rareRate || 0;
    const superRareRate = rarityDistribution.superRareRate || 0;
    const ultraRareRate = rarityDistribution.ultraRareRate || 0;

    // Calculate cumulative probabilities for random selection
    const rarityRanges = [
        commonRate,                              // 0 to commonRate
        commonRate + rareRate,                   // commonRate to commonRate+rareRate
        commonRate + rareRate + superRareRate,   // ... and so on
        100                                      // Should be 100 (all four rates)
    ];

    // Index trackers for each rarity pile
    let commonIndex = 0;
    let rareIndex = 0;
    let superRareIndex = 0;
    let ultraRareIndex = 0;

    const organizedDeck = [];

    // For each pack, assign cards based on probabilities
    for (let packIndex = 0; packIndex < numberOfPacks; packIndex++) {
        for (let cardIndex = 0; cardIndex < packSize; cardIndex++) {
            // Random number between 0 and 100
            const randomValue = Math.random() * 100;

            // Determine which rarity to pick based on the random value
            let selectedCard = null;

            if (randomValue < rarityRanges[0] && commonIndex < commons.length) {
                // Common card
                selectedCard = commons[commonIndex++];
            }
            else if (randomValue < rarityRanges[1] && rareIndex < rares.length) {
                // Rare card
                selectedCard = rares[rareIndex++];
            }
            else if (randomValue < rarityRanges[2] && superRareIndex < superRares.length) {
                // Super Rare card
                selectedCard = superRares[superRareIndex++];
            }
            else if (ultraRareIndex < ultraRares.length) {
                // Ultra Rare card
                selectedCard = ultraRares[ultraRareIndex++];
            }

            // If we've run out of cards of a specific rarity, use any available rarity
            if (!selectedCard) {
                if (commonIndex < commons.length) {
                    selectedCard = commons[commonIndex++];
                } else if (rareIndex < rares.length) {
                    selectedCard = rares[rareIndex++];
                } else if (superRareIndex < superRares.length) {
                    selectedCard = superRares[superRareIndex++];
                } else if (ultraRareIndex < ultraRares.length) {
                    selectedCard = ultraRares[ultraRareIndex++];
                } else {
                    throw new Error("Ran out of cards while trying to fill the pack.");
                }
            }

            if (selectedCard) {
                organizedDeck.push(selectedCard);
            }
        }
    }

    // Log the actual distribution achieved
    const finalCommons = organizedDeck.filter(card => {
        const rarity = getRarityFromCard(card);
        return rarity?.toLowerCase() === 'common';
    }).length;

    const finalRares = organizedDeck.filter(card => {
        const rarity = getRarityFromCard(card);
        return rarity?.toLowerCase() === 'rare';
    }).length;

    const finalSuperRares = organizedDeck.filter(card => {
        const rarity = getRarityFromCard(card);
        return rarity?.toLowerCase() === 'super rare';
    }).length;

    const finalUltraRares = organizedDeck.filter(card => {
        const rarity = getRarityFromCard(card);
        return rarity?.toLowerCase() === 'ultra rare';
    }).length;

    console.log(`Final distribution: Commons: ${finalCommons} (${Math.round(finalCommons / organizedDeck.length * 100)}%), ` +
        `Rares: ${finalRares} (${Math.round(finalRares / organizedDeck.length * 100)}%), ` +
        `Super Rares: ${finalSuperRares} (${Math.round(finalSuperRares / organizedDeck.length * 100)}%), ` +
        `Ultra Rares: ${finalUltraRares} (${Math.round(finalUltraRares / organizedDeck.length * 100)}%)`);

    return organizedDeck;
}

/**
 * Organizes cards using a fixed count approach for rarity distribution
 * @param commons - Array of common cards
 * @param rares - Array of rare cards
 * @param superRares - Array of super rare cards
 * @param ultraRares - Array of ultra rare cards
 * @param rarityDistribution - Rarity distribution settings
 * @param packSize - Number of cards per pack
 * @param numberOfPacks - Number of packs to create
 * @param poolSize - Total card pool size
 * @returns An array of cards organized into packs with fixed rarity counts
 */
function organizeCardsByFixedCounts(
    commons: any[],
    rares: any[],
    superRares: any[],
    ultraRares: any[],
    rarityDistribution: RarityDistribution,
    packSize: number,
    numberOfPacks: number,
    poolSize: number
): any[] {
    // Calculate the number of cards of each rarity needed
    const commonCount = numberOfPacks * rarityDistribution.commonPerPack;
    const rareCount = numberOfPacks * rarityDistribution.rarePerPack;
    const superRareCount = numberOfPacks * rarityDistribution.superRarePerPack;
    const ultraRareCount = numberOfPacks * rarityDistribution.ultraRarePerPack;

    // Ensure we have enough cards of each rarity
    if (commons.length < commonCount) {
        console.warn(`Not enough commons (${commons.length}/${commonCount})`);
    }

    if (rares.length < rareCount) {
        console.warn(`Not enough rares (${rares.length}/${rareCount})`);
    }

    if (superRares.length < superRareCount) {
        console.warn(`Not enough super rares (${superRares.length}/${superRareCount})`);
    }

    if (ultraRares.length < ultraRareCount) {
        console.warn(`Not enough ultra rares (${ultraRares.length}/${ultraRareCount})`);
    }

    // Take the required number of cards from each rarity pile
    const selectedCommons = commons.slice(0, commonCount);
    const selectedRares = rares.slice(0, rareCount);
    const selectedSuperRares = superRares.slice(0, superRareCount);
    const selectedUltraRares = ultraRares.slice(0, ultraRareCount);

    // Organize cards for packs (interleave rarities)
    const organizedDeck = [];
    for (let packIndex = 0; packIndex < numberOfPacks; packIndex++) {
        // For each pack, add cards in the specified distribution
        for (let i = 0; i < rarityDistribution.commonPerPack; i++) {
            const cardIndex = packIndex * rarityDistribution.commonPerPack + i;
            if (cardIndex < selectedCommons.length) {
                organizedDeck.push(selectedCommons[cardIndex]);
            }
        }

        for (let i = 0; i < rarityDistribution.rarePerPack; i++) {
            const cardIndex = packIndex * rarityDistribution.rarePerPack + i;
            if (cardIndex < selectedRares.length) {
                organizedDeck.push(selectedRares[cardIndex]);
            }
        }

        for (let i = 0; i < rarityDistribution.superRarePerPack; i++) {
            const cardIndex = packIndex * rarityDistribution.superRarePerPack + i;
            if (cardIndex < selectedSuperRares.length) {
                organizedDeck.push(selectedSuperRares[cardIndex]);
            }
        }

        for (let i = 0; i < rarityDistribution.ultraRarePerPack; i++) {
            const cardIndex = packIndex * rarityDistribution.ultraRarePerPack + i;
            if (cardIndex < selectedUltraRares.length) {
                organizedDeck.push(selectedUltraRares[cardIndex]);
            }
        }
    }

    // Add remaining cards if we need to reach the pool size
    const cards = [...commons, ...rares, ...superRares, ...ultraRares];
    const remainingCards = cards.filter(card => {
        return !organizedDeck.some(c => c.card_id === card.card_id);
    });

    shuffleArray(remainingCards);
    while (organizedDeck.length < poolSize && remainingCards.length > 0) {
        organizedDeck.push(remainingCards.shift());
    }

    return organizedDeck;
}

/**
 * Gets the rarity of a card from its API data
 * @param card - The card object containing apiData and possibly custom_rarity
 * @returns The rarity string or null if not found
 */
function getRarityFromCard(card: any): string | null {
    // First check for custom rarity at card level
    if (card?.custom_rarity) {
        return card.custom_rarity;
    }
    // Fall back to Master Duel rarity from API data
    return card?.apiData?.rarity || null;
}

/**
 * Determines if a card belongs in the Extra Deck
 */
function isExtraDeckCard(apiData: any): boolean {
    if (!apiData || !apiData.type) {
        return false;
    }

    // Get the card type from the apiData
    const cardType = apiData.type.toLowerCase();

    // These types go in the Extra Deck
    return (
        cardType.includes('fusion') ||
        cardType.includes('synchro') ||
        cardType.includes('xyz') ||
        cardType.includes('link') ||
        cardType.includes('pendulum')
    );
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
 * Updates the draft state in the database, including the current player, pile index, and card ownership.
 * @param draftId - The ID of the draft.
 * @param currentPlayer - The index of the current player.
 * @param pileIndex - The index of the pile being updated (for syncing pile assignments).
 * @param cardIndexes - The indexes of the cards being updated (for ownership assignment).
 * @param playerId - The ID of the player who owns the cards.
 * @param piles - The updated state of all piles (for syncing pile assignments).
 */
export async function updateDraftState(
    draftId: string,
    currentPlayer: number,
    pileIndex: number | null,
    cardIndexes: number[],
    playerId: string,
    piles: any[] = []
) {
    try {
        // Update the current player in the `drafts` table
        const { error: draftError } = await supabase
            .from('drafts')
            .update({ current_player: currentPlayer })
            .eq('id', draftId);

        if (draftError) {
            console.error('Error updating current player:', draftError);
            throw new Error('Failed to update current player.');
        }

        // Update card ownership if cards are being assigned to a player
        if (cardIndexes.length > 0) {
            const { error: ownershipError } = await supabase
                .from('cubes')
                .update({ owner: playerId, pile: null }) // Remove the pile index and assign ownership
                .eq('draft_id', draftId)
                .in('index', cardIndexes);

            if (ownershipError) {
                console.error('Error updating card ownership:', ownershipError);
                throw new Error('Failed to update card ownership.');
            }
        }

        // Update pile assignments for all cards
        if (piles.length > 0) {
            // First, clear pile assignments for cards that are not owned
            const { error: clearError } = await supabase
                .from('cubes')
                .update({ pile: null })
                .eq('draft_id', draftId)
                .is('owner', null);

            if (clearError) {
                console.error('Error clearing pile assignments:', clearError);
                throw new Error('Failed to clear pile assignments.');
            }

            // Then update each pile with the correct cards
            for (let i = 0; i < piles.length; i++) {
                if (piles[i] && piles[i].length > 0) {
                    const pileCardIndexes = piles[i].map((card) => card.index);

                    const { error: pileError } = await supabase
                        .from('cubes')
                        .update({ pile: i })
                        .eq('draft_id', draftId)
                        .is('owner', null) // Only update cards that are not owned
                        .in('index', pileCardIndexes);

                    if (pileError) {
                        console.error(`Error updating pile ${i}:`, pileError);
                        throw new Error(`Failed to update pile ${i}.`);
                    } else {
                        console.log(`Pile ${i} updated successfully with ${piles[i].length} cards.`);
                    }
                }
            }
        }

        console.log(
            `Draft state updated: currentPlayer=${currentPlayer}, pileIndex=${pileIndex}, playerId=${playerId}`
        );
    } catch (error) {
        console.error('Error updating draft state:', error);
        throw error;
    }
}