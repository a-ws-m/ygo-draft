<script lang="ts">
	import { onMount } from 'svelte';
	import feather from 'feather-icons';
	import { store as themeStore } from '$lib/stores/themeStore.svelte';
	import chroma from 'chroma-js';

	function convertToRgb(color: string): string {
		// Convert an oklch color to RGB
		// The color string will be in the format 'oklch(50% 0.2 240)'
		const trimmedColor = color.replace('oklch(', '').replace(')', '').replace('%', '').trim();
		const [l, c, h] = trimmedColor.split(' ').map(Number);
		return `rgb(${chroma.oklch(l / 100, c, h).rgb().join(', ')})`;
	}

	function setRgbBaseContentColor() {
		const baseContentColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-base-content')
			.trim();
		themeStore.baseContentColor = convertToRgb(baseContentColor);
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			const storedUseDark = window.localStorage.getItem('storedUseDark');
			if (storedUseDark) {
				themeStore.useDarkMode = storedUseDark === 'true';
			} else {
				themeStore.useDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
			}
			setRgbBaseContentColor();
		}
	});

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
