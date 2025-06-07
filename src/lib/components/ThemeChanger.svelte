<script lang="ts">
	import { onMount } from 'svelte';
	import feather from 'feather-icons';
	import { store as themeStore } from '$lib/stores/themeStore.svelte';
	import { setRgbBaseContentColor } from '$lib/utils/setContentColor.svelte';

	function toggleTheme() {
		themeStore.useDarkMode = !themeStore.useDarkMode;
		window.localStorage.setItem('storedUseDark', String(themeStore.useDarkMode));
		document.documentElement.classList.toggle('dark', themeStore.useDarkMode);
	}

	$effect(() => {
		document.documentElement.setAttribute(
			'data-theme',
			themeStore.useDarkMode ? 'dracula' : 'fantasy'
		);
		setRgbBaseContentColor();
	});

	$inspect(themeStore.baseContentColor);
</script>

<label class="flex cursor-pointer items-center space-x-1 p-2">
	{@html feather.icons['sun'].toSvg({ width: '1rem', height: '1rem' })}
	<input
		type="checkbox"
		class="toggle theme-controller"
		checked={themeStore.useDarkMode}
		onchange={toggleTheme}
	/>
	{@html feather.icons['moon'].toSvg({ width: '1rem', height: '1rem' })}
</label>
