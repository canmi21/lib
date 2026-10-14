//! The shape every API here answers in, from Rust and from TypeScript alike: `src/index.ts` is the
//! other half, and both read `codes.json` and are tested against `src/fixtures.json`. See
//! spec/response/envelope.md, "Every answer is one envelope".

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;
use std::sync::OnceLock;

/// Success carries what the route answers; failure carries a code for a program and a message for
/// a person.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum Envelope<T> {
	Success { data: T },
	Error { code: String, message: String },
}

fn catalog() -> &'static BTreeMap<String, String> {
	static CODES: OnceLock<BTreeMap<String, String>> = OnceLock::new();
	CODES.get_or_init(|| serde_json::from_str(include_str!("../codes.json")).unwrap_or_default())
}

/// The message a code carries when the moment has nothing more exact to say.
pub fn message_of(code: &str) -> Option<&'static str> {
	catalog().get(code).map(String::as_str)
}

/// Every code a Rust source names beside a status -- `StatusCode::X, "code"` -- so a program's
/// tests can hold what it answers with to the catalog, which TypeScript does with a type.
pub fn codes_named(source: &str) -> Vec<&str> {
	source
		.split("StatusCode::")
		.skip(1)
		.filter_map(|after| {
			let rest = after.trim_start_matches(|c: char| c.is_ascii_uppercase() || c == '_');
			let rest = rest.strip_prefix(',')?.trim_start().strip_prefix('"')?;
			rest.split('"').next()
		})
		.filter(|named| !named.is_empty() && named.bytes().all(|b| b.is_ascii_lowercase() || b == b'_'))
		.collect()
}

/// What a refusal said: the code for a program, and the message for a person.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Failure {
	pub code: String,
	pub message: String,
}

impl fmt::Display for Failure {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		write!(f, "refused with `{}`: {}", self.code, self.message)
	}
}

impl std::error::Error for Failure {}

impl<T> Envelope<T> {
	/// The envelope as a client takes it: what a success carries, or what the refusal said.
	pub fn into_result(self) -> Result<T, Failure> {
		match self {
			Self::Success { data } => Ok(data),
			Self::Error { code, message } => Err(Failure { code, message }),
		}
	}
}

/// Why an answer gave no data: it was a refusal, or it was not an envelope at all.
#[derive(Debug)]
pub enum DecodeError {
	Refused(Failure),
	NotAnEnvelope(serde_json::Error),
}

impl fmt::Display for DecodeError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::Refused(failure) => failure.fmt(f),
			Self::NotAnEnvelope(error) => write!(f, "an answer that is not an envelope: {error}"),
		}
	}
}

impl std::error::Error for DecodeError {
	fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
		match self {
			Self::Refused(failure) => Some(failure),
			Self::NotAnEnvelope(error) => Some(error),
		}
	}
}

/// An answer's body as a client reads it: the data a success carries, or why there is none. What
/// the data must look like is the caller's type; this knows `status` and nothing else.
pub fn decode<T: DeserializeOwned>(body: impl AsRef<[u8]>) -> Result<T, DecodeError> {
	let envelope: Envelope<T> =
		serde_json::from_slice(body.as_ref()).map_err(DecodeError::NotAnEnvelope)?;
	envelope.into_result().map_err(DecodeError::Refused)
}

/// Every code `sources` answer with beside a status, as `codes_named` finds them, held to the
/// catalog: the one line a program's tests give it, `assert_cataloged(&[include_str!("api.rs")])`.
/// Panics naming every code the catalog lacks.
#[track_caller]
pub fn assert_cataloged(sources: &[&str]) {
	let missing: Vec<&str> = sources
		.iter()
		.flat_map(|source| codes_named(source))
		.filter(|code| message_of(code).is_none())
		.collect();
	assert!(missing.is_empty(), "not in the response crate's codes.json: {}", missing.join(", "));
}

/// Every code a source passes first to `call` or to `call_with` -- `codes::failure("no_such_run")`
/// with `call` `codes::failure` -- as `codes_named` finds the catalog's.
pub fn named_after<'a>(source: &'a str, call: &str) -> Vec<&'a str> {
	source
		.split(call)
		.skip(1)
		.filter_map(|after| {
			let rest = after.strip_prefix("_with").unwrap_or(after).strip_prefix('(')?;
			rest.trim_start().strip_prefix('"')?.split('"').next()
		})
		.collect()
}

/// What a service declares of one of its own codes: the status it answers with, and its message.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Declared {
	pub status: u16,
	pub message: String,
}

/// A service's own codes, read from the `codes.json` in its contract: a code only one service
/// answers is declared there, never added to this crate's catalog. RFC v7g2p.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Codes {
	declared: BTreeMap<String, Declared>,
}

