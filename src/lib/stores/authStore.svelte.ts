import { supabase } from '$lib/supabaseClient';
import { goto, invalidate } from '$app/navigation';
import { browser } from '$app/environment';

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
        const path = localStorage.getItem('previousPath') || '/';
        localStorage.removeItem('previousPath');
        return path;
    }
    return '/';
}

// Sign up a new user
export async function signUp(email: string, password: string) {
    try {
        store.loading = true;
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        if (error) throw error;

        return { success: true, data };
    } catch (error) {
        console.error('Error signing up:', error);
        return { success: false, error };
    } finally {
        store.loading = false;
    }
}

// Sign in a user
export async function signIn(email: string, password: string) {
    try {
        store.loading = true;
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;

        store.session = data.session;
        return { success: true, data };
    } catch (error) {
        console.error('Error signing in:', error);
        return { success: false, error };
    } finally {
        store.loading = false;
    }
}

// Sign in anonymously
export async function anonymousSignIn() {
    try {
        store.loading = true;
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;

        store.session = data.session;
        return { success: true, data };
    } catch (error) {
        console.error('Error signing in anonymously:', error);
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