# The envelope

## Every answer is one envelope

An API built on this package, in TypeScript or in Rust, answers in one shape:
`{ "status": "success", "data": ... }` or `{ "status": "error", "code": ..., "message": ... }`. The
npm package and the `response` crate are its two halves, and both read the one catalog of codes,
`codes.json`, and are tested against the same fixtures, `src/fixtures.json`, so the two languages
cannot drift apart. A success carries what the route answers and nothing else; there is nothing to
say about a call that worked. A body that is the thing itself -- an image, a file, a redirect -- is
not wrapped.

**A failure carries a code and a message, both always.** The code is for a program: lowercase with
underscores, and not the HTTP status, which the response already has. The message is for a person:
one line of English, objective, short without being curt, opening with a capital and ending without
a stop. Each code has a default message in the catalog, so a refusal names its code, and a moment
with something more exact to say -- a port and who holds it -- says it instead.

**A code is one of four families.** `no_such_*` for something asked for by a name or an id that
does not exist, `invalid_*` for a request that is malformed, `*_unavailable` for something that
could not be reached or read at this moment, and `forbidden_*` for a request that is well formed and
refused to this caller -- a 403, where `invalid_*` is a 400. `rate_limited` and `job_running` are the codes
outside them.

## A client reads an answer one way

**The envelope is decoded in one place, in each language**: `decode` in the crate, into the data a
success carries or a `DecodeError` that is either the refusal, its code and message, or a body that
was no envelope; `unwrap` in the package, which throws with the same. What the data must look like
is the caller's type; the envelope's reader knows `status` and nothing else. A program does not
write its own.

## A program's tests hold what it answers to the catalog in one line

`assert_cataloged(&[include_str!("api.rs")])` finds every code a source answers beside a status and
fails naming each the catalog lacks; TypeScript has the `Code` type instead.

## A service's own codes are read the same way the catalog is

A code only one service answers is declared in that service's `codes.json`,
`{ "<code>": { "status": <4xx or 5xx>, "message": ... } }`, never added here -- RFC v7g2p. `Codes`
reads it, answers with its status and message, and gives the two tests every such service runs:
`assert_well_formed`, that no code is the catalog's already and each reads as this file says a code
and a message read, and `assert_declared`, that every code the sources name is declared.

## A Hono API answers its own refusals in the envelope

`@canmi/response/hono`'s `envelopeErrors(app)` answers a path no route takes, `no_such_route`
unless the app names another, and an error thrown below a route, `service_unavailable`, each
`no-store` unless the app says more. Hono's own answer is `text/plain`, which a caller parsing JSON
reads as a syntax error rather than a message.

## `codes.json` lives in the npm package and is linked into the crate

`cargo package` takes only what is under the crate's own directory, and follows a symbolic link to
copy what it names, so `crates/response/codes.json` and `src/fixtures.json` are links to the npm
package's. The catalog is edited there, once.
