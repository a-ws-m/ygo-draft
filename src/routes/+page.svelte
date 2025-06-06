<script lang="ts">
	import DraftForm from '$lib/forms/DraftForm.svelte';
	import CardList from '$lib/components/CardList.svelte';
	import { store as authStore } from '$lib/stores/authStore.svelte';

	let cube = $state<any[]>([]); // Store the cube data from the form
	let isAuthenticated = $derived(!!authStore.session);

	// Callback function to handle cube uploads
	function handleCubeUploaded(uploadedCube: any[]) {
		cube = uploadedCube;
	}
</script>

<svelte:head>
	<title>YGO Draft Creator</title>
	<meta name="description" content="Create your custom Yu-Gi-Oh! draft experience." />
</svelte:head>

<div class="hero bg-base-200 min-h-screen">
	<div class="hero-content flex-col gap-6 py-8">
		<!-- Landing Page Text -->
		<div class="text-center">
			<h1 class="text-primary text-3xl font-bold">Welcome to YGO Draft</h1>
			<p class="py-4 text-lg">
				Create your custom Yu-Gi-Oh! draft experience. Upload your cube, configure your draft
				settings, and start drafting with your friends. Get started by uploading your cube file
				below.
			</p>
		</div>

		<div class="flex w-full flex-col items-start justify-center gap-6 lg:flex-row">
			<!-- Draft Form - using callback prop instead of event -->
			<div class="card bg-base-100 w-full max-w-lg shadow-xl">
				<div class="card-body">
					<DraftForm onCubeUploaded={handleCubeUploaded} />
				</div>
			</div>

			<!-- Cube Preview - only show if authenticated and cube has cards -->
			{#if isAuthenticated && cube.length > 0}
				<div class="card bg-base-100 w-full max-w-lg shadow-xl">
					<div class="card-body">
						<CardList {cube} showYdkDownload={true} showChart={true} />
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
