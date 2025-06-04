<script lang="ts">
	import feather from 'feather-icons';

	// Group all props together on one line
	let { isOpen = $bindable(false), draftMethod = 'winston' as 'winston' | 'rochester' | 'grid' | 'asynchronous' } =
		$props();

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

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div
		class="modal modal-open"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		aria-describedby="modal-description"
		tabindex="-1"
	>
		<div class="modal-box max-w-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b pb-4">
				<h3 class="text-xl font-semibold" id="modal-title">
					{draftMethod === 'winston'
						? 'Winston'
						: draftMethod === 'rochester'
							? 'Rochester'
							: draftMethod === 'grid'
								? 'Grid'
								: 'Asynchronous'} Draft Rules
				</h3>
				<button
					type="button"
					class="btn btn-sm btn-circle btn-ghost"
					onclick={closeModal}
					aria-label="Close"
				>
					{@html feather.icons.x.toSvg({ class: 'h-5 w-5' })}
				</button>
			</div>

			<!-- Body -->
			<div class="py-4">
				<div class="prose prose-sm max-w-none" id="modal-description">
					{#if draftMethod === 'winston'}
						<h4 class="font-medium">Winston Draft Rules</h4>
						<p>
							Winston Draft is a two-player draft format where players take turns choosing from one
							of several piles of cards.
						</p>

						<h5 class="font-medium">Setup:</h5>
						<ol>
							<li>A shared deck of cards is shuffled.</li>
							<li>Three piles are created face-down, with one card in each pile initially.</li>
						</ol>

						<h5 class="font-medium">On Your Turn:</h5>
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

						<h5 class="font-medium">Strategy Tip:</h5>
						<p>
							Balancing when to take a pile versus when to pass is key. Passing can make piles more
							attractive for later turns, but you risk your opponent taking valuable cards.
						</p>
					{:else if draftMethod === 'rochester'}
						<h4 class="font-medium">Rochester Draft Rules</h4>
						<p>
							Rochester Draft is a draft format where players open packs, make picks, and pass the
							remaining cards to adjacent players.
						</p>

						<h5 class="font-medium">Setup:</h5>
						<ol>
							<li>Each player receives a number of sealed packs.</li>
							<li>Players sit in a circle or around a table.</li>
						</ol>

						<h5 class="font-medium">Draft Process:</h5>
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

						<h5 class="font-medium">Strategy Tips:</h5>
						<p>
							Pay attention to what cards you pass and what cards are passed to you. This helps you
							identify what strategies adjacent players are pursuing, allowing you to avoid
							competing for the same card types and maximize the quality of cards you receive.
						</p>
					{:else if draftMethod === 'grid'}
						<h4 class="font-medium">Grid Draft Rules</h4>
						<p>
							Grid Draft is a draft format where cards are laid out in a square grid, and players
							take turns selecting either a row or column of cards.
						</p>

						<h5 class="font-medium">Setup:</h5>
						<ol>
							<li>A shared pool of cards is shuffled.</li>
							<li>Cards are arranged in a square grid (typically 3×3).</li>
						</ol>

						<h5 class="font-medium">On Your Turn:</h5>
						<ol>
							<li>
								You must choose to take either a complete row or a complete column of cards from the
								grid.
							</li>
							<li>Add all cards from that row or column to your drafted deck.</li>
							<li>The empty spaces in the grid are filled with new cards from the pool.</li>
							<li>Play passes to the next player.</li>
							<li>The draft continues until each player has drafted their target deck size.</li>
						</ol>

						<h5 class="font-medium">Strategy Tips:</h5>
						<p>
							Pay attention to what cards you're leaving for your opponent in other rows and columns
							after your selection.
						</p>
					{:else}
						<h4 class="font-medium">Asynchronous Draft Rules</h4>
						<p>
							Asynchronous Draft is a draft format where players open packs and pick cards at their own pace,
							without needing to wait for other players to be online.
						</p>

						<h5 class="font-medium">Setup:</h5>
						<ol>
							<li>A shared pool of cards is shuffled and organized into packs.</li>
							<li>Each pack contains a set number of cards determined by the draft creator.</li>
							<li>Players can draft whenever they want, with no need to coordinate schedules.</li>
						</ol>

						<h5 class="font-medium">Draft Process:</h5>
						<ol>
							<li>Each player opens a pack of cards and selects a specified number of cards from it.</li>
							<li>After making all picks from a pack, the player moves on to the next pack.</li>
							<li>This continues until the player has drafted their target deck size.</li>
							<li>Each player drafts independently from their own sequence of packs.</li>
						</ol>

						<h5 class="font-medium">Card Availability:</h5>
						<p>
							The number of times a card can appear in the draft is limited by its quantity in the cube.
							Once a card is picked by a player, it's no longer available for other players.
						</p>

						<h5 class="font-medium">Strategy Tips:</h5>
						<p>
							Since players draft independently, focus on building a cohesive deck strategy rather than
							responding to what other players are drafting. Choose cards that work well together to maximize
							your deck's effectiveness.
						</p>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="modal-action">
				<button class="btn" onclick={closeModal}>Close</button>
			</div>
		</div>
	</div>
{/if}
