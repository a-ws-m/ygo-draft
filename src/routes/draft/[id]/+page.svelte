<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { supabase } from '$lib/supabaseClient'; // Initialize Supabase client
    import type { PageLoad } from './$types';

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

    onMount(() => {
        // Join the presence channel for the draft
        channel = supabase.channel(`draft-room-${data.id}`, {
            config: {
                presence: {
                    key: supabase.auth.user()?.id || `guest-${Math.random()}`, // Unique key for each user
                },
            },
        });

        // Subscribe to presence state changes
        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            connectedUsers = Object.keys(state).length; // Count the number of connected users
            draftReady = connectedUsers === data.numberOfPlayers;
        });

        // Subscribe to presence join events
        channel.on('presence', { event: 'join' }, ({ newPresences }) => {
            console.log('New users joined:', newPresences);
        });

        // Subscribe to presence leave events
        channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
            console.log('Users left:', leftPresences);
        });

        // Subscribe to the channel
        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Subscribed to presence channel');
            }
        });

        // Clean up when the user leaves the page
        onDestroy(() => {
            channel.unsubscribe();
        });
    });
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-100 p-6">
    <h1 class="text-3xl font-bold text-gray-800">Draft Room</h1>
    <p class="text-lg text-gray-600">Draft ID: {data.id}</p>
    <p class="text-lg text-gray-600">Connected Users: {connectedUsers}/{data.numberOfPlayers}</p>

    <button
        class="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
        disabled={!draftReady}
    >
        Start Draft
    </button>
</div>
