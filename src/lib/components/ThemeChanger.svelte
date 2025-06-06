<script lang="ts">
	import { onMount } from 'svelte';
	import feather from 'feather-icons';

	let useDarkMode = $state(false);

	onMount(() => {
		if (typeof window !== 'undefined') {
			const storedUseDark = window.localStorage.getItem('storedUseDark');
			if (storedUseDark) {
				useDarkMode = storedUseDark === 'true';
			} else {
				useDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
			}
		}
	});

	function toggleTheme() {
		useDarkMode = !useDarkMode;
		window.localStorage.setItem('storedUseDark', String(useDarkMode));
		document.documentElement.classList.toggle('dark', useDarkMode);
	}

	$effect(() => {
		document.documentElement.setAttribute('data-theme', useDarkMode ? 'dracula' : 'light');
	});
</script>

<label class="flex cursor-pointer items-center space-x-1 p-2">
	{@html feather.icons['sun'].toSvg({ width: '1rem', height: '1rem' })}
	<input
		type="checkbox"
		class="toggle theme-controller"
		checked={useDarkMode}
		onchange={toggleTheme}
	/>
	{@html feather.icons['moon'].toSvg({ width: '1rem', height: '1rem' })}
</label>