impl Codes {
	/// `{ "<code>": { "status": <u16>, "message": "<message>" } }`, as a service's `codes.json`
	/// holds them; read once, with `include_str!`, into a static the service keeps.
	pub fn from_json(text: &str) -> Result<Self, serde_json::Error> {
		Ok(Self { declared: serde_json::from_str(text)? })
	}

	pub fn get(&self, code: &str) -> Option<&Declared> {
		self.declared.get(code)
	}

	pub fn len(&self) -> usize {
		self.declared.len()
	}

	pub fn is_empty(&self) -> bool {
		self.declared.is_empty()
	}

	/// What is wrong with the codes declared, one line each: a code already the catalog's, one not
	/// lowercase with underscores, a status that is not a 4xx or 5xx, and a message that does not
	/// read as spec/response/envelope.md says one does.
	pub fn problems(&self) -> Vec<String> {
		let mut found = Vec::new();
		for (code, declared) in &self.declared {
			let well_named =
				!code.is_empty() && code.bytes().all(|b| b.is_ascii_lowercase() || b == b'_');
			if !well_named {
				found.push(format!("`{code}` is not lowercase with underscores"));
			}
			if message_of(code).is_some() {
				found.push(format!("`{code}` is the response crate's already"));
			}
			if !(400..=599).contains(&declared.status) {
				found.push(format!("`{code}` answers {}, which is no failure", declared.status));
			}
			let message = &declared.message;
			if !message.starts_with(|c: char| c.is_ascii_uppercase()) || message.ends_with('.') {
				found.push(format!("`{code}`'s message does not open with a capital and end bare"));
			}
		}
		found
	}

	/// The test every service with codes of its own runs once: some are declared, and nothing is
	/// wrong with them.
	#[track_caller]
	pub fn assert_well_formed(&self) {
		assert!(!self.is_empty(), "no code is declared; did codes.json parse whole?");
		let problems = self.problems();
		assert!(problems.is_empty(), "{}", problems.join("\n"));
	}

	/// Every code `sources` pass to `call`, as `named_after` finds them, held to these: the own-code
	/// half of `assert_cataloged`. Panics naming every code undeclared.
	#[track_caller]
	pub fn assert_declared(&self, sources: &[&str], call: &str) {
		let missing: Vec<&str> = sources
			.iter()
			.flat_map(|source| named_after(source, call))
			.filter(|code| self.get(code).is_none())
			.collect();
		assert!(missing.is_empty(), "not declared in codes.json: {}", missing.join(", "));
	}
}

impl Envelope<()> {
	/// A failure with the code's own message. A code missing from the catalog answers with the
	/// code itself, and the tests hold every code the programs use to the catalog.
	pub fn error(code: &str) -> Self {
		Self::error_with(code, message_of(code).unwrap_or(code))
	}

	pub fn error_with(code: &str, message: impl Into<String>) -> Self {
		Self::Error { code: code.into(), message: message.into() }
	}
}

#[cfg(feature = "axum")]
mod web {
	use super::Envelope;
	use axum::Json;
	use axum::http::StatusCode;
	use axum::response::{IntoResponse, Response};
	use serde::Serialize;

	pub fn success<T: Serialize>(status: StatusCode, data: T) -> Response {
		(status, Json(Envelope::Success { data })).into_response()
	}

	pub fn failure(status: StatusCode, code: &str) -> Response {
		(status, Json(Envelope::error(code))).into_response()
	}

	pub fn failure_with(status: StatusCode, code: &str, message: impl ToString) -> Response {
		(status, Json(Envelope::error_with(code, message.to_string()))).into_response()
	}

	impl super::Codes {
		/// A failure under one of the service's own codes, with its declared status and message.
		pub fn failure(&self, code: &str) -> Response {
			let message = self.get(code).map_or(code, |declared| declared.message.as_str());
			self.failure_with(code, message)
		}

		/// The same, with a message more exact than the declared one. A code not declared answers
		/// `500`, and `assert_declared` holds every code the sources name to `codes.json`.
		pub fn failure_with(&self, code: &str, message: impl ToString) -> Response {
			let status = self
				.get(code)
				.and_then(|declared| StatusCode::from_u16(declared.status).ok())
				.unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
			failure_with(status, code, message)
		}
	}
}

#[cfg(feature = "axum")]
pub use web::{failure, failure_with, success};

#[cfg(test)]
mod tests {
	use super::*;
	use serde_json::{Value, json};

	fn fixtures() -> Value {
		serde_json::from_str(include_str!("fixtures.json")).unwrap()
	}

	#[test]
	fn reads_and_writes_the_shape_typescript_does() {
		let fixtures = fixtures();
		let success: Envelope<Value> = serde_json::from_value(fixtures["success"].clone()).unwrap();
		assert_eq!(success, Envelope::Success { data: json!({ "count": 3 }) });
		assert_eq!(
			serde_json::to_value(Envelope::error("no_such_route")).unwrap(),
			fixtures["failure"]
		);
	}

