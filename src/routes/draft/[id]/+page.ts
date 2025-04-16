import type { PageLoad } from './$types';
import { supabase } from '$lib/supabaseClient';

export const load: PageLoad = async ({ params }) => {
    const { data: draft, error: draftError } = await supabase
        .from("drafts")
        .select("*")
        .eq("id", params.id)
        .single();

    if (draftError) {
        throw new Error("Failed to fetch draft data");
    }

    const { data: cube, error: cubeError } = await supabase
        .from("cubes")
        .select("*")
        .eq("draft_id", params.id);

    if (cubeError) {
        throw new Error("Failed to fetch cube data");
    }

    return {
        id: draft.id,
        cube,
        draftMethod: draft.draft_method,
        poolSize: draft.pool_size,
        numberOfPlayers: draft.number_of_players,
        connectedUsers: draft.connected_users,
    };
};