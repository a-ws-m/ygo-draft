<script>
    import DraftForm from "$lib/forms/DraftForm.svelte";
    import CardList from "$lib/components/CardList.svelte";

    let cube = []; // Store the cube data from the form
</script>

<div class="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6 gap-6">
    <!-- Landing Page Text -->
    <div class="text-center max-w-2xl">
        <h1 class="text-3xl font-bold text-gray-800 mb-4">Welcome to YGO Draft</h1>
        <p class="text-gray-600 text-lg">
            Create your custom Yu-Gi-Oh! draft experience. Upload your cube, configure your draft
            settings, and start drafting with your friends. Get started by uploading your cube file below.
        </p>
    </div>

    <div class="flex flex-col lg:flex-row items-start justify-center w-full gap-6">
        <!-- Draft Form -->
        <div class="w-full max-w-lg bg-white p-6 rounded-lg shadow-md">
            <DraftForm on:cubeUploaded={(event) => (cube = event.detail.cube)} />
        </div>

        <!-- Cube Preview -->
        {#if cube.length > 0}
            <div class="w-full max-w-lg bg-white p-6 rounded-lg shadow-md">
                <CardList {cube} showYdkDownload={true} />
            </div>
        {/if}
    </div>
</div>
