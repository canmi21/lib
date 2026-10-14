# Response

One JSON response envelope for [Axum](https://docs.rs/axum), shared with
[`@canmi/response`](https://www.npmjs.com/package/@canmi/response) on the TypeScript side.

## Quick start

```toml
[dependencies]
response = { version = "2", features = ["axum"] }
```

```rust
use axum::{Router, http::StatusCode, response::Response, routing::get};
use response::{failure, success};

async fn tags() -> Response {
    success(StatusCode::OK, ["rust", "svelte"])
}

async fn missing() -> Response {
    failure(StatusCode::NOT_FOUND, "no_such_route")
}

let app: Router = Router::new().route("/tags", get(tags)).fallback(missing);
```

Every answer is one of two shapes:

```json
{ "status": "success", "data": ["rust", "svelte"] }
{ "status": "error", "code": "no_such_route", "message": "No route answers this path" }
```

## Features

- **One shape, two languages** — `Envelope<T>` here and `ApiResponse<T>` in `@canmi/response`
  serialize the same, and both are tested against one set of fixtures.
- **A catalog of codes** — every code lives in `codes.json` with its message; `message_of` looks
  one up, and `Envelope::error` fills the message in for you.
- **Axum helpers** — `success`, `failure` and `failure_with` turn a status and data, or a code,
  into a response.
- **One way back** — `decode` reads an answer's body into its data, or a `DecodeError` naming the
  refusal's code or saying the body was no envelope; `Envelope::into_result` does the same for an
  envelope already read.
- **A one-line catalog test** — `assert_cataloged(&[include_str!("api.rs")])` fails naming every
  code a source answers with that the catalog lacks.
- **A service's own codes** — `Codes::from_json` reads a `codes.json` of `{ status, message }` per
  code, for codes no other API answers; `Codes::failure` answers one with its own status, and
  `assert_well_formed` and `assert_declared` are the tests that hold it.

## Cargo features

| Feature | Default | Description                                                                     |
| ------- | ------- | ------------------------------------------------------------------------------- |
| `axum`  | No      | `success`, `failure` and `failure_with` for Axum handlers, and `Codes::failure` |

Without `axum` the crate is the envelope and the catalog alone, on `serde` and `serde_json`.

## License

Released under the MIT License © 2024 [Canmi](https://canmi.net)
