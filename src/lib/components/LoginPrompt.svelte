<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import {
		store as authStore,
		signInWithGitHub,
		signInWithDiscord,
		signInAnonymously
	} from '$lib/stores/authStore.svelte';

	const dispatch = createEventDispatcher();
	let isProcessing = $state(false);
	let hcaptchaWidget: any;
	let hcaptchaToken = $state('');
	let hcaptchaLoaded = $state(false);
	let hcaptchaError = $state(false);
	const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY;

	// Function to check if hCaptcha is loaded and render the widget
	function renderHcaptcha() {
		if (window.hcaptcha) {
			try {
				hcaptchaWidget = window.hcaptcha.render('hcaptcha-container', {
					sitekey: HCAPTCHA_SITE_KEY,
					theme: 'light',
					callback: (token: string) => {
						hcaptchaToken = token;
					},
					'expired-callback': () => {
						hcaptchaToken = '';
					},
					'error-callback': () => {
						hcaptchaError = true;
					}
				});
				hcaptchaLoaded = true;
				hcaptchaError = false;
			} catch (error) {
				console.error('Error rendering hCaptcha:', error);
				hcaptchaError = true;
			}
		}
	}

	onMount(() => {
		// Check if hCaptcha is already loaded
		if (window.hcaptcha) {
			renderHcaptcha();
		} else {
			// Set up a listener to check when the script is loaded
			window.addEventListener('hCaptchaLoaded', renderHcaptcha);

			// Also set a timeout to check again in case the event isn't fired
			setTimeout(() => {
				if (!hcaptchaLoaded && window.hcaptcha) {
					renderHcaptcha();
				} else if (!hcaptchaLoaded) {
					hcaptchaError = true;
				}
			}, 3000);
		}

		return () => {
			window.removeEventListener('hCaptchaLoaded', renderHcaptcha);
		};
	});

	async function handleGitHubLogin() {
		isProcessing = true;
		try {
			await signInWithGitHub();
			dispatch('login');
		} catch (error) {
			console.error('Error signing in with GitHub:', error);
		} finally {
			isProcessing = false;
		}
	}

	async function handleDiscordLogin() {
		isProcessing = true;
		try {
			await signInWithDiscord();
			dispatch('login');
		} catch (error) {
			console.error('Error signing in with Discord:', error);
		} finally {
			isProcessing = false;
		}
	}

	async function handleAnonymousLogin() {
		if (!hcaptchaToken) {
			alert('Please complete the captcha verification first');
			return;
		}

		isProcessing = true;
		try {
			const result = await signInAnonymously(hcaptchaToken);
			if (result.success) {
				dispatch('login');
			} else {
				alert('Anonymous login failed. Please try again.');
				// Reset hCaptcha
				if (window.hcaptcha) {
					window.hcaptcha.reset(hcaptchaWidget);
				}
			}
		} catch (error) {
			console.error('Error signing in anonymously:', error);
		} finally {
			isProcessing = false;
		}
	}
</script>

<svelte:head>
	<script
		src="https://js.hcaptcha.com/1/api.js"
		async
		defer
		onload={() => {
			window.dispatchEvent(new Event('hCaptchaLoaded'));
		}}
	></script>
</svelte:head>

<div class="flex flex-col items-center space-y-6 py-8 text-center">
	<div class="mb-4 space-y-3">
		<h2 class="text-xl font-bold text-gray-800">Login to Start Drafting</h2>
		<p class="text-gray-600">
			You need to login to create and participate in drafts. Sign in with one of the methods below
			to get started.
		</p>
	</div>

	<div class="w-full max-w-sm space-y-4">
		<button
			type="button"
			onclick={handleGitHubLogin}
			disabled={isProcessing}
			class="flex w-full items-center justify-center rounded-md bg-gray-800 px-4 py-2 text-white shadow-sm hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none disabled:bg-gray-400"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="currentColor"
				class="mr-2"
			>
				<path
					d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
				/>
			</svg>
			Sign in with GitHub
		</button>

		<button
			type="button"
			onclick={handleDiscordLogin}
			disabled={isProcessing}
			class="flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:bg-gray-400"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 127.14 96.36"
				fill="currentColor"
				class="mr-2"
			>
				<path
					d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
				/>
			</svg>
			Sign in with Discord
		</button>

		<!-- Divider with text -->
		<div class="relative my-4">
			<div class="absolute inset-0 flex items-center">
				<div class="w-full border-t border-gray-300"></div>
			</div>
			<div class="relative flex justify-center text-sm">
				<span class="bg-white px-2 text-gray-500">Or</span>
			</div>
		</div>

		<!-- hCaptcha container with loading/error states -->
		<div class="my-4">
			{#if hcaptchaError}
				<div class="mb-2 text-red-500">
					Failed to load captcha. Please refresh the page and try again.
				</div>
			{:else if !hcaptchaLoaded}
				<div class="flex h-[78px] items-center justify-center">
					<div class="animate-pulse text-gray-400">Loading captcha...</div>
				</div>
			{/if}
			<div id="hcaptcha-container" class="flex justify-center"></div>
		</div>

		<button
			type="button"
			onclick={handleAnonymousLogin}
			disabled={isProcessing || !hcaptchaToken}
			class="flex w-full items-center justify-center rounded-md bg-green-600 px-4 py-2 text-white shadow-sm hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none disabled:bg-gray-400"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="mr-2"
			>
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
				<circle cx="9" cy="7" r="4"></circle>
				<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
				<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
			</svg>
			Continue Anonymously
		</button>
	</div>

	{#if isProcessing}
		<div class="mt-4 flex items-center justify-center">
			<svg
				class="mr-2 h-5 w-5 animate-spin text-indigo-600"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
			<span>Processing...</span>
		</div>
	{/if}
</div>

<style>
	:global(.h-captcha) {
		display: inline-block;
	}
</style>
