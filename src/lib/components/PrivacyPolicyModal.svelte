<script lang="ts">
	import feather from 'feather-icons';

	// Define the onClose prop
	let { onClose } = $props<{ onClose: () => void }>();

	// Create SVG strings for the icons we need
	const crossIcon = feather.icons['x'].toSvg({ width: 16, height: 16 });

	function closeModal() {
		onClose();
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
	class="modal modal-open modal-bottom sm:modal-middle"
	onclick={handleBackdropClick}
	onkeydown={(e) => e.key === 'Enter' && handleBackdropClick(e)}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<div class="modal-box relative max-h-[90vh] max-w-3xl overflow-y-auto">
		<button
			class="btn btn-sm btn-circle btn-ghost absolute top-2 right-2"
			onclick={closeModal}
			aria-label="Close"
		>
			{@html crossIcon}
		</button>

		<div class="pr-6">
			<h2 class="mb-4 text-2xl font-bold">Privacy Policy</h2>

			<div class="prose prose-sm text-base-content max-w-none">
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
				<ul class="list-none space-y-2 pl-0">
					<li class="text-error flex items-center">
						<span class="text-error mr-2 flex-shrink-0" aria-hidden="true">
							{@html crossIcon}
						</span>
						<span>Send marketing emails</span>
					</li>
					<li class="text-error flex items-center">
						<span class="text-error mr-2 flex-shrink-0" aria-hidden="true">
							{@html crossIcon}
						</span>
						<span>Share your information with third parties</span>
					</li>
					<li class="text-error flex items-center">
						<span class="text-error mr-2 flex-shrink-0" aria-hidden="true">
							{@html crossIcon}
						</span>
						<span>Use your data for analytics beyond basic usage metrics</span>
					</li>
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
						rel="noopener noreferrer"
						class="link link-primary"
					>
						here
					</a>.
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
						rel="noopener noreferrer"
						class="link link-primary"
					>
						GitHub repository
					</a>.
				</p>
			</div>
		</div>
	</div>
</div>
