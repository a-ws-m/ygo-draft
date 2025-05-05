<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let newPassword = $state('');
	let confirmPassword = $state('');
	let errorMessage = $state('');
	let successMessage = $state('');
	let loading = $state(false);

	onMount(async () => {
		// Check if we have the required hash parameters from the reset email
		const hash = page.url.hash;
		if (!hash || !hash.includes('type=recovery')) {
			errorMessage = 'Invalid or expired password reset link';
		}
	});

	async function handleResetPassword(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';
		successMessage = '';

		if (newPassword !== confirmPassword) {
			errorMessage = 'Passwords do not match';
			return;
		}

		if (newPassword.length < 6) {
			errorMessage = 'Password must be at least 6 characters';
			return;
		}

		try {
			loading = true;
			const { error } = await supabase.auth.updateUser({
				password: newPassword
			});

			if (error) throw error;

			successMessage = 'Password updated successfully';
			// Redirect after a short delay
			setTimeout(() => {
				goto('/auth');
			}, 2000);
		} catch (error) {
			console.error('Error resetting password:', error);
			errorMessage = error.message || 'Failed to reset password';
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
		<h2 class="mb-6 text-center text-2xl font-bold text-gray-800">Reset Your Password</h2>

		{#if successMessage}
			<div class="mb-4 rounded bg-green-100 p-4 text-green-700">{successMessage}</div>
		{/if}

		{#if errorMessage}
			<div class="mb-4 rounded bg-red-100 p-4 text-red-700">{errorMessage}</div>
		{/if}

		<form onsubmit={handleResetPassword} class="space-y-4">
			<div>
				<label for="new-password" class="block text-sm font-medium text-gray-700"
					>New Password</label
				>
				<input
					id="new-password"
					type="password"
					bind:value={newPassword}
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none"
					required
					disabled={!!errorMessage}
				/>
			</div>

			<div>
				<label for="confirm-password" class="block text-sm font-medium text-gray-700"
					>Confirm Password</label
				>
				<input
					id="confirm-password"
					type="password"
					bind:value={confirmPassword}
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none"
					required
					disabled={!!errorMessage}
				/>
			</div>

			<div>
				<button
					type="submit"
					class="w-full rounded-md bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
					disabled={loading || !!errorMessage}
				>
					{#if loading}
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
						Reset Password
					{/if}
				</button>
			</div>
		</form>

		<div class="mt-4 text-center">
			<a href="/auth" class="text-sm text-indigo-600 hover:text-indigo-500 focus:outline-none">
				Back to Sign In
			</a>
		</div>
	</div>
</div>
