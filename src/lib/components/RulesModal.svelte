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
								Rochester Draft is a draft format where players open packs, make picks, and pass the
								remaining cards to adjacent players.
							</p>

							<h5 class="font-medium text-gray-800">Setup:</h5>
							<ol>
								<li>Each player receives a number of sealed packs.</li>
								<li>Players sit in a circle or around a table.</li>
							</ol>

							<h5 class="font-medium text-gray-800">Draft Process:</h5>
							<ol>
								<li>All players simultaneously open one pack each.</li>
								<li>
									Each player selects one card from their open pack and sets it aside face-down.
								</li>
								<li>
									After everyone has picked, each player passes their remaining pack to the adjacent
									player in the agreed direction.
								</li>
								<li>
									Players then select a card from the new pack they received and continue passing.
								</li>
								<li>This continues until all cards from the packs have been drafted.</li>
								<li>
									Players then start a new round by opening a new pack of cards each. Each player
									passes their pack the opposite direction.
								</li>
								<li>
									This process repeats until all packs are drafted and each player has their desired
									deck size.
								</li>
							</ol>

							<h5 class="font-medium text-gray-800">Strategy Tips:</h5>
							<p>
								Pay attention to what cards you pass and what cards are passed to you. This helps
								you identify what strategies adjacent players are pursuing, allowing you to avoid
								competing for the same card types and maximize the quality of cards you receive.
							</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
