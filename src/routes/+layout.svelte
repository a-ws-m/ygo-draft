<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import {
		store as authStore,
		initializeAuth,
		subscribeToAuthChanges,
		signOut,
		deleteAccount
	} from '$lib/stores/authStore.svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';

	let { children } = $props();

	function confirmDeleteAccount() {
		if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
			deleteAccount();
		}
	}

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
		<!-- Display the navigation bar if user is authenticated -->
		{#if authStore.session}
			<header class="bg-white shadow">
				<nav class="container mx-auto flex items-center justify-between px-6 py-4">
					<div class="flex items-center">
						<a href={`${base}/`} class="mr-6 text-xl font-bold text-indigo-600">YGO Draft</a>
						<span class="text-sm text-gray-600">{authStore.session.user.email}</span>
						<button
							onclick={signOut}
							class="ml-4 rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
						>
							Sign Out
						</button>
						<button
							onclick={confirmDeleteAccount}
							class="ml-4 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
						>
							Delete Account
						</button>
					</div>
					<div class="flex items-center">
						<a
							href="https://github.com/a-ws-m/ygo-draft/issues"
							target="_blank"
							class="mr-4 rounded border border-gray-300 px-2 py-1 transition-colors hover:border-indigo-400"
						>
							<span>Bug reports</span>
						</a>
						<a
							href="https://github.com/a-ws-m/ygo-draft"
							target="_blank"
							class="mr-4"
							aria-label="GitHub"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="currentColor"
								class="text-gray-700 hover:text-indigo-600"
							>
								<path
									d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
								/>
							</svg>
						</a>
						<a href="https://www.buymeacoffee.com/a.ws.m" target="_blank">
							<img
								src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
								alt="Buy Me A Coffee"
								class="max-w-28"
							/>
						</a>
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
		<!-- Loading state -->
		<div class="flex h-screen w-full items-center justify-center">
			<div class="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600"></div>
		</div>
	{/if}
</div>
