import type { LayoutLoad } from './$types';

// Enable static rendering
export const prerender = true;

export const load: LayoutLoad = async () => {
    // Auth is now handled in the layout.svelte component
    return {};
};