//! Integration tests verifying canonical JSON serialization parity with `client/js/sig-format.js`.

use vox_core::sig_format::{
    canonical_string, is_known_sigv, signing_version, JsonValue, SigFormatError, SIGV2_FROM,
};

fn obj(pairs: Vec<(&str, JsonValue)>) -> JsonValue {
    JsonValue::Object(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

fn s(val: &str) -> JsonValue {
    JsonValue::Str(val.to_string())
}

fn tags_fixture(target_id: &str) -> JsonValue {
    JsonValue::Array(vec![obj(vec![
        ("targetId", s(target_id)),
        ("label", s("Alvo")),
        ("x", JsonValue::Int(10)),
        ("y", JsonValue::Int(20)),
    ])])
}

#[test]
fn version_constants_and_checks_match_js() {
    assert_eq!(SIGV2_FROM, 1_795_478_400_000);
    assert_eq!(signing_version(SIGV2_FROM - 1), 1);
    assert_eq!(signing_version(SIGV2_FROM), 2);
    assert!(is_known_sigv(None));
    assert!(is_known_sigv(Some(2)));
    assert!(!is_known_sigv(Some(1)));
    assert!(!is_known_sigv(Some(3)));
}

#[test]
fn canonical_string_matches_js_v1_and_v2_phototags() {
    let a = obj(vec![
        ("title", s("x")),
        ("photoTags", tags_fixture("vx_alvo")),
    ]);
    let b = obj(vec![
        ("title", s("x")),
        ("photoTags", tags_fixture("vx_outro")),
    ]);
    assert_eq!(
        canonical_string(&a).unwrap(),
        "{\"photoTags\":[{}],\"title\":\"x\"}"
    );
    assert_eq!(canonical_string(&a), canonical_string(&b));

    let a_v2 = obj(vec![
        ("title", s("x")),
        ("photoTags", tags_fixture("vx_alvo")),
        ("sigv", JsonValue::Int(2)),
    ]);
    let shuffled_v2 = obj(vec![
        ("sigv", JsonValue::Int(2)),
        (
            "photoTags",
            JsonValue::Array(vec![obj(vec![
                ("y", JsonValue::Int(20)),
                ("x", JsonValue::Int(10)),
                ("label", s("Alvo")),
                ("targetId", s("vx_alvo")),
            ])]),
        ),
        ("title", s("x")),
    ]);
    let expected_v2 =
        "{\"photoTags\":[{\"label\":\"Alvo\",\"targetId\":\"vx_alvo\",\"x\":10,\"y\":20}],\"sigv\":2,\"title\":\"x\"}";
    assert_eq!(canonical_string(&a_v2).unwrap(), expected_v2);
    assert_eq!(canonical_string(&shuffled_v2).unwrap(), expected_v2);
}

#[test]
fn canonical_string_strips_sig_and_pubkey_and_handles_nested_rules() {
    let with_sig = obj(vec![
        ("title", s("x")),
        ("photoTags", tags_fixture("vx_alvo")),
        ("sig", s("s")),
        ("pubKey", obj(vec![("kty", s("EC"))])),
    ]);
    assert_eq!(
        canonical_string(&with_sig).unwrap(),
        "{\"photoTags\":[{}],\"title\":\"x\"}"
    );

    let v1_shared = obj(vec![
        ("id", s("p1")),
        ("nested", obj(vec![("id", s("n1")), ("secret", s("x"))])),
        (
            "items",
            JsonValue::Array(vec![obj(vec![
                ("id", s("i1")),
                ("drop", JsonValue::Int(2)),
            ])]),
        ),
    ]);
    assert_eq!(
        canonical_string(&v1_shared).unwrap(),
        "{\"id\":\"p1\",\"items\":[{\"id\":\"i1\"}],\"nested\":{\"id\":\"n1\"}}"
    );

    let v2_deep = obj(vec![
        ("id", s("p2")),
        ("sigv", JsonValue::Int(2)),
        ("ts", JsonValue::Int(10)),
        (
            "meta",
            obj(vec![
                ("b", JsonValue::Int(2)),
                (
                    "a",
                    JsonValue::Array(vec![
                        JsonValue::Int(1),
                        obj(vec![("y", s("ok")), ("x", JsonValue::Int(0))]),
                    ]),
                ),
            ]),
        ),
    ]);
    assert_eq!(
        canonical_string(&v2_deep).unwrap(),
        "{\"id\":\"p2\",\"meta\":{\"a\":[1,{\"x\":0,\"y\":\"ok\"}],\"b\":2},\"sigv\":2,\"ts\":10}"
    );
}

#[test]
fn canonical_string_handles_sigv_non_2_escapes_numbers_and_key_order() {
    let sigv_str = obj(vec![
        ("id", s("a")),
        ("sigv", s("2")),
        (
            "nested",
            obj(vec![("id", s("n")), ("other", JsonValue::Int(1))]),
        ),
    ]);
    assert_eq!(
        canonical_string(&sigv_str).unwrap(),
        "{\"id\":\"a\",\"nested\":{\"id\":\"n\"},\"sigv\":\"2\"}"
    );

    let escapes = obj(vec![
        ("sigv", JsonValue::Int(2)),
        ("s", s("é🚀\u{007f}\x08\x0c\n\r\t\"\\/\u{0001}\u{001f}")),
    ]);
    assert_eq!(
        canonical_string(&escapes).unwrap(),
        "{\"s\":\"é🚀\u{007f}\\b\\f\\n\\r\\t\\\"\\\\/\\u0001\\u001f\",\"sigv\":2}"
    );

    let numbers = obj(vec![
        ("sigv", JsonValue::Int(2)),
        ("a", JsonValue::Float(f64::NAN)),
        ("b", JsonValue::Float(f64::INFINITY)),
        ("c", JsonValue::Float(f64::NEG_INFINITY)),
        ("d", JsonValue::Float(-0.0)),
        ("e", JsonValue::Float(2.0)),
        ("f", JsonValue::Int(-42)),
        ("g", JsonValue::Float(1.5)),
    ]);
    assert_eq!(
        canonical_string(&numbers).unwrap(),
        "{\"a\":null,\"b\":null,\"c\":null,\"d\":0,\"e\":2,\"f\":-42,\"g\":1.5,\"sigv\":2}"
    );

    let v1_keys = obj(vec![
        ("10", JsonValue::Int(3)),
        ("2", JsonValue::Int(4)),
        ("a", JsonValue::Int(1)),
    ]);
    assert_eq!(
        canonical_string(&v1_keys).unwrap(),
        "{\"10\":3,\"2\":4,\"a\":1}"
    );

    let v2_keys = obj(vec![
        ("sigv", JsonValue::Int(2)),
        ("4294967295", JsonValue::Int(1)),
        ("4294967294", JsonValue::Int(2)),
        ("0", JsonValue::Int(3)),
        ("01", JsonValue::Int(4)),
        ("10", JsonValue::Int(5)),
        ("2", JsonValue::Int(6)),
        ("\u{1F600}", JsonValue::Int(7)),
        ("\u{E000}", JsonValue::Int(8)),
    ]);
    assert_eq!(
        canonical_string(&v2_keys).unwrap(),
        "{\"0\":3,\"2\":6,\"10\":5,\"4294967294\":2,\"01\":4,\"4294967295\":1,\"sigv\":2,\"\u{1F600}\":7,\"\u{E000}\":8}"
    );

    assert_eq!(
        canonical_string(&JsonValue::Null),
        Err(SigFormatError::NotAnObject)
    );
    assert_eq!(
        canonical_string(&JsonValue::Array(vec![])),
        Err(SigFormatError::NotAnObject)
    );
}
