<script>
	import DraftForm from '$lib/forms/DraftForm.svelte';
	import CardList from '$lib/components/CardList.svelte';
	import { store as authStore } from '$lib/stores/authStore.svelte';

	let cube = $state([]); // Store the cube data from the form
	let isAuthenticated = $derived(!!authStore.session);
</script>

<svelte:head>
	<title>YGO Draft Creator</title>
	<meta name="description" content="Create your custom Yu-Gi-Oh! draft experience." />
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-100 p-6">
	<!-- Landing Page Text -->
	<div class="max-w-2xl text-center">
		<h1 class="mb-4 text-3xl font-bold text-gray-800">Welcome to YGO Draft</h1>
		<p class="text-lg text-gray-600">
			Create your custom Yu-Gi-Oh! draft experience. Upload your cube, configure your draft
			settings, and start drafting with your friends. Get started by uploading your cube file below.
		</p>
	</div>

	<div class="flex w-full flex-col items-start justify-center gap-6 lg:flex-row">
		<!-- Draft Form -->
		<div class="w-full max-w-lg rounded-lg bg-white p-6 shadow-md">
			<DraftForm on:cubeUploaded={(event) => (cube = event.detail.cube)} />
		</div>

		<!-- Cube Preview - only show if authenticated and cube has cards -->
		{#if isAuthenticated && cube.length > 0}
			<div class="w-full max-w-lg rounded-lg bg-white p-6 shadow-md">
				<CardList {cube} showYdkDownload={true} showChart={true} />
			</div>
		{/if}
	</div>
</div>
