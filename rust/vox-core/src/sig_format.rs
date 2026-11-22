//! Canonical JSON serialization for signed Vox payloads (ADR-021 §2.6 / PM-85 / ADR-039 Phase 1).
//!
//! Mirrors `client/js/sig-format.js` exactly:
//! - Strips top-level `"sig"` and `"pubKey"`.
//! - **v2** (`sigv: 2`): recursively sorts object keys at every depth in UTF-16 code-unit order.
//! - **v1** (no `sigv: 2`): mimics `JSON.stringify(rest, Object.keys(rest).sort())`, using the
//!   sorted top-level key list as the replacer filter at every depth.

use alloc::{string::String, vec::Vec};
use core::cmp::Ordering;
use core::fmt::{self, Write as _};

/// UTC millisecond timestamp from which the client starts signing with v2 (`Date.UTC(2026, 10, 24)`).
pub const SIGV2_FROM: i64 = 1_795_478_400_000;

/// Returns the active signing version (`1` or `2`) for the given UTC millisecond timestamp.
pub fn signing_version(now_ms: i64) -> u8 {
    if now_ms >= SIGV2_FROM {
        2
    } else {
        1
    }
}

/// Returns `true` if `sigv` is a known signature format version (`None` for v1 or `Some(2)` for v2).
pub fn is_known_sigv(sigv: Option<i64>) -> bool {
    matches!(sigv, None | Some(2))
}

/// Errors produced while canonicalizing a payload for signing or verification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SigFormatError {
    /// Top-level payload passed to [`canonical_string`] is not a [`JsonValue::Object`].
    NotAnObject,
}

impl fmt::Display for SigFormatError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotAnObject => f.write_str("canonical payload must be a JSON object"),
        }
    }
}

/// JSON value AST preserving object entry order via `Vec<(String, JsonValue)>`.
#[derive(Debug, Clone, PartialEq)]
pub enum JsonValue {
    /// JSON `null`.
    Null,
    /// JSON boolean (`true` / `false`).
    Bool(bool),
    /// 64-bit signed integer.
    Int(i64),
    /// IEEE-754 double-precision floating-point number.
    Float(f64),
    /// UTF-8 string.
    Str(String),
    /// JSON array.
    Array(Vec<JsonValue>),
    /// JSON object represented as key-value pairs (`Vec` rather than `BTreeMap` to preserve JS semantics).
    Object(Vec<(String, JsonValue)>),
}

fn cmp_utf16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

fn parse_array_index(s: &str) -> Option<u32> {
    if s.is_empty() || (s.len() > 1 && s.starts_with('0')) {
        return None;
    }
    if !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let val = s.parse::<u32>().ok()?;
    (val < u32::MAX).then_some(val)
}

fn cmp_v2_key(a: &str, b: &str) -> Ordering {
    match (parse_array_index(a), parse_array_index(b)) {
        (Some(ia), Some(ib)) => ia.cmp(&ib),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => cmp_utf16(a, b),
    }
}

fn dedup_entries<'a>(
    entries: &'a [(String, JsonValue)],
    strip_sig_fields: bool,
) -> Vec<(&'a str, &'a JsonValue)> {
    let mut out: Vec<(&'a str, &'a JsonValue)> = Vec::with_capacity(entries.len());
    for (k, v) in entries {
        let key = k.as_str();
        if strip_sig_fields && (key == "sig" || key == "pubKey") {
            continue;
        }
        if let Some(pos) = out.iter().position(|(existing, _)| *existing == key) {
            out[pos].1 = v;
        } else {
            out.push((key, v));
        }
    }
    out
}

fn is_sigv_two(entries: &[(&str, &JsonValue)]) -> bool {
    entries.iter().any(|(k, v)| {
        *k == "sigv"
            && match v {
                JsonValue::Int(2) => true,
                JsonValue::Float(f) => *f == 2.0,
                _ => false,
            }
    })
}

fn write_escaped_str(s: &str, out: &mut String) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\x08' => out.push_str("\\b"),
            '\x0c' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write_float(f: f64, out: &mut String) {
    if !f.is_finite() {
        out.push_str("null");
    } else if f == 0.0 {
        out.push('0');
    } else {
        let _ = write!(out, "{f}");
    }
}

fn serialize_entries(
    entries: &[(&str, &JsonValue)],
    allowed_keys: Option<&[&str]>,
    out: &mut String,
) {
    out.push('{');
    let mut first = true;
    match allowed_keys {
        Some(keys) => {
            for &key in keys {
                if let Some((_, val)) = entries.iter().find(|(k, _)| *k == key) {
                    write_kv(key, val, allowed_keys, &mut first, out);
                }
            }
        }
        None => {
            let mut sorted: Vec<(&str, &JsonValue)> = entries.to_vec();
            sorted.sort_by(|a, b| cmp_v2_key(a.0, b.0));
            for (key, val) in sorted {
                write_kv(key, val, None, &mut first, out);
            }
        }
    }
    out.push('}');
}

fn write_kv(
    key: &str,
    val: &JsonValue,
    allowed_keys: Option<&[&str]>,
    first: &mut bool,
    out: &mut String,
) {
    if !*first {
        out.push(',');
    }
    *first = false;
    write_escaped_str(key, out);
    out.push(':');
    serialize_value(val, allowed_keys, out);
}

fn serialize_value(val: &JsonValue, allowed_keys: Option<&[&str]>, out: &mut String) {
    match val {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        JsonValue::Int(i) => {
            let _ = write!(out, "{i}");
        }
        JsonValue::Float(f) => write_float(*f, out),
        JsonValue::Str(s) => write_escaped_str(s, out),
        JsonValue::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                serialize_value(item, allowed_keys, out);
            }
            out.push(']');
        }
        JsonValue::Object(entries) => {
            let deduped = dedup_entries(entries, false);
            serialize_entries(&deduped, allowed_keys, out);
        }
    }
}

/// Computes the canonical JSON string for a signed or to-be-signed [`JsonValue::Object`].
///
/// Strips top-level `"sig"` and `"pubKey"`, then formats according to `sigv == 2` (v2)
/// or `JSON.stringify(rest, Object.keys(rest).sort())` (v1).
pub fn canonical_string(value: &JsonValue) -> Result<String, SigFormatError> {
    let JsonValue::Object(entries) = value else {
        return Err(SigFormatError::NotAnObject);
    };
    let rest = dedup_entries(entries, true);
    let mut out = String::new();
    if is_sigv_two(&rest) {
        serialize_entries(&rest, None, &mut out);
    } else {
        let mut keys: Vec<&str> = rest.iter().map(|(k, _)| *k).collect();
        keys.sort_by(|a, b| cmp_utf16(a, b));
        serialize_entries(&rest, Some(&keys), &mut out);
    }
    Ok(out)
}
