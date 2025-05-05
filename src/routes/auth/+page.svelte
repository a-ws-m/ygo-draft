<script lang="ts">
	import {
		store as authStore,
		signIn,
		signUp,
		resetPassword,
		getPreviousPath
	} from '$lib/stores/authStore.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let isLogin = $state(true);
	let isForgotPassword = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let redirectPath = $state('/');

	onMount(() => {
		// Check if there's a redirect query parameter
		const urlRedirect = page.url.searchParams.get('redirect');
		if (urlRedirect) {
			redirectPath = decodeURIComponent(urlRedirect);
		} else {
			// Otherwise use the previously saved path
			redirectPath = getPreviousPath();
		}
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';
		successMessage = '';

		if (isForgotPassword) {
			if (!email) {
				errorMessage = 'Email is required';
				return;
			}

			const { success, error } = await resetPassword(email);
			if (success) {
				successMessage = 'Password reset email sent! Check your inbox.';
			} else {
				errorMessage = error.message || 'Failed to send reset email';
			}
			return;
		}

		if (!email || !password) {
			errorMessage = 'Email and password are required';
			return;
		}

		if (!isLogin && password !== confirmPassword) {
			errorMessage = 'Passwords do not match';
			return;
		}

		if (isLogin) {
			// Login
			const { success, error } = await signIn(email, password);
			if (success) {
				goto(redirectPath);
			} else {
				errorMessage = error.message || 'Failed to sign in';
			}
		} else {
			// Sign up
			const { success, error } = await signUp(email, password);
			if (success) {
				successMessage = 'Sign up successful! Please check your email for verification.';
				isLogin = true;
			} else {
				errorMessage = error.message || 'Failed to sign up';
			}
		}
	}

	function toggleAuthMode() {
		isLogin = !isLogin;
		isForgotPassword = false;
		errorMessage = '';
		successMessage = '';
	}

	function toggleForgotPassword() {
		isForgotPassword = !isForgotPassword;
		errorMessage = '';
		successMessage = '';
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
		<h2 class="mb-6 text-center text-2xl font-bold text-gray-800">
			{#if isForgotPassword}
				Reset Password
			{:else}
				{isLogin ? 'Sign In' : 'Create Account'}
			{/if}
		</h2>

		{#if successMessage}
			<div class="mb-4 rounded bg-green-100 p-4 text-green-700">{successMessage}</div>
		{/if}

		{#if errorMessage}
			<div class="mb-4 rounded bg-red-100 p-4 text-red-700">{errorMessage}</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none"
					required
				/>
			</div>

			{#if !isForgotPassword}
				<div>
					<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none"
						required
					/>
				</div>
			{/if}

			{#if !isLogin && !isForgotPassword}
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
					/>
				</div>
			{/if}

			<div>
				<button
					type="submit"
					class="w-full rounded-md bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
					disabled={authStore.loading}
				>
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
					{:else if isForgotPassword}
						Send Reset Link
					{:else}
						{isLogin ? 'Sign In' : 'Sign Up'}
					{/if}
				</button>
			</div>
		</form>

		<div class="mt-4 space-y-2 text-center">
			{#if isLogin && !isForgotPassword}
				<button
					onclick={toggleForgotPassword}
					class="block text-sm text-indigo-600 hover:text-indigo-500 focus:outline-none"
				>
					Forgot your password?
				</button>
			{/if}

			{#if isForgotPassword}
				<button
					onclick={toggleForgotPassword}
					class="block text-sm text-indigo-600 hover:text-indigo-500 focus:outline-none"
				>
					Back to Sign In
				</button>
			{:else}
				<button
					onclick={toggleAuthMode}
					class="block text-sm text-indigo-600 hover:text-indigo-500 focus:outline-none"
				>
					{isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
				</button>
			{/if}
		</div>
	</div>
</div>
