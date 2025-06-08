
import { store as themeStore } from '$lib/stores/themeStore.svelte';
import chroma from 'chroma-js';

function getCSSVariable(variableName: string): string {
    // Get the value of a CSS variable
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}

function convertToRgb(color: string): string {
    // Convert an oklch color to RGB
    // The color string will be in the format 'oklch(50% 0.2 240)'
    const trimmedColor = color.replace('oklch(', '').replace(')', '').replace('%', '').trim();
    const [l, c, h] = trimmedColor.split(' ').map(Number);
    return `rgb(${chroma.oklch(l / 100, c, h).rgb().join(', ')})`;
}

export function setContentColors() {
    const baseContentColor = getCSSVariable('--color-base-content');
    const neutralContentColor = getCSSVariable('--color-neutral-content');
    themeStore.baseContentColor = convertToRgb(baseContentColor);
    themeStore.neutralContentColor = convertToRgb(neutralContentColor);
}

