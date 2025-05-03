export interface Card {
    index: number;
    draft_id: string;
    name: string;
    type: string;
    imageUrl: string;
    apiData: any;
    owner: string | null;
    pile: number | null;
}

export interface DraftBroadcastPayload {
    // Base payload for all broadcasts
    draftId?: string;

    // Winston draft payload
    playerId?: number;
    currentPlayer?: number;
    acceptedPileIndex?: number;
    finished?: boolean;

    // Rochester draft payload
    playerIndex?: number;
    packIndex?: number;
    cardIndex?: number;
    round?: number;
    packAssignments?: Record<number, number>;
}