<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { goto } from "$app/navigation"; // For navigation
    import { supabase } from "$lib/supabaseClient"; // Supabase client

    const dispatch = createEventDispatcher();

    let draftMethod = "winston";
    let poolSize = 120;
    let numberOfPlayers = 2;
    let numberOfPiles = 3;
    let packsPerRound = 1;
    let packSize = 5;
    let cubeFile = null;
    let isCubeValid = false;
    let isProcessing = false;
    let errorMessage = "";
    let optionErrorMessage = "";
    let totalCards = 0;
    let cube = []; // Store the cube data

    function handleFileUpload(event: Event) {
        const target = event.target as HTMLInputElement;
        cubeFile = target.files?.[0] || null;
        if (cubeFile) {
            isProcessing = true;
            errorMessage = "";
            import("$lib/utils/cubeProcessor").then(({ processCubeFile }) => {
                processCubeFile(cubeFile)
                    .then((uploadedCube) => {
                        console.log("Cube file processed successfully.");
                        isCubeValid = true;
                        cube = uploadedCube; // Store the cube data
                        totalCards = cube.reduce((sum, card) => sum + card.quantity, 0);
                        dispatch("cubeUploaded", { cube }); // Emit cube data to parent
                        validateOptions();
                    })
                    .catch((error) => {
                        console.error("Error processing cube file:", error);
                        isCubeValid = false;
                        errorMessage = error.message;
                    })
                    .finally(() => {
                        isProcessing = false;
                    });
            });
        } else {
            isCubeValid = false;
            errorMessage = "No file uploaded. Please select a valid cube file.";
        }
    }

    function validateOptions() {
        optionErrorMessage = "";

        if (poolSize > totalCards) {
            optionErrorMessage = "Pool size cannot exceed the total number of cards in the cube.";
        } else if (draftMethod === "rochester") {
            if (packSize < numberOfPlayers) {
                optionErrorMessage = "Pack size must be at least equal to the number of players.";
            } else if (poolSize < packSize * packsPerRound) {
                optionErrorMessage = "Pool size must be at least equal to pack size times the number of packs.";
            }
        } else if (draftMethod === "winston") {
            if (poolSize < numberOfPiles) {
                optionErrorMessage = "Pool size must be at least equal to the number of piles.";
            }
        }
    }

    async function startDraft() {
        if (!isCubeValid || optionErrorMessage) return;

        isProcessing = true;

        try {
            // Create a new draft session in the `drafts` table
            const { data: draft, error: draftError } = await supabase
                .from("drafts")
                .insert({
                    draft_method: draftMethod,
                    pool_size: poolSize,
                    number_of_players: numberOfPlayers,
                    connected_users: 0,
                    status: "waiting",
                })
                .select()
                .single();

            if (draftError) throw draftError;

            // Insert cube data into the `cubes` table
            const cubeData = cube.map((card) => ({
                draft_id: draft.id,
                card_name: card.name,
                quantity: card.quantity,
                type: card.type,
                api_data: card.apiData,
            }));

            const { error: cubeError } = await supabase.from("cubes").insert(cubeData);
            if (cubeError) throw cubeError;

            // Redirect to the draft route
            goto(`/draft/${draft.id}`);
        } catch (error) {
            console.error("Error starting draft:", error);
            errorMessage = "Failed to start draft. Please try again.";
        } finally {
            isProcessing = false;
        }
    }
</script>

<div class="space-y-6">
    <!-- Cube File Upload -->
    <div>
        <label for="cube-file" class="block text-sm font-medium text-gray-700 mb-1">
            Upload Cube File (.csv)
        </label>
        <div class="relative">
            <input
                type="file"
                id="cube-file"
                accept=".csv"
                on:change={handleFileUpload}
                class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
                disabled={isProcessing}
            />
            {#if isProcessing}
                <!-- Spinner -->
                <div class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
                    <svg
                        class="animate-spin h-6 w-6 text-indigo-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                        ></circle>
                        <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                    </svg>
                </div>
            {/if}
        </div>
        {#if errorMessage}
            <!-- Error Message -->
            <p class="mt-2 text-sm text-red-600">{errorMessage}</p>
        {/if}
    </div>

    <!-- Draft Method Selection -->
    <div>
        <label for="draft-method" class="block text-sm font-medium text-gray-700 mb-1">
            Draft Method
        </label>
        <select
            id="draft-method"
            bind:value={draftMethod}
            on:change={validateOptions}
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
            <option value="winston">Winston Draft</option>
            <option value="rochester">Rochester Draft</option>
        </select>
    </div>

    <!-- Pool Size -->
    <div>
        <label for="pool-size" class="block text-sm font-medium text-gray-700 mb-1">
            Pool Size
        </label>
        <input
            type="number"
            id="pool-size"
            bind:value={poolSize}
            min="1"
            on:input={validateOptions}
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
    </div>

    <!-- Number of Players -->
    <div>
        <label for="number-of-players" class="block text-sm font-medium text-gray-700 mb-1">
            Number of Players
        </label>
        <input
            type="number"
            id="number-of-players"
            bind:value={numberOfPlayers}
            min="2"
            on:input={validateOptions}
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
    </div>

    <!-- Rochester Draft Options -->
    {#if draftMethod === "rochester"}
        <div>
            <label for="pack-size" class="block text-sm font-medium text-gray-700 mb-1">
                Pack Size
            </label>
            <input
                type="number"
                id="pack-size"
                bind:value={packSize}
                min="1"
                on:input={validateOptions}
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>
        <div>
            <label for="packs-per-round" class="block text-sm font-medium text-gray-700 mb-1">
                Packs Per Round
            </label>
            <input
                type="number"
                id="packs-per-round"
                bind:value={packsPerRound}
                min="1"
                on:input={validateOptions}
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>
    {/if}

    <!-- Winston Draft Options -->
    {#if draftMethod === "winston"}
        <div>
            <label for="number-of-piles" class="block text-sm font-medium text-gray-700 mb-1">
                Number of Piles
            </label>
            <input
                type="number"
                id="number-of-piles"
                bind:value={numberOfPiles}
                min="1"
                on:input={validateOptions}
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>
    {/if}

    <!-- Option Validation Error -->
    {#if optionErrorMessage}
        <p class="mt-2 text-sm text-red-600">{optionErrorMessage}</p>
    {/if}

    <!-- Submit Button -->
    <div>
        <button
            type="button"
            class="w-full bg-indigo-600 text-white py-2 px-4 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
            on:click={startDraft}
            disabled={!isCubeValid || isProcessing || optionErrorMessage}
        >
            Start Draft
        </button>
    </div>
</div>