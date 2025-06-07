
import { store as themeStore } from '$lib/stores/themeStore.svelte';
import chroma from 'chroma-js';

function convertToRgb(color: string): string {
    // Convert an oklch color to RGB
    // The color string will be in the format 'oklch(50% 0.2 240)'
    const trimmedColor = color.replace('oklch(', '').replace(')', '').replace('%', '').trim();
    const [l, c, h] = trimmedColor.split(' ').map(Number);
    return `rgb(${chroma.oklch(l / 100, c, h).rgb().join(', ')})`;
}

export function setRgbBaseContentColor() {
    const baseContentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-base-content')
        .trim();
    themeStore.baseContentColor = convertToRgb(baseContentColor);
}

