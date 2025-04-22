<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { supabase } from "$lib/supabaseClient";
    import { startDraftInDB } from "$lib/utils/draftManager"; // Import the utility script
    import CardList from "$lib/components/CardList.svelte"; // Card list component

    export let data: {
        id: string;
        cube: any[];
        draftMethod: string;
        poolSize: number;
        numberOfPlayers: number;
        connectedUsers: number;
    };

    let connectedUsers = 0; // Presence will manage this
    let draftReady = false;
    let channel: any;
    let participants: string[] = []; // List of user IDs participating in the draft
    let draftStarted = false; // Whether the draft has started

    onMount(async () => {
        // Get the user session to retrieve the user ID
        const { data: session, error } = await supabase.auth.getSession();
        if (error) {
            console.error("Error fetching session:", error);
        }

        const userId = session?.session?.user?.id || `guest-${Math.random()}`;
        console.log("User ID:", userId);

        // Join the presence channel for the draft
        channel = supabase.channel(`draft-room-${data.id}`, {
            config: {
                presence: {
                    key: userId, // Unique key for each user
                },
            },
        });

        // Subscribe to presence state changes
        channel.on("presence", { event: "sync" }, () => {
            const state = channel.presenceState();
            console.log("Presence state updated:", state);
            connectedUsers = Object.keys(state).length; // Count the number of connected users
            participants = Object.keys(state); // Save the list of participants
            draftReady = connectedUsers === data.numberOfPlayers;
        });

        // Subscribe to presence join events
        channel.on("presence", { event: "join" }, ({ newPresences }) => {
            console.log("New users joined:", newPresences);
        });

        // Subscribe to presence leave events
        channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
            console.log("Users left:", leftPresences);
        });

        // Subscribe to the channel
        channel.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
                console.log("Subscribed to presence channel");

                // Track the user's presence in the channel
                const trackResponse = await channel.track({ userId, status: "online" });
                if (trackResponse.error) {
                    console.error("Error tracking presence:", trackResponse.error);
                } else {
                    console.log("User presence tracked successfully");
                }
            } else {
                console.error("Failed to subscribe to presence channel:", status);
            }
        });
    });

    onDestroy(() => {
        if (channel) {
            channel.unsubscribe();
        }
    });

    async function startDraft() {
        if (!draftReady) return;

        try {
            // Update the database to start the draft
            await startDraftInDB(data.id, participants);

            // Mark the draft as started
            draftStarted = true;
        } catch (error) {
            console.error("Error starting draft:", error);
        }
    }
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-100 p-6">
    <h1 class="text-3xl font-bold text-gray-800">Draft Room</h1>
    <p class="text-lg text-gray-600">Draft ID: {data.id}</p>
    <p class="text-lg text-gray-600">Connected Users: {connectedUsers}/{data.numberOfPlayers}</p>

    {#if !draftStarted}
        <button
            class="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
            disabled={!draftReady}
            on:click={startDraft}
        >
            Start Draft
        </button>
    {:else}
        <CardList {data} />
    {/if}
</div>
