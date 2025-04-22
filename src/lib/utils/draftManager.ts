import { supabase } from "$lib/supabaseClient";

/**
 * Starts the draft by updating the database with the list of participants and setting the draft status to active.
 * @param draftId - The ID of the draft.
 * @param participants - An array of user IDs participating in the draft.
 * @returns A promise that resolves when the draft is successfully started.
 */
export async function startDraftInDB(draftId: string, participants: string[]) {
    try {
        // Update the draft with the list of participants and set the status to active
        const { error } = await supabase
            .from("drafts")
            .update({
                participants,
                status: "active",
            })
            .eq("id", draftId);

        if (error) {
            console.error("Error updating draft in database:", error);
            throw new Error("Failed to start the draft.");
        }

        console.log("Draft successfully started in the database.");
    } catch (error) {
        console.error("Error starting draft:", error);
        throw error;
    }
}