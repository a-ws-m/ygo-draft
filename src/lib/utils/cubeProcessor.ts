import Papa from "papaparse";

export async function processCubeFile(file: File): Promise<any[]> {
    const text = await file.text();

    // Parse the CSV using PapaParse
    const { data, errors } = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
    });

    if (errors.length > 0) {
        throw new Error(`CSV parsing errors: ${errors.map((e) => e.message).join(", ")}`);
    }

    const cube = [];

    // Validate and process each row
    const cardData = data.map((columns) => {
        if (columns.length !== 4) {
            throw new Error(`Invalid row format: "${columns.join(",")}". Expected 4 columns.`);
        }

        const [id, name, type, quantity] = columns.map((col) => col.trim());

        if (!id || !name || !type || isNaN(Number(quantity))) {
            throw new Error(`Invalid data in row: "${columns.join(",")}". Ensure all fields are valid.`);
        }

        return { id, name, type, quantity: Number(quantity) };
    });

    const ids = cardData.map((card) => card.id).join(",");

    const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${ids}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch data for cards: ${response.statusText}`);
    }

    const apiData = await response.json();

    for (const card of cardData) {
        const apiCard = apiData.data.find((apiEntry) => apiEntry.id.toString() === card.id);

        if (!apiCard) {
            throw new Error(`Card ID ${card.id} not found in API response.`);
        }

        if (apiCard.name !== card.name) {
            throw new Error(
                `Card name mismatch for ID: ${card.id}. Expected name: "${card.name}". Got name: "${apiCard.name}".`
            );
        }

        cube.push({
            id: card.id,
            name: card.name,
            type: card.type,
            quantity: card.quantity,
            imageUrl: apiCard.card_images[0]?.image_url,
            smallImageUrl: apiCard.card_images[0]?.image_url_small,
            apiData: apiCard,
        });
    }

    console.log("Cube processed successfully:", cube);

    return cube; // Return the cube array
}