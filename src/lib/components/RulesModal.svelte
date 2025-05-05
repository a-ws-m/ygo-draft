<script lang="ts">
	export let isOpen = false;
	export let draftMethod = 'winston';

	function closeModal() {
		isOpen = false;
	}

	// Close on escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			closeModal();
		}
	}

	// Handle click on backdrop to close the modal
	function handleBackdropClick(event: MouseEvent) {
		// Only close if the click was directly on the backdrop
		if (event.target === event.currentTarget) {
			closeModal();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto backdrop-blur-sm"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		aria-describedby="modal-description"
		tabindex="-1"
	>
		<div class="relative w-full max-w-2xl p-4">
			<!-- Modal content -->
			<div class="relative rounded-lg bg-white shadow">
				<!-- Header -->
				<div class="flex items-center justify-between rounded-t border-b p-4">
					<h3 class="text-xl font-semibold text-gray-900" id="modal-title">
						{draftMethod === 'winston' ? 'Winston' : 'Rochester'} Draft Rules
					</h3>
					<button
						type="button"
						class="ml-auto inline-flex items-center rounded-lg p-1.5 text-gray-400 hover:text-gray-900"
						onclick={closeModal}
						aria-label="Close"
					>
						×
					</button>
				</div>

				<!-- Body -->
				<div class="p-6">
					<div class="prose prose-sm max-w-none" id="modal-description">
						{#if draftMethod === 'winston'}
							<h4 class="font-medium text-gray-900">Winston Draft Rules</h4>
							<p>
								Winston Draft is a two-player draft format where players take turns choosing from
								one of several piles of cards.
							</p>

							<h5 class="font-medium text-gray-800">Setup:</h5>
							<ol>
								<li>A shared deck of cards is shuffled.</li>
								<li>Three piles are created face-down, with one card in each pile initially.</li>
							</ol>

							<h5 class="font-medium text-gray-800">On Your Turn:</h5>
							<ol>
								<li>Look at the first pile.</li>
								<li>You must decide whether to take all cards in that pile or pass.</li>
								<li>
									If you take the pile:
									<ul>
										<li>Add all cards from that pile to your drafted deck.</li>
										<li>Replace the pile with a new card from the deck.</li>
									</ul>
								</li>
								<li>
									If you pass on the pile:
									<ul>
										<li>Add one card from the top of the deck to that pile.</li>
										<li>Look at the next pile and repeat the process.</li>
									</ul>
								</li>
								<li>
									If you pass on all piles:
									<ul>
										<li>Take the top card of the deck.</li>
									</ul>
								</li>
								<li>Play alternates between players until the deck is exhausted.</li>
							</ol>

							<h5 class="font-medium text-gray-800">Strategy Tip:</h5>
							<p>
								Balancing when to take a pile versus when to pass is key. Passing can make piles
								more attractive for later turns, but you risk your opponent taking valuable cards.
							</p>
						{:else}
							<h4 class="font-medium text-gray-900">Rochester Draft Rules</h4>
							<p>
								Rochester Draft is a draft format where players pick cards from visible packs in a
								predetermined order.
							</p>

							<h5 class="font-medium text-gray-800">Setup:</h5>
							<ol>
								<li>Each player is assigned a seat position.</li>
								<li>A number of packs are prepared based on the pool size and pack size.</li>
							</ol>

							<h5 class="font-medium text-gray-800">Draft Process:</h5>
							<ol>
								<li>One pack is opened and all cards are laid out face-up for everyone to see.</li>
								<li>Players take turns picking one card at a time from the visible pack.</li>
								<li>In the first pack, the order goes player 1, player 2, player 3, etc.</li>
								<li>When the pack is empty, another pack is opened.</li>
								<li>For the second pack, the direction reverses: player n, player n-1, etc.</li>
								<li>
									Direction alternates with each new pack (clockwise, counter-clockwise, clockwise,
									etc.).
								</li>
								<li>This continues until all packs are drafted.</li>
							</ol>

							<h5 class="font-medium text-gray-800">Strategy Tips:</h5>
							<p>
								Since all cards are visible, you can see what other players are drafting. This
								allows for strategic hate-drafting (taking cards to prevent others from getting
								them) and signaling (showing what types of cards you're prioritizing).
							</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
