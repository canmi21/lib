# Light and dark

## One cookie, read the same way everywhere

**`theme` holds the color painted and the reader's choice, and `@canmi/kit/theme` is the only code
that reads or writes it**: `themeScript`, the inline script that settles it before the first frame,
`themeOf`, `settleTheme` and `fillTheme`, the server's reading of it, and `themeCookie`,
`choiceCookie` and `applyTheme`, the control's writing of it -- the cookie and the class.

**Its value is a query string whose first key is the color**, `light` or `dark`, then `mode`, then
`sun` where the server knows it: `theme=dark&mode=sun&sun=565-31`. The server reads the color alone
and paints from it, so it still knows two values and only two. The color stands first and bare so
that a reader written before the mode existed, matching `\btheme=(light|dark)\b`, reads it
unchanged -- `@canmi/design/theme` among them. A field nobody reads yet is not written; one is added
as its reader is.

**`mode` is `fixed`, `system` or `sun`.** `fixed` paints the color as stored. `system` paints what
`prefers-color-scheme` says, and `sun` paints light between sunrise and sunset and dark outside
them; for both, the stored color is only the last one painted, which the server renders and the
script corrects before the first frame wherever it has gone stale, writing the cookie back so the
next request is right. A page left open follows both: the script listens to the media query and sets
a timer for the next sunrise or sunset, and reads the cookie again when either fires, so a mode
chosen after the page loaded is followed with nothing to subscribe or unsubscribe.

**A cookie without `mode` is `fixed`, and no cookie at all is `system`.** A cookie written before
the mode existed may be a choice the reader made, so it is kept as one; a reader with no cookie has
made none, and follows their system until they do. Either is written back with its mode at once, so
every reader holds an explicit mode after one visit -- what a later sync between sites needs, where
a missing value and a choice of `fixed` must not mean the same thing.

**`sun` is today's sunrise and sunset in UTC minutes, `rise-set`, or `day` or `night` where the sun
does not cross the horizon.** The server works them out from the coordinates its platform gives the
request, `sunOf`, by NOAA's solar equations -- no table, no database, a minute of error against city
coordinates that cost four per degree of longitude -- and writes them whenever they move, which is
about once a day. Only the times are stored, never the coordinates. Being UTC, the script compares
them against the UTC clock and needs no time zone; a day may wrap past midnight UTC, so a moment is
day when its distance past sunrise is less than sunset's, both taken modulo a day. **Where the
server knows no coordinates, `sun` is absent, and the `sun` mode paints as `system` does.**

**The control is one button, cycling four choices**: `system`, the color opposite the system's
fixed, the system's own color fixed, then `sun`, and back. Each shows its own glyph -- a monitor, a
moon or a sun for the color fixed, a sun and moon -- so the glyph depends on the choice alone and
the server always draws it right. Two of the four may paint the same color, so **the first press
in a session skips every choice that would paint what is already painted**, and a reader who meant
to change the color sees it change; the presses after it walk the ring in order, so every choice
can be reached, the one that only moves the glyph coming last. `nextChoice` is that rule.
**Whether this tab has pressed yet is a boolean in the project's per-tab record**, handed to
`pressTheme` with its key and its storage like every fact a kit module keeps, never a key of the
theme's own; see [state.md](state.md).

`palette` is a second cookie that only the script reads: `nord` or `contrast`, added as a class.
Nothing writes it and no stylesheet answers either class yet, so it paints nothing -- a leftover the
script still carries, RFC n3zj7; see web's `spec/styling/palettes.md`. The palettes this package ships, `concrete.css` and `mono.css`, are chosen by which
file an app imports.

**An app wires the script into its `app.html`, and the server's reading into its hooks where its
render is its own**, so its first byte already carries the class. **An app whose render is kept and
shared between readers runs the script alone**: a render that differed by cookie could not be
shared, and the script sets the class before anything is painted, so no reader sees the other theme
first. Such an app writes no `sun`, so its readers' `sun` mode paints as `system`. A two-state control
written before the mode existed still works: `themeCookie` writes the color alone, which is `fixed`.
`observeTheme` is how a component follows a change made elsewhere on the page.

## A change nobody pressed for turns, every other cuts

**The first frame and a press cut from one color to the other**, however far apart they are: the
first is a page arriving, the second a change the reader made and is watching for. **A change the
reader did not make turns as a view transition** -- the system's preference moving under `system`,
the sun rising or setting under `sun`, or either found stale when the tab comes back -- because a
page that changes color while being read, with nothing pressed, reads as something gone wrong.
The script marks the root `theme-turn` for that one transition, and `turn.css`, imported by the
app, answers it: the new color wiped over the old in 800ms, dark down from the top and light up
from the bottom. A reader who asks for less motion gets the cut, and a browser with no view
transitions does too.

## Nord is dark only, and chosen by import

**`palettes/nord.css` is the panel's and the console's one theme**: `color-scheme: dark` on `:root`,
with no `.dark` selector and no light twin yet, chosen by importing it as `mono.css` and
`concrete.css` are, never by the `palette` class. It declares the sixteen Nord colors under their
own names and the semantic tokens the two read -- `--color-ground` through `--color-selection`, the
status tones `good`, `warn`, `danger`, `busy` and `note` among them -- so a surface reads a meaning,
never a number. infra's panel kept these in its own stylesheet until the console needed the same
ones; they live here so the two cannot drift.

**`--color-series-1` to `-8` are a palette of their own, for charts.** Nord's colors cannot be one:
its four frost blues sit too close for the dataviz validator's normal-vision floor, and half of
them are the status tones, which a chart never reuses as a series. The eight are validated on
`--color-surface` -- every check passing, the worst adjacent pair 29.5 apart for normal vision and
14.8 for any color-vision deficiency -- and kept at least 9.9 OKLab ΔE (×100) from every status
token, in a fixed order a chart takes from the first.
