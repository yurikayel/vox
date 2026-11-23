//! Integration tests for ADR-039 Phase 1b `dm_envelope_v1` closed domain types.

use vox_core::dm_envelope_v1::{
    DeleteTokenEnvelope, DmEnvelopeError, DmEnvelopeV1, P256PublicJwk, DM_V1_VERSION, MAX_DM_ID_LEN,
};
use vox_core::sig_format::JsonValue;

fn valid_jwk() -> P256PublicJwk {
    P256PublicJwk {
        kty: String::from("EC"),
        crv: String::from("P-256"),
        x: String::from("f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU"),
        y: String::from("x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"),
    }
}

fn valid_dm() -> DmEnvelopeV1 {
    DmEnvelopeV1 {
        v: DM_V1_VERSION,
        id: String::from("dm_abc123def456"),
        from: String::from("vx_alice"),
        to: String::from("vx_bob"),
        ts: 1_795_430_400_000,
        eph_pub: valid_jwk(),
        iv: String::from("AQIDBAUGBwgJCgsM"),
        ct: String::from("c2VhbGVkLWRtLXBheWxvYWQ"),
        del: Some(DeleteTokenEnvelope {
            iv: String::from("DQ4PEBESExQVFhcY"),
            ct: String::from("ZGVsZXRlLXRva2Vu"),
            hash: "a".repeat(64),
        }),
    }
}

#[test]
fn dm_envelope_v1_accepts_valid_and_rejects_private_or_bad_jwk() {
    assert_eq!(DM_V1_VERSION, 1);
    assert_eq!(MAX_DM_ID_LEN, 128);
    assert_eq!(valid_dm().validate(), Ok(()));

    let mut no_del = valid_dm();
    no_del.del = None;
    assert_eq!(no_del.validate(), Ok(()));

    let jwk_obj = JsonValue::Object(vec![
        (String::from("kty"), JsonValue::Str(String::from("EC"))),
        (String::from("crv"), JsonValue::Str(String::from("P-256"))),
        (String::from("x"), JsonValue::Str(valid_jwk().x)),
        (String::from("y"), JsonValue::Str(valid_jwk().y)),
    ]);
    assert_eq!(P256PublicJwk::from_json(&jwk_obj), Ok(valid_jwk()));

    let jwk_with_d = JsonValue::Object(vec![
        (String::from("kty"), JsonValue::Str(String::from("EC"))),
        (String::from("crv"), JsonValue::Str(String::from("P-256"))),
        (String::from("x"), JsonValue::Str(valid_jwk().x)),
        (String::from("y"), JsonValue::Str(valid_jwk().y)),
        (String::from("d"), JsonValue::Str(String::from("secret"))),
    ]);
    assert_eq!(
        P256PublicJwk::from_json(&jwk_with_d),
        Err(DmEnvelopeError::PrivateJwkMemberForbidden)
    );
}

#[test]
fn dm_envelope_v1_rejects_invalid_fields() {
    let mut bad_v = valid_dm();
    bad_v.v = 2;
    assert_eq!(bad_v.validate(), Err(DmEnvelopeError::InvalidVersion(2)));

    let mut bad_id = valid_dm();
    bad_id.id = "a".repeat(MAX_DM_ID_LEN + 1);
    assert_eq!(bad_id.validate(), Err(DmEnvelopeError::InvalidMessageId));

    let mut empty_from = valid_dm();
    empty_from.from = String::from("   ");
    assert_eq!(
        empty_from.validate(),
        Err(DmEnvelopeError::InvalidParticipant)
    );

    let mut bad_ts = valid_dm();
    bad_ts.ts = 0;
    assert_eq!(bad_ts.validate(), Err(DmEnvelopeError::InvalidTimestamp(0)));

    let mut bad_kty = valid_dm();
    bad_kty.eph_pub.kty = String::from("RSA");
    assert_eq!(bad_kty.validate(), Err(DmEnvelopeError::InvalidJwkKty));

    let mut bad_crv = valid_dm();
    bad_crv.eph_pub.crv = String::from("P-384");
    assert_eq!(bad_crv.validate(), Err(DmEnvelopeError::InvalidJwkCrv));

    let mut bad_coord = valid_dm();
    bad_coord.eph_pub.x = String::new();
    assert_eq!(
        bad_coord.validate(),
        Err(DmEnvelopeError::InvalidJwkCoordinate)
    );
}

#[test]
fn dm_envelope_v1_rejects_bad_payload_and_delete_token() {
    let mut bad_iv = valid_dm();
    bad_iv.iv = String::from("not+base64url");
    assert_eq!(bad_iv.validate(), Err(DmEnvelopeError::InvalidIv));

    let mut bad_ct = valid_dm();
    bad_ct.ct = String::new();
    assert_eq!(bad_ct.validate(), Err(DmEnvelopeError::InvalidCiphertext));

    let mut bad_del_hash_len = valid_dm();
    bad_del_hash_len.del.as_mut().unwrap().hash = "a".repeat(63);
    assert_eq!(
        bad_del_hash_len.validate(),
        Err(DmEnvelopeError::InvalidDeleteTokenHash)
    );

    let mut bad_del_hash_upper = valid_dm();
    bad_del_hash_upper.del.as_mut().unwrap().hash = "A".repeat(64);
    assert_eq!(
        bad_del_hash_upper.validate(),
        Err(DmEnvelopeError::InvalidDeleteTokenHash)
    );

    let mut bad_del_iv = valid_dm();
    bad_del_iv.del.as_mut().unwrap().iv = String::from("x");
    assert_eq!(
        bad_del_iv.validate(),
        Err(DmEnvelopeError::InvalidDeleteTokenPayload)
    );
}
