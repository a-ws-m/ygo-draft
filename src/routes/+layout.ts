import type { LayoutLoad } from './$types';
import { supabase } from '$lib/supabaseClient';

export const prerender = true;

export const load: LayoutLoad = async ({ depends }) => {
    // Track this dependency
    depends('supabase:auth');

    const { data } = await supabase.auth.getSession();

    return {
        session: data.session
    };
};