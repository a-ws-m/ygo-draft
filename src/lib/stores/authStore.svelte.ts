import { supabase } from '$lib/supabaseClient';
import { goto, invalidate } from '$app/navigation';
import { browser } from '$app/environment';
import { base } from '$app/paths';

// Create a store object instead of individual exported states
export const store = $state({
    session: null,
    loading: true,
    previousPath: null
});

// Initialize the store with the current session if any
export async function initializeAuth() {
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        store.session = data.session;
        return data.session;
    } catch (error) {
        console.error('Error initializing auth:', error);
        store.session = null;
    } finally {
        store.loading = false;
    }
}

// Save the current path before redirecting to auth
export function savePreviousPath(path) {
    if (browser) {
        store.previousPath = path;
        localStorage.setItem('previousPath', path);
    }
}

// Get the saved path and clear it
export function getPreviousPath() {
    if (browser) {
        const path = localStorage.getItem('previousPath') || base;
        localStorage.removeItem('previousPath');
        return path;
    }
    return base;
}

// Sign in with GitHub
export async function signInWithGitHub() {
    try {
        store.loading = true;
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
                redirectTo: `${window.location.origin}${base}/auth/callback`
            }
        });
        if (error) throw error;

        return { success: true, data };
    } catch (error) {
        console.error('Error signing in with GitHub:', error);
        return { success: false, error };
    } finally {
        store.loading = false;
    }
}

// Sign in with Discord
export async function signInWithDiscord() {
    try {
        store.loading = true;
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'discord',
            options: {
                redirectTo: `${window.location.origin}${base}/auth/callback`
            }
        });
        if (error) throw error;

        return { success: true, data };
    } catch (error) {
        console.error('Error signing in with Discord:', error);
        return { success: false, error };
    } finally {
        store.loading = false;
    }
}

// Sign out a user
export async function signOut() {
    try {
        store.loading = true;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        store.session = null;
        const path = getPreviousPath();
        goto(path);
    } catch (error) {
        console.error('Error signing out:', error);
    } finally {
        store.loading = false;
    }
}

// Subscribe to auth changes
export function subscribeToAuthChanges() {
    return supabase.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_IN' && newSession) {
            store.session = newSession;
            // Invalidate the layout data to refresh it
            invalidate('supabase:auth');
        } else if (event === 'SIGNED_OUT') {
            store.session = null;
            // Invalidate the layout data to refresh it
            invalidate('supabase:auth');
        }
    });
}