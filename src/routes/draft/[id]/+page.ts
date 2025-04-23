import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
    // Just pass along the draft ID from the URL
    return {
        id: params.id
    };
};