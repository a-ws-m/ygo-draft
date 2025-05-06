import Papa from "papaparse";
import { fetchCardData, formatCardsFromDatabase } from "$lib/services/cardService";

export async function processCubeFile(file: File): Promise<any[]> {
    const text = await file.text();

    // Parse the CSV using PapaParse
    const { data, errors } = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    });

    if (errors.length > 0) {
        throw new Error(`CSV parsing errors: ${errors.map((e) => e.message).join(", ")}`);
    }

    // Check if the file contains custom rarities (5 columns)
    const hasCustomRarities = data.some(columns => columns.length === 5);
    console.log("Has custom rarities:", hasCustomRarities);
    console.debug("First columns of data:", data.slice(0, 5));

    // Validate and extract card IDs from each row
    const cardEntries = data.map((columns) => {
        // Support both 4-column and 5-column formats
        if (columns.length !== 4 && columns.length !== 5) {
            throw new Error(`Invalid row format: "${columns.join(",")}". Expected 4 or 5 columns.`);
        }

        const [id, name, type, quantity, customRarity] = columns.map((col) => col?.trim());

        if (!id || !name || !type || isNaN(Number(quantity))) {
            throw new Error(`Invalid data in row: "${columns.join(",")}". Ensure all fields are valid.`);
        }

        // Parse custom rarity if available
        let parsedCustomRarity = null;
        if (customRarity) {
            const lowerRarity = customRarity.toLowerCase();
            if (['common', 'c'].includes(lowerRarity)) {
                parsedCustomRarity = 'Common';
            } else if (['rare', 'r'].includes(lowerRarity)) {
                parsedCustomRarity = 'Rare';
            } else if (['super rare', 'sr'].includes(lowerRarity)) {
                parsedCustomRarity = 'Super Rare';
            } else if (['ultra rare', 'ur'].includes(lowerRarity)) {
                parsedCustomRarity = 'Ultra Rare';
            }
        }

        return {
            id: Number(id),
            name,
            type,
            quantity: Number(quantity),
            custom_rarity: parsedCustomRarity
        };
    });

    // Extract all unique card IDs for fetching
    const cardIds = [...new Set(cardEntries.map(entry => entry.id))];

    // Fetch card data from our edge function (which will check the database first)
    const { cards, error } = await fetchCardData(cardIds);

    if (error) {
        throw new Error(`Failed to fetch card data: ${error}`);
    }

    // Create a map for quick lookups of card data
    const cardMap = new Map(cards.map(card => [card.id, card]));

    // Create an array of card data objects with quantities for batch processing
    const cardsToFormat = [];

    for (const entry of cardEntries) {
        const cardData = cardMap.get(entry.id);

        if (!cardData) {
            throw new Error(`Card ID ${entry.id} not found in API response.`);
        }

        if (cardData.name !== entry.name) {
            throw new Error(
                `Card name mismatch for ID: ${entry.id}. Expected name: "${entry.name}". Got name: "${cardData.name}".`
            );
        }

        cardsToFormat.push({
            ...cardData,
            quantity: entry.quantity,
            custom_rarity: entry.custom_rarity
        });
    }

    // Format all cards in a single batch operation
    const cube = await formatCardsFromDatabase(cardsToFormat);

    // Add custom_rarity flag for the form to detect
    if (hasCustomRarities) {
        cube.hasCustomRarities = true;
        cube.cardsWithoutCustomRarity = cube.filter(card => !card.custom_rarity);
    }

    console.log("Cube processed successfully:", cube);

    return cube;
}