import type { PageLoad } from './$types';

// Enable static rendering
export const prerender = true;

export const load: PageLoad = async () => {
    // Return empty props - we'll load data client-side
    return {};
};