import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { store as authStore } from '$lib/stores/authStore.svelte';

export const load: PageLoad = async ({ params, parent }) => {
    // Check both parent.session (from layout load) and client-side auth store
    // The browser check prevents this from running during SSR
    const isAuthenticated = parent.session || (browser && authStore.session);
    
    if (!isAuthenticated) {
        const redirectPath = `/draft/${params.id}`;
        throw redirect(303, `/auth?redirect=${encodeURIComponent(redirectPath)}`);
    }

    // User is authenticated, pass along the draft ID from the URL
    return {
        id: params.id
    };
};