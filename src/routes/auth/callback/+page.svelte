<!-- filepath: /home/awsm/dev/ygo-draft/src/routes/auth/callback/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import { getPreviousPath } from '$lib/stores/authStore.svelte';

	let errorMessage = $state('');
	let isProcessing = $state(true);

	onMount(async () => {
		try {
			// Get the code from the URL
			const url = new URL(window.location.href);
			const code = url.searchParams.get('code');

			if (!code) {
				throw new Error('No code provided in URL');
			}

			// Exchange the code for a session
			const { data, error } = await supabase.auth.exchangeCodeForSession(code);

			if (error) {
				throw error;
			}

			// Get the redirect path from storage
			const redirectPath = getPreviousPath();

			// Small delay to ensure auth state is processed
			setTimeout(() => {
				goto(redirectPath);
			}, 100);
		} catch (err) {
			console.error('Error during auth callback:', err);
			errorMessage = 'Authentication failed. Please try again.';
			isProcessing = false;
		}
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
		{#if isProcessing}
			<div class="flex flex-col items-center justify-center space-y-4">
				<svg
					class="h-8 w-8 animate-spin text-indigo-600"
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
				<p class="text-center text-gray-600">Completing your sign in...</p>
			</div>
		{:else if errorMessage}
			<div class="space-y-4">
				<div class="rounded bg-red-100 p-4 text-red-700">{errorMessage}</div>
				<div class="flex justify-center">
					<a
						href="/auth"
						class="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
					>
						Try Again
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
