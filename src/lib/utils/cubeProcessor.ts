import Papa from "papaparse";
import { fetchCardData, formatCardFromDatabase } from "$lib/services/cardService";

export async function processCubeFile(file: File): Promise<any[]> {
    const text = await file.text();

    // Parse the CSV using PapaParse
    const { data, errors } = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    });

    if (errors.length > 0) {
        throw new Error(`CSV parsing errors: ${errors.map((e) => e.message).join(", ")}`);
    }

    // Validate and extract card IDs from each row
    const cardEntries = data.map((columns) => {
        if (columns.length !== 4) {
            throw new Error(`Invalid row format: "${columns.join(",")}". Expected 4 columns.`);
        }

        const [id, name, type, quantity] = columns.map((col) => col.trim());

        if (!id || !name || !type || isNaN(Number(quantity))) {
            throw new Error(`Invalid data in row: "${columns.join(",")}". Ensure all fields are valid.`);
        }

        return {
            id: Number(id),
            name,
            type,
            quantity: Number(quantity)
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

    // Create the final cube with card data and quantities
    const cubePromises = [];

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

        // Format card data and get image URLs from storage
        const formattedCard = formatCardFromDatabase({
            ...cardData,
            quantity: entry.quantity
        });

        cubePromises.push(formattedCard);
    }

    // Resolve all promises to get the final cube array
    const cube = await Promise.all(cubePromises);

    console.log("Cube processed successfully:", cube);

    return cube;
}