<script lang="ts">
	/**
	 * A card's point toward what it is about: a triangle of the card's rule, and over it a triangle
	 * of its ground standing in by the rule's width, both from the card's edge, so the slanted sides
	 * run on from the card's rule with no step where they meet and the opening's rule is covered.
	 * The rule's width is read off the card as the browser drew it, snapped to device pixels, and
	 * half a device pixel more, since a slant smoothed over its neighbors reads thinner than a
	 * straight rule as wide. See lib's spec/design/components.md, "A card's point runs on from its
	 * rule".
	 */
	import * as stylex from '@stylexjs/stylex';

	let {
		card,
		edge,
		along,
		outside = false,
		size = 7,
		ground = 'var(--background-surface)',
	}: {
		/** The card whose rule it runs on from. */
		card: HTMLElement | undefined;
		/** Which of the card's edges it stands out from. */
		edge: 'top' | 'bottom' | 'left' | 'right';
		/** How far along that edge its middle is, in pixels. */
		along: number;
		/** Placed in a box the card's outer edge bounds, rather than inside the card itself. */
		outside?: boolean;
		/** How far it stands out, half as far as it is wide. */
		size?: number;
		/** What fills it: the card's ground, or a washed row's beside it, which it runs on from. */
		ground?: string;
	} = $props();

	let rule = $state(1);
	$effect(() => {
		if (card) rule = Number.parseFloat(getComputedStyle(card).borderTopWidth) || 1;
	});
	/** The ground's stand-in, square to the slant, carried along the axes. */
	const slant = $derived(Math.SQRT2 * (rule + 0.5 / devicePixelRatio));
	/** Where its base stands: the card's inner edge, whichever box it is placed in. */
	const base = $derived(outside ? rule : 0);

	const styles = stylex.create({
		edge: {
			backgroundColor: 'var(--background-surface)',
			backgroundImage: 'linear-gradient(var(--border-default), var(--border-default))',
		},
	});

	/** A triangle `long` across its base and `out` from it, its base `reach` into the card. */
	function placed(long: number, out: number, reach: number): string {
		const from = `calc(100% - ${reach + base}px)`;
		const across = edge === 'top' || edge === 'bottom';
		const size = across
			? `width:${long}px;height:${out + reach}px;left:${along}px;transform:translateX(-50%);`
			: `width:${out + reach}px;height:${long}px;top:${along}px;transform:translateY(-50%);`;
		const r = `${reach}px`;
		const shapes = {
			bottom: `top:${from};clip-path:polygon(0 0,100% 0,100% ${r},50% 100%,0 ${r})`,
			top: `bottom:${from};clip-path:polygon(0 100%,100% 100%,100% calc(100% - ${r}),50% 0,0 calc(100% - ${r}))`,
			right: `left:${from};clip-path:polygon(0 0,0 100%,${r} 100%,100% 50%,${r} 0)`,
			left: `right:${from};clip-path:polygon(100% 0,100% 100%,calc(100% - ${r}) 100%,0 50%,calc(100% - ${r}) 0)`,
		};
		return size + shapes[edge];
	}
</script>

<span
	aria-hidden="true"
	class={stylex.attrs(styles.edge).class}
	style="position:absolute;{placed(size * 2, size, 0)}"
></span>
<span
	aria-hidden="true"
	style="position:absolute;{placed(size * 2 - 2 * slant, size - slant, 1)};background-color:{ground}"
></span>
