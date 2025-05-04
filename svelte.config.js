import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.argv.includes('dev');

const config = {
	preprocess: vitePreprocess(),
	kit: { 
		adapter: adapter({
			// fallback to index.html for SPA behavior
			fallback: '404.html'
		}),
		paths: {
			base: dev ? '' : '/ygo-draft'
		}
	}
};

export default config;