	#[test]
	fn finds_the_codes_a_source_names() {
		let source = r#"failure(StatusCode::NOT_FOUND, "no_such_place"), Reply(StatusCode::BAD_GATEWAY,
			"app_unavailable", e), (StatusCode::OK, Json(x)), StatusCode::OK, assert_eq!(s,
			StatusCode::OK, "{path}")"#;
		assert_eq!(codes_named(source), ["no_such_place", "app_unavailable"]);
	}

	#[test]
	fn a_client_takes_the_data_or_the_refusal_and_names_a_body_that_is_neither() {
		let fixtures = fixtures();
		let body = |key: &str| serde_json::to_vec(&fixtures[key]).unwrap();
		assert_eq!(decode::<Value>(body("success")).unwrap(), json!({ "count": 3 }));
		let refused = decode::<Value>(body("failure")).unwrap_err();
		assert_eq!(refused.to_string(), "refused with `no_such_route`: No route answers this path");
		assert!(matches!(&refused, DecodeError::Refused(failure) if failure.code == "no_such_route"));
		let unread = decode::<Value>("<html>").unwrap_err();
		assert!(matches!(unread, DecodeError::NotAnEnvelope(_)));
		assert!(unread.to_string().starts_with("an answer that is not an envelope: "));
		// A success whose data is not what the caller's type says is not one either.
		assert!(matches!(decode::<u8>(body("success")), Err(DecodeError::NotAnEnvelope(_))));
		let envelope: Envelope<u8> = Envelope::Success { data: 7 };
		assert_eq!(envelope.into_result(), Ok(7));
	}

	#[test]
	fn a_source_answering_with_catalogued_codes_passes_and_one_that_does_not_is_named() {
		assert_cataloged(&[r#"failure(StatusCode::NOT_FOUND, "no_such_route")"#]);
		let caught = std::panic::catch_unwind(|| {
			assert_cataloged(&[r#"failure(StatusCode::NOT_FOUND, "no_such_thing_here")"#]);
		});
		let said = caught.unwrap_err();
		let said = said.downcast_ref::<String>().unwrap();
		assert_eq!(said, "not in the response crate's codes.json: no_such_thing_here");
	}

	fn own() -> Codes {
		Codes::from_json(
			r#"{ "no_such_run": { "status": 404, "message": "No run has this id" },
				"stale_lease": { "status": 409, "message": "The run is not leased to this caller" } }"#,
		)
		.unwrap()
	}

	#[test]
	fn a_services_own_codes_are_read_and_held_to_the_rules() {
		let codes = own();
		assert_eq!(codes.len(), 2);
		assert_eq!(codes.get("no_such_run").map(|declared| declared.status), Some(404));
		codes.assert_well_formed();
		let wrong = Codes::from_json(
			r#"{ "no_such_route": { "status": 404, "message": "Mine" },
				"Bad": { "status": 200, "message": "lower." } }"#,
		)
		.unwrap();
		assert_eq!(
			wrong.problems(),
			[
				"`Bad` is not lowercase with underscores",
				"`Bad` answers 200, which is no failure",
				"`Bad`'s message does not open with a capital and end bare",
				"`no_such_route` is the response crate's already",
			]
		);
		assert!(Codes::from_json("[]").is_err());
	}

	#[test]
	fn the_codes_a_source_passes_to_its_own_failure_are_found_and_held_to_its_declared_ones() {
		let source = r#"codes::failure("no_such_run"), codes::failure_with(
			"stale_lease", "at most"), codes::failure(code), response::failure(x, "other")"#;
		assert_eq!(named_after(source, "codes::failure"), ["no_such_run", "stale_lease"]);
		own().assert_declared(&[source], "codes::failure");
		let caught = std::panic::catch_unwind(|| {
			own().assert_declared(&[r#"codes::failure("no_such_step")"#], "codes::failure");
		});
		assert!(caught.is_err());
	}

	#[cfg(feature = "axum")]
	#[test]
	fn an_own_code_answers_its_declared_status_and_an_undeclared_one_500() {
		use axum::http::StatusCode;
		assert_eq!(own().failure("stale_lease").status(), StatusCode::CONFLICT);
		assert_eq!(own().failure_with("no_such_run", "Run 7").status(), StatusCode::NOT_FOUND);
		assert_eq!(own().failure("no_such_step").status(), StatusCode::INTERNAL_SERVER_ERROR);
	}

	#[test]
	fn every_code_has_a_message() {
		assert!(catalog().len() > 10);
		assert_eq!(message_of("no_such_scope"), Some("No API is published under this scope"));
		assert_eq!(message_of("not_a_code"), None);
	}
}
