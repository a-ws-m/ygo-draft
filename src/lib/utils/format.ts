/**
 * Converts a card from the Supabase `cube` table format to the format required by the `Card` component.
 * @param cubeCard - The card object from the Supabase `cube` table.
 * @returns The formatted card object for the `Card` component.
 */
export function formatCardForComponent(cubeCard: {
    card_name: string;
    type: string;
    apiData: {
        card_images: { image_url: string }[];
        type: string;
        desc: string;
        atk?: number;
        def?: number;
        level?: number;
        race: string;
        attribute?: string;
        archetype?: string;
    };
}) {
    return {
        imageUrl: cubeCard.apiData.card_images[0]?.image_url || "",
        name: cubeCard.card_name,
        type: cubeCard.type,
        apiData: {
            type: cubeCard.apiData.type,
            desc: cubeCard.apiData.desc,
            atk: cubeCard.apiData.atk,
            def: cubeCard.apiData.def,
            level: cubeCard.apiData.level,
            race: cubeCard.apiData.race,
            attribute: cubeCard.apiData.attribute,
            archetype: cubeCard.apiData.archetype,
        },
    };
}