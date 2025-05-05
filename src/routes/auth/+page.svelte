<script lang="ts">
	import {
		store as authStore,
		getPreviousPath,
		signInWithGitHub,
		signInWithDiscord,
		savePreviousPath
	} from '$lib/stores/authStore.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let errorMessage = $state('');
	let redirectPath = $state('/');

	onMount(() => {
		// Check if there's a redirect query parameter
		const urlRedirect = page.url.searchParams.get('redirect');
		if (urlRedirect) {
			redirectPath = decodeURIComponent(urlRedirect);
			savePreviousPath(redirectPath);
		} else {
			// Otherwise use the previously saved path or default to home
			const prevPath = getPreviousPath();
			if (prevPath && prevPath !== '/') {
				savePreviousPath(prevPath);
			} else {
				savePreviousPath('/');
			}
		}
	});

	async function handleGitHubSignIn() {
		const { success } = await signInWithGitHub();
		if (!success) {
			errorMessage = 'Failed to initiate GitHub sign in';
		}
	}

	async function handleDiscordSignIn() {
		const { success } = await signInWithDiscord();
		if (!success) {
			errorMessage = 'Failed to initiate Discord sign in';
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
		<h2 class="mb-6 text-center text-2xl font-bold text-gray-800">Sign In</h2>

		{#if errorMessage}
			<div class="mb-4 rounded bg-red-100 p-4 text-red-700">{errorMessage}</div>
		{/if}

		<div class="mt-4 flex flex-col space-y-3">
			<div class="relative">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-gray-300"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="bg-white px-2 text-gray-500">Sign in with</span>
				</div>
			</div>

			<button
				type="button"
				onclick={handleGitHubSignIn}
				class="flex w-full items-center justify-center gap-3 rounded-md bg-gray-800 px-4 py-2 text-white shadow-sm hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none"
				disabled={authStore.loading}
			>
				<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path
						fill-rule="evenodd"
						d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
						clip-rule="evenodd"
					/>
				</svg>
				{#if authStore.loading}
					<span class="flex items-center justify-center">
						<svg
							class="mr-2 h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
						Processing...
					</span>
				{:else}
					GitHub
				{/if}
			</button>

			<button
				type="button"
				onclick={handleDiscordSignIn}
				class="flex w-full items-center justify-center gap-3 rounded-md bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
				disabled={authStore.loading}
			>
				<svg
					class="h-5 w-5"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 127.14 96.36"
					fill="currentColor"
				>
					<path
						d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
					/>
				</svg>
				{#if authStore.loading}
					<span class="flex items-center justify-center">
						<svg
							class="mr-2 h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0,0,1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
						Processing...
					</span>
				{:else}
					Discord
				{/if}
			</button>
		</div>
	</div>
</div>
