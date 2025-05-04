<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import {
		store as authStore,
		initializeAuth,
		subscribeToAuthChanges,
		signOut
	} from '$lib/stores/authStore.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { children } = $props();

	// Check if the current route is public (doesn't require authentication)
	const publicRoutes = ['/auth'];
	const isPublicRoute = $derived(publicRoutes.some(route => page.url.pathname.startsWith(route)));

	// Combined check for access - allow if the route is public or the user is authenticated
	const hasAccess = $derived(!authStore.loading && (isPublicRoute || authStore.session !== null));

	// Handle redirection for protected routes
	$effect(() => {
		if (!authStore.loading && !isPublicRoute && !authStore.session) {
			const currentPath = page.url.pathname + page.url.search;
			goto(`/auth?redirect=${encodeURIComponent(currentPath)}`);
		}
	});

	onMount(async () => {
		// Initialize auth and subscribe to changes
		await initializeAuth();
		const { data: authListener } = subscribeToAuthChanges();

		return () => {
			if (authListener) {
				authListener.subscription.unsubscribe();
			}
		};
	});
</script>

<div class="flex min-h-screen flex-col">
	{#if !authStore.loading}
		{#if hasAccess}
			<!-- Display the navigation bar if user is authenticated -->
			{#if authStore.session}
				<header class="bg-white shadow">
					<nav class="container mx-auto flex items-center justify-between px-6 py-4">
						<a href="/" class="text-xl font-bold text-indigo-600">YGO Draft</a>
						<div>
							<span class="mr-4 text-sm text-gray-600">{authStore.session.user.email}</span>
							<button
								onclick={signOut}
								class="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
							>
								Sign Out
							</button>
						</div>
					</nav>
				</header>
			{/if}

			<!-- Render the page content -->
			<main class="flex-1">
				{@render children()}
			</main>

			<!-- Footer could go here -->
		{:else}
			 <!-- Loading indicator instead of direct redirect script -->
			<div class="flex h-screen w-full items-center justify-center">
				<div class="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600"></div>
				<span class="ml-4">Redirecting to login...</span>
			</div>
		{/if}
	{:else}
		<!-- Loading state -->
		<div class="flex h-screen w-full items-center justify-center">
			<div class="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600"></div>
		</div>
	{/if}
</div>
