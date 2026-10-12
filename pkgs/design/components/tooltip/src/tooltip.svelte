<script lang="ts">
	/**
	 * A short name for what it holds, or a few lines about it, shown above it while the pointer rests
	 * on it or the keyboard is in it: a small card on the surface, its point down at the middle of
	 * what it names. Never the browser's own title. See lib's spec/design/components.md, "A tooltip".
	 */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { borderWidth, fontSize, fontWeight, radius } from '../../../scale/src/scale.stylex.js';
	import Icon from '../../icon/src/icon.svelte';
	import type { IconComponent } from '../../icon/src/optics.js';
	import Point from '../../point/src/point.svelte';

	let {
		label,
		icon,
		content,
		children,
	}: {
		/** The name, when the card holds a name alone. */
		label?: string;
		/** A mark before the name, in the muted text, for what a word would say longer. */
		icon?: IconComponent;
		/** The card's own lines, in place of a name, laid out by whoever writes them. */
		content?: Snippet;
		children: Snippet;
	} = $props();

	/** How far the point stands out, and the gap between its tip and what it names. */
	const POINT = 5;
	const GAP = 4;

	/**
	 * Open while the pointer is on what it holds, or the keyboard is in it, each on its own. Focus a
	 * click leaves behind is not the keyboard's, so it holds nothing open once the pointer goes.
	 */
	let hovered = $state(false);
	let focused = $state(false);
	const shown = $derived(hovered || focused);
	let anchor: HTMLElement | undefined = $state();
	let card: HTMLElement | undefined = $state();
	const id = $props.id();

	const styles = stylex.create({
		anchor: { position: 'relative', display: 'inline-flex' },
		card: {
			position: 'absolute',
			display: 'flex',
			alignItems: 'center',
			gap: '0.25rem',
			left: '50%',
			bottom: `calc(100% + ${POINT + GAP}px)`,
			zIndex: 20,
			transform: 'translateX(-50%)',
			paddingInline: '0.5rem',
			paddingBlock: '0.25rem',
			borderWidth: borderWidth.hairline,
			borderStyle: 'solid',
			borderColor: 'var(--border-default)',
			borderRadius: radius.md,
			backgroundColor: 'var(--background-surface)',
			color: 'var(--foreground-strong)',
			fontSize: fontSize.caption,
			fontWeight: fontWeight.medium,
			whiteSpace: 'nowrap',
			pointerEvents: 'none',
		},
		icon: { display: 'flex', color: 'var(--foreground-muted)' },
	});
</script>

<!-- A pointer that left the window while a tip was open sends no leave; wherever it comes back,
     the element it lands on says whether it is still on what this tip holds. -->
<svelte:document
	onpointerover={(event) => {
		if (hovered && !anchor?.contains(event.target as Node)) hovered = false;
	}}
/>

<span
	role="group"
	aria-describedby={shown ? id : undefined}
	bind:this={anchor}
	class={stylex.attrs(styles.anchor).class}
	onpointerenter={() => (hovered = true)}
	onpointerleave={() => (hovered = false)}
	onfocusin={(event) => (focused = (event.target as Element).matches(':focus-visible'))}
	onfocusout={() => (focused = false)}
>
	{@render children()}
	{#if shown}
		<span {id} role="tooltip" bind:this={card} class={stylex.attrs(styles.card).class}>
			{#if content}
				{@render content()}
			{:else}
				{#if icon}
					<span class={stylex.attrs(styles.icon).class}><Icon {icon} size={12} /></span>
				{/if}
				{label}
			{/if}
			<Point {card} edge="bottom" along="middle" size={POINT} />
		</span>
	{/if}
</span>
