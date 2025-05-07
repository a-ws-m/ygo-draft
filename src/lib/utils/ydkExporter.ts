/**
 * Converts a cube of Yu-Gi-Oh cards to YDK format
 * YDK format has sections for main deck, extra deck, and side deck
 */
export function convertToYdk(cube: any[]): string {
    // YDK file header
    let ydkContent = "#created by YGO Draft\n";
    ydkContent += "#main\n";

    // Separate main deck and extra deck cards
    const mainDeckCards = [];
    const extraDeckCards = [];

    cube.forEach(card => {
        // Check if this is an Extra Deck monster
        const isExtraDeck = isExtraDeckCard(card);

        // Add card ID the appropriate number of times based on quantity
        const quantity = card.quantity || 1;
        const cardId = card.id; // Fixed: Use card.id instead of card.apiData.id

        for (let i = 0; i < quantity; i++) {
            if (isExtraDeck) {
                extraDeckCards.push(cardId);
            } else {
                mainDeckCards.push(cardId);
            }
        }
    });

    // Add main deck card IDs
    mainDeckCards.forEach(id => {
        ydkContent += `${id}\n`;
    });

    // Add extra deck section
    ydkContent += "#extra\n";
    extraDeckCards.forEach(id => {
        ydkContent += `${id}\n`;
    });

    return ydkContent;
}

/**
 * Determines if a card belongs in the Extra Deck
 */
function isExtraDeckCard(card: any): boolean {
    // Get the card type from the apiData
    const cardType = card.apiData.type.toLowerCase();

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
 * Triggers a download of the YDK file
 */
export function downloadYdkFile(ydkContent: string, filename: string = 'yugioh_deck.ydk'): void {
    const blob = new Blob([ydkContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}