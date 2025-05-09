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
	import PrivacyPolicyModal from '$lib/components/PrivacyPolicyModal.svelte';

	let { children } = $props();
	let showPrivacyPolicy = $state(false);

	function confirmDeleteAccount() {
		if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
			deleteAccount();
		}
	}

	function togglePrivacyPolicy() {
		showPrivacyPolicy = !showPrivacyPolicy;
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
			<header class="navbar bg-base-100 shadow">
				<div class="navbar-start">
					<a href={`${base}/`} class="btn btn-ghost text-primary text-xl font-bold">YGO Draft</a>
				</div>
				<div class="navbar-end">
					<!-- Account dropdown using details/summary -->
					<details class="dropdown dropdown-end">
						<summary class="btn btn-primary btn-sm m-1">Account</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow">
							{#if authStore.session.user.email}
								<li class="menu-title text-base-content/70 px-4 py-2 text-xs">
									{authStore.session.user.email}
								</li>
							{/if}
							<li><button onclick={signOut} class="text-base-content">Sign Out</button></li>
							<li>
								<button onclick={confirmDeleteAccount} class="text-error">Delete Account</button>
							</li>
						</ul>
					</details>

					<!-- Privacy Policy - always visible -->
					<button onclick={togglePrivacyPolicy} class="btn btn-ghost btn-sm">
						Privacy Policy
					</button>

					<!-- Mobile menu drawer using details/summary -->
					<details class="dropdown dropdown-end md:hidden">
						<summary class="btn btn-ghost btn-circle m-1">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="feather feather-menu"
								><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"
								></line><line x1="3" y1="18" x2="21" y2="18"></line></svg
							>
						</summary>
						<ul
							class="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow"
							role="menu"
						>
							<li role="menuitem">
								<a href="https://github.com/a-ws-m/ygo-draft/issues" target="_blank">Bug reports</a>
							</li>
							<li role="menuitem">
								<a href="https://github.com/a-ws-m/ygo-draft" target="_blank">GitHub</a>
							</li>
							<li role="menuitem">
								<a href="https://www.buymeacoffee.com/a.ws.m" target="_blank">Buy Me A Coffee</a>
							</li>
						</ul>
					</details>

					<!-- Desktop navigation options -->
					<div class="hidden items-center md:flex">
						<a
							href="https://github.com/a-ws-m/ygo-draft/issues"
							target="_blank"
							class="btn btn-ghost btn-sm"
						>
							Bug reports
						</a>
						<a
							href="https://github.com/a-ws-m/ygo-draft"
							target="_blank"
							class="btn btn-ghost btn-circle"
							aria-label="GitHub"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="currentColor"
								class="h-5 w-5"
							>
								<path
									d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
								/>
							</svg>
						</a>

						<a
							href="https://www.buymeacoffee.com/a.ws.m"
							target="_blank"
							class="mx-2 flex items-center"
						>
							<img
								src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
								alt="Buy Me A Coffee"
								class="max-w-28"
							/>
						</a>
					</div>
				</div>
			</header>
		{/if}

		<!-- Render the page content -->
		<main class="flex-1">
			{@render children()}
		</main>

		<!-- Privacy Policy Modal -->
		{#if showPrivacyPolicy}
			<PrivacyPolicyModal on:close={togglePrivacyPolicy} />
		{/if}

		<!-- Footer could go here -->
	{:else}
		<!-- Loading state -->
		<div class="flex h-screen w-full items-center justify-center">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{/if}
</div>
