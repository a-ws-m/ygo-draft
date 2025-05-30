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
	import { base } from '$app/paths';
	import PrivacyPolicyModal from '$lib/components/PrivacyPolicyModal.svelte';
	import feather from 'feather-icons';

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
					<a href={`${base}/`} class="btn btn-ghost text-primary font-bold">
						<!-- Show home icon on mobile, text on larger screens -->
						<span class="md:hidden">
							{@html feather.icons.home.toSvg({ width: 24, height: 24 })}
						</span>
						<span class="hidden text-xl md:block">YGO Draft</span>
					</a>
				</div>
				<div class="navbar-end">
					<!-- Account dropdown using details/summary -->
					<details class="dropdown dropdown-end">
						<summary class="btn btn-primary btn-sm m-1">
							{@html feather.icons.user.toSvg({ width: 16, height: 16, class: 'mr-1' })}
							Account
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow">
							{#if authStore.session.user.email}
								<li class="menu-title text-base-content/70 px-4 py-2 text-xs">
									{authStore.session.user.email}
								</li>
							{/if}
							<li>
								<button onclick={signOut} class="text-base-content">
									{@html feather.icons['log-out'].toSvg({ width: 16, height: 16, class: 'mr-2' })}
									Sign Out
								</button>
							</li>
							<li>
								<button onclick={confirmDeleteAccount} class="text-error">
									{@html feather.icons.trash.toSvg({ width: 16, height: 16, class: 'mr-2' })}
									Delete Account
								</button>
							</li>
						</ul>
					</details>

					<!-- Privacy Policy - always visible -->
					<button onclick={togglePrivacyPolicy} class="btn btn-ghost btn-sm">
						{@html feather.icons.shield.toSvg({ width: 16, height: 16, class: 'mr-1' })}
						Privacy Policy
					</button>

					<!-- Mobile menu drawer using details/summary -->
					<details class="dropdown dropdown-end md:hidden">
						<summary class="btn btn-ghost btn-circle m-1">
							{@html feather.icons.menu.toSvg({ width: 24, height: 24 })}
						</summary>
						<ul
							class="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow"
							role="menu"
						>
							<li role="menuitem">
								<a href="https://github.com/a-ws-m/ygo-draft/issues" target="_blank">
									{@html feather.icons['alert-circle'].toSvg({
										width: 16,
										height: 16,
										class: 'mr-2'
									})}
									Bug reports
								</a>
							</li>
							<li role="menuitem">
								<a href="https://github.com/a-ws-m/ygo-draft" target="_blank">
									{@html feather.icons.github.toSvg({ width: 16, height: 16, class: 'mr-2' })}
									GitHub
								</a>
							</li>
							<li role="menuitem">
								<a href="https://www.buymeacoffee.com/a.ws.m" target="_blank">
									{@html feather.icons.coffee.toSvg({ width: 16, height: 16, class: 'mr-2' })}
									Buy Me A Coffee
								</a>
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
							{@html feather.icons['alert-circle'].toSvg({
								width: 16,
								height: 16,
								class: 'mr-1'
							})}
							Bug reports
						</a>
						<a
							href="https://github.com/a-ws-m/ygo-draft"
							target="_blank"
							class="btn btn-ghost btn-circle"
							aria-label="GitHub"
						>
							{@html feather.icons.github.toSvg({ width: 16, height: 16 })}
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
			<PrivacyPolicyModal onClose={togglePrivacyPolicy} />
		{/if}

		<!-- Footer could go here -->
	{:else}
		<!-- Loading state -->
		<div class="flex h-screen w-full items-center justify-center">
			{@html feather.icons.loader.toSvg({
				class: 'animate-spin text-primary',
				width: 48,
				height: 48
			})}
		</div>
	{/if}
</div>
