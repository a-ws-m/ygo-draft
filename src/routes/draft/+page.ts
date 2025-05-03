// import type { PageLoad } from './$types';
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { store as authStore } from '$lib/stores/authStore.svelte';

export const load: PageLoad = async ({ url, parent }) => {
    // Check authentication
    const isAuthenticated = parent.session || (browser && authStore.session);

    if (!isAuthenticated) {
        const redirectPath = `/draft?id=${url.searchParams.get('id')}`;
        throw redirect(303, `/auth?redirect=${encodeURIComponent(redirectPath)}`);
    }

    // Return empty props - we'll load data client-side
    return {};
};