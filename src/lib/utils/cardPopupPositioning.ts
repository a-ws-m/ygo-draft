/**
 * Calculates the optimal position for a card details popup
 * based on available screen space around the target element.
 */
export function calculatePopupPosition(event: MouseEvent) {
    const rect = event.target.getBoundingClientRect();

    // Calculate available space in all directions
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - rect.right;

    // Estimated heights for different positions
    const neededVerticalSpace = 400; // Approximate height needed for details in above/below positions
    const neededHorizontalSpace = 200; // Approximate height needed for details in left/right positions

    // Determine available positions based on space requirements
    const availablePositions = [];

    if (spaceAbove >= neededVerticalSpace)
        availablePositions.push({ direction: 'above', space: spaceAbove });
    if (spaceBelow >= neededVerticalSpace)
        availablePositions.push({ direction: 'below', space: spaceBelow });

    // For left/right positions, also check if we have enough vertical space
    const verticalCenterSpace = Math.min(
        spaceBelow,
        window.innerHeight - rect.top - rect.height / 2
    );

    if (spaceLeft >= 300 && verticalCenterSpace >= neededHorizontalSpace / 2) {
        availablePositions.push({ direction: 'left', space: spaceLeft });
    }
    if (spaceRight >= 300 && verticalCenterSpace >= neededHorizontalSpace / 2) {
        availablePositions.push({ direction: 'right', space: spaceRight });
    }

    // If no positions have enough space, get all possible positions with their available space
    if (availablePositions.length === 0) {
        availablePositions.push({ direction: 'above', space: spaceAbove });
        availablePositions.push({ direction: 'below', space: spaceBelow });
        availablePositions.push({ direction: 'left', space: spaceLeft });
        availablePositions.push({ direction: 'right', space: spaceRight });
    }

    // Sort by available space (descending) and select the best direction
    const bestPosition = availablePositions.sort((a, b) => b.space - a.space)[0].direction;

    // Calculate coordinates based on selected direction
    let x = 0;
    let y = 0;

    if (bestPosition === 'above') {
        x = rect.left + rect.width / 2;
        y = rect.top - 10;
    } else if (bestPosition === 'below') {
        x = rect.left + rect.width / 2;
        y = rect.bottom + 10;
    } else if (bestPosition === 'left') {
        x = rect.left - 10;
        y = rect.top + rect.height / 2;

        // Ensure it doesn't go beyond bottom of screen by adjusting Y position if needed
        const cardDetailsHeight = neededHorizontalSpace;
        const bottomOverflow = y + cardDetailsHeight / 2 - window.innerHeight;
        if (bottomOverflow > 0) {
            y = Math.max(cardDetailsHeight / 2, y - bottomOverflow);
        }
    } else { // right
        x = rect.right + 10;
        y = rect.top + rect.height / 2;

        // Ensure it doesn't go beyond bottom of screen by adjusting Y position if needed
        const cardDetailsHeight = neededHorizontalSpace;
        const bottomOverflow = y + cardDetailsHeight / 2 - window.innerHeight;
        if (bottomOverflow > 0) {
            y = Math.max(cardDetailsHeight / 2, y - bottomOverflow);
        }
    }

    return {
        position: bestPosition,
        x,
        y
    };
}
