import { supabase } from '$lib/supabaseClient';
import { goto, invalidate } from '$app/navigation';
import { browser } from '$app/environment';
import { base } from '$app/paths';
import { page } from '$app/state';

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
                redirectTo: page.url.href || undefined
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
                redirectTo: page.url.href || undefined
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

// Sign in anonymously with hCaptcha verification
export async function signInAnonymously(hcaptchaToken: string) {
    try {
        store.loading = true;
        // Use Supabase's signInWithOtp to create an anonymous session
        // We're using the captcha token as verification
        const { data, error } = await supabase.auth.signInAnonymously({
            options: {
                captchaToken: hcaptchaToken,
            }
        });

        if (error) throw error;
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

        const path = getPreviousPath();
        goto(path);
    } catch (error) {
        console.error('Error signing out:', error);
    } finally {
        store.session = null;
        store.loading = false;
    }
}

// Delete user account
export async function deleteAccount() {
    try {
        if (!store.session) {
            throw new Error('You must be logged in to delete your account');
        }

        store.loading = true;

        // Call the RPC function to delete the user account
        const { error } = await supabase.rpc('delete_user_account');

        if (error) throw error;

        // Sign out the user after account deletion request
        await supabase.auth.signOut();
        store.session = null;

        // Redirect to home page
        goto(base);

        return { success: true };
    } catch (error) {
        console.error('Error deleting account:', error);
        return { success: false, error };
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