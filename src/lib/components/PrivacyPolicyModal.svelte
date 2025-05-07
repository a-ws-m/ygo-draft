<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	function closeModal() {
		dispatch('close');
	}

	// Close modal when clicking outside or pressing escape
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeModal();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div
	class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black"
	onclick={handleBackdropClick}
	onkeydown={(e) => e.key === 'Enter' && handleBackdropClick(e)}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<div
		class="relative mx-auto max-h-[90vh] max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
	>
		<button
			class="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
			onclick={closeModal}
			aria-label="Close"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>

		<div class="pr-8">
			<h2 class="mb-4 text-2xl font-bold">Privacy Policy</h2>

			<div class="prose prose-sm max-w-none text-gray-700">
				<p>
					Your privacy is important to us. This policy outlines what information we collect and how
					we use it.
				</p>

				<h3>Information We Collect</h3>
				<p>
					When you sign in to YGO Draft, we store your email address in our Supabase database. This
					is used solely for authentication purposes and to associate your drafts with your account.
				</p>

				<h3>How We Use Your Information</h3>
				<p>
					We only use your email address for account identification. We do <strong>not:</strong>
				</p>
					<ul>
					<li>Send marketing emails</li>
					<li>Share your information with third parties</li>
					<li>Use your data for analytics beyond basic usage metrics</li>
				</ul>

				<h3>Data Deletion</h3>
				<p>You can delete your account and all associated data at any time by:</p>
				<ol>
					<li>Signing into the website</li>
					<li>Clicking the "Delete Account" button in the navigation bar</li>
					<li>Confirming the deletion when prompted</li>
				</ol>

				<h3>Third-Party Services</h3>
				<p>
					We use hCaptcha for verification during anonymous login. Their privacy policy applies to
					their service and can be found
					<a
						href="https://www.hcaptcha.com/privacy"
						target="_blank"
						rel="noopener noreferrer">here</a
					>.
				</p>

				<h3>Changes to This Policy</h3>
				<p>
					We may update this privacy policy from time to time. Any changes will be posted on this
					page.
				</p>

				<h3>Contact</h3>
				<p>
					If you have any questions about our privacy practices, please open an issue on our
					<a
						href="https://github.com/a-ws-m/ygo-draft/issues"
						target="_blank"
						rel="noopener noreferrer">GitHub repository</a
					>.
				</p>
			</div>
		</div>
	</div>
</div>
