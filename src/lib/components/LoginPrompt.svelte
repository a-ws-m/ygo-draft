<script lang="ts">
	import { onMount } from 'svelte';
	import {
		store as authStore,
		signInWithGitHub,
		signInWithDiscord,
		signInAnonymously
	} from '$lib/stores/authStore.svelte';
	import PrivacyPolicyModal from '$lib/components/PrivacyPolicyModal.svelte';
	import feather from 'feather-icons';

	let isProcessing = $state(false);
	let hcaptchaWidget = $state<any>(null);
	let hcaptchaToken = $state('');
	let hcaptchaLoaded = $state(false);
	let hcaptchaError = $state(false);
	let HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY;
	let showPrivacyPolicy = $state(false);

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

	function togglePrivacyPolicy() {
		showPrivacyPolicy = !showPrivacyPolicy;
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

<div class="card bg-base-200 mx-auto w-full max-w-md shadow-xl">
	<div class="card-body items-center text-center">
		<h2 class="card-title text-xl">Login to Start Drafting</h2>
		<p class="text-base-content/70">
			You need to login to create and participate in drafts. Sign in with one of the methods below
			to get started.
		</p>

		<div class="mt-4 w-full space-y-4">
			<!-- <button
				type="button"
				onclick={handleGitHubLogin}
				disabled={isProcessing}
				class="btn btn-neutral w-full"
			>
				{@html feather.icons.github.toSvg({ class: 'w-5 h-5 mr-2' })}
				Sign in with GitHub
			</button>

			<button
				type="button"
				onclick={handleDiscordLogin}
				disabled={isProcessing}
				class="btn btn-primary w-full"
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

			Divider with text
			<div class="divider">Or</div> -->

			<!-- hCaptcha container with loading/error states -->
			<div class="my-4">
				{#if hcaptchaError}
					<div class="alert alert-error mb-2">
						<div>
							{@html feather.icons.alertTriangle.toSvg({ class: 'w-5 h-5' })}
							<span>Failed to load captcha. Please refresh the page and try again.</span>
						</div>
					</div>
				{:else if !hcaptchaLoaded}
					<div class="flex h-[78px] items-center justify-center">
						<span class="loading loading-spinner loading-md text-primary"></span>
						<span class="ml-2">Loading captcha...</span>
					</div>
				{/if}
				<div id="hcaptcha-container" class="flex justify-center"></div>

				<!-- hCaptcha privacy warning -->
				<div class="mt-2 text-xs opacity-70">
					This site is protected by hCaptcha and its
					<a
						href="https://www.hcaptcha.com/privacy"
						class="link link-primary"
						target="_blank"
						rel="noopener noreferrer">Privacy Policy</a
					>
					and
					<a
						href="https://www.hcaptcha.com/terms"
						class="link link-primary"
						target="_blank"
						rel="noopener noreferrer">Terms of Service</a
					> apply.
				</div>

				<!-- Privacy notice -->
				<div class="mt-3 text-sm opacity-80">
					By signing in, you agree to our
					<a
						href="#privacy"
						onclick={(e) => {
							e.preventDefault();
							togglePrivacyPolicy();
						}}
						class="link link-primary"
					>
						Privacy Policy
					</a>
				</div>
			</div>

			<button
				type="button"
				onclick={handleAnonymousLogin}
				disabled={isProcessing || !hcaptchaToken}
				class="btn btn-success w-full"
			>
				{@html feather.icons.user.toSvg({ class: 'w-5 h-5 mr-2' })}
				Continue Anonymously
			</button>
		</div>

		{#if isProcessing}
			<div class="mt-4 flex items-center justify-center">
				<span class="loading loading-spinner loading-md text-primary mr-2"></span>
				<span>Processing...</span>
			</div>
		{/if}
	</div>
</div>

{#if showPrivacyPolicy}
	<PrivacyPolicyModal onClose={togglePrivacyPolicy} />
{/if}

<style>
	:global(.h-captcha) {
		display: inline-block;
	}
</style>
