# Design: the system the console and space are built on

`@canmi/design` is the design system: a contract of names every style gives a value to, the styles,
a scale of measures, and in time the primitives and the components standing on them. What it draws is
[components.md](components.md), and what it frames a page with [layouts.md](layouts.md). Its layers and who is on it are web's
`spec/architecture/space.md`, "The design system: its layers, and a style across them".

## Kit is frozen

**`@canmi/kit` takes nothing new and is to be deprecated**: its name says nothing of what it holds,
and half of it is a foundation the other half's behavior has nothing to do with. Renaming it would
move every app that depends on it at once, so the new system is a package of its own instead, the
console and space move to it first, and each other consumer moves when there is time -- the site
and the CMS are RFC 4fnln and RFC ei71f. Kit is deprecated once
nothing reads it -- RFC vnxej. What `@canmi/design` needs of kit's it takes as its own, so it depends on none of
it: mono's palette was copied rather than imported.

## A component reads a role, and a style gives every role a value

**The contract is a fixed set of names, each a role; a style is a value for every name**, in light
and in dark. A component reads only the contract's names and never a palette's color, so one
family of components takes any style, and a style is changed without touching a component. The
palettes under it -- `palettes/mono.css` and the rest -- keep their own names, which only a style
reads. What an app reads beyond the contract is its own and declared in its own stylesheet; a
value two apps declare alike moves into the contract.

**The names are listed once, in code: `@canmi/design/contract`**, which a page drawing the
system reads, and whose test holds every style to it -- each name given a value on the root and on
either theme's mark, and nothing declared outside the contract's groups.

**Mono is the first style, `@canmi/design/styles/mono.css`**, the console's neutral look. It imports
its palette itself, so an app imports the style and nothing under it. The palette is exported as well,
`@canmi/design/styles/mono/palette.css`, for a page that reads the values as text -- space's
specimens, which write each value where the server renders it -- never for an app to import.

## A theme is a mark, and any element may carry one

**A theme is `data-theme="light"` or `data-theme="dark"`, and the nearest mark decides.** The
document's root carries one, set before the first frame by `@canmi/design/theme`'s script from the
reader's cookie or their system and moved by its `applyTheme`; any element below may carry the
other, and every token inside it takes that theme's value. A style declares its light on the root
and on `[data-theme='light']` and its dark over it on `[data-theme='dark']`, its palette too,
**every name declared again on each mark**. There is no `.dark` class: the kit's `.dark` stays with
the kit and the apps still on it -- [../kit/theme.md](../kit/theme.md).

**A component reads tokens and never asks which theme it is in**: no `dark:` variant, no branch on
the mark. Why one mark and not a second set of names, or the class beside it, is RFC mvplj.

## How a name is made

**`--{group}-{role}`**: the group is the property the value is laid on, the role what it does
there. Where a group ranks its roles, the ranks are one scale for every group: `subtle`, `muted`,
`default`, `strong`. Every word is the full word, and none is a component's: a name says what a
value is for, not who first wanted it.

| group         | names                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| `background`  | `base`, under everything; `surface`, a card on it                                          |
| `border`      | `subtle`, `default`, `strong`                                                              |
| `foreground`  | `subtle`, `muted`, `default`, `strong`: text, and the icons and marks drawn as text is     |
| `interaction` | `subtle`, `muted`, `default`, `strong`: ranks of one tint, laid over a ground; and `focus` |
| `status`      | `success`, `info`, `warning`, `critical`                                                   |
| `shadow`      | `surface`, the shadow a surface casts, `none` in mono                                      |
| `font`        | `sans`, `mono`, and `sans-cap-height`                                                      |

**`--font-sans-cap-height` is the sans's capital height**, `H` from its baseline to its top, what
CSS's `cap` unit should give and Chrome does not read right from this sans. It names its font,
since another face's capitals stand at another height.

**The focus ring is information's hue at full OKHSL saturation, a shade darker than
`--status-info` in either theme, APCA Lc 5**, counted before APCA's clip at 10: in mono
`oklch(0.626 0.203 258.6)` in the light and `oklch(0.543 0.207 258.6)` in the dark. **There is no
`--accent`**: information's blue is held by `--status-info` as every other status holds its hue.
**A selection is drawn as focus is**: `--interaction-focus` solid, with white on it, declared by the
style on `::selection`. Why, and what was tried first, is RFC qb7r9.

## The scale

**`@canmi/design/scale.stylex` holds the measures, and they are the same under every style**: a
style changes colors and never a size. Each is a StyleX const, so a reading declaration keeps the
value as written. A measure joins when a component on the system first reads it, not before.

- **Type sizes are named for what they set**: `caption`, `label`, `body`, and above them in time
  `title`, `headline`, `display`. Tailwind already holds the t-shirt sizes for type, with other
  values -- its `text-sm` is 14px -- and two meanings of one word in files that mix the two would be
  read wrong; a number named only an order a reader would take for a share of the body.
- **Radii keep the t-shirt sizes, five steps and the pill**: `xs` 2px, `sm` 4px, `md` 6px, `lg`
  8px, `xl` 12px, and `full`, a shape rather than a step. They are Tailwind's `rounded-*` steps at
  Tailwind's values: one word, one value, either way it is read. A radius is the visual layer's,
  written in StyleX and never as a `rounded-*` class.
- **Weights are `regular`, `medium`, `semibold`; a border's width is `hairline`; a transition's
  length is `duration.base`.**

**Of two corners nested, one holds a step and the other is worked out from it.** The one that holds
is the outer by default, since a container is what is tuned; the inner's radius is the outer's less
the gap between them, whatever value that comes to, a pixel included, so the two curves run
parallel. Where that is zero or less the two stand too far apart to nest, and the inner holds a step
of its own.

A style may derive its values from parameters no component reads: mono's ranks and borders are one
tint of the foreground, `--interaction-tint`, and `--interaction-strength` is the default rank's
alpha, for a mark that lays that rank opaque.

**Every gray but the text steps off its base 1.5 times as far in the dark as in the light, measured
in CIELAB L\*.** The light's grounds and the dark's ranks and borders are set and the other side is
worked out, each on its own base, and each value is written out since CSS cannot take L\*; mono's
test reads its stylesheet and holds every pair to the ratio. sRGB levels are an encoding and oklch
L a cube root all the way to black, and neither reads as the eye does near black -- RFC trwdn.

**A surface is a step lighter than the base in both themes.** The light's surface is white and its
base `oklch(0.979 0 0)`; the dark's base is black and its surface `oklch(0.159 0 0)`, its step the
light's times 1.5 in L\*. Regions take the surface -- a card, the
shell's top bar and its sidebar -- and what is set into a region, a field or a framed button, stands
on the base again. **A surface casts no shadow in either theme.** Why, and what was tried first, is
RFC c656n.

**`--background-neutral` is one gray in both themes, CIELAB L\* 50**, halfway between them and
outside the 1.5 rule; mono's test holds it to both. It is a specimen box's, where the two themes are
drawn side by side, and never a page's or a component's -- RFC oonnv.

**Two grounds, and every other ground an interaction rank laid over one of them.** A ground that is
neither the page nor a card -- a hover, a selection, a control's fill, a skeleton -- is a rank: the
text's own color laid thin, translucent, so it adapts to the ground under it. A component takes a
rank, never an alpha of its own. The ranks in mono, as the alpha of the text's color laid on:

| rank      | light        | dark         |
| --------- | ------------ | ------------ |
| `subtle`  | 2.69 percent | 4.9 percent  |
| `muted`   | 3.14 percent | 5.6 percent  |
| `default` | 4.17 percent | 7 percent    |
| `strong`  | 7.43 percent | 10.5 percent |

**The dark's are set, and the light's each stand 1/1.5 as far off the base in L\*.** **Where
something chosen stands among what can be pointed at, the chosen takes `muted` and the hover
`subtle`; where only a hover shows, it takes `default`.** Why, and what was tried first, is RFC
ic4cd.

**A border is the text's own color laid thin too, by the same rule**: in the dark `subtle` 7
percent, `default` 9 and `strong` 24, and in the light 4.17, 5.95 and 19.65 -- RFC h27v0 for what a
border is, RFC trwdn for the ratio.

**Text is set by its APCA contrast on a surface, one target per tier in both themes**: `subtle` Lc
60, `muted` 75, `default` 90, `strong` the most there is, black or white, and each theme's lightness
worked back from the target -- RFC yvws0.

**A hue is drawn as graphics, and is set in OKHSL: saturation 100 in both themes, and its lightness
9 deeper in the dark than in the light.** The dark's lightness is chosen per hue: in mono
information is OKHSL lightness 50.8 at 258.6 in the dark, success 58.9 at 147.2, critical 56.5 at
23.1, each 9 lighter in the light. **Warning is the one exception: one value in both themes**, 79.1
at 76. Why, and what was tried first, is RFC b0i0r.

## Who is on it

The console's polished parts and space, first -- web's `spec/architecture/space.md`, "The design
system: its layers, and a style across them". The rest of the console reads its old names, each
declared in its own stylesheet as the contract's value, until each part is polished.
