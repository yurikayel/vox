//! Integration tests for ADR-039 Phase 1b `vault_v2` closed domain types.

use vox_core::vault_v2::{
    VaultKdf, VaultRecordV2, VaultV2Error, MIN_PBKDF2_ITERATIONS, VAULT_V2_VERSION,
};

fn valid_vault() -> VaultRecordV2 {
    VaultRecordV2 {
        version: VAULT_V2_VERSION,
        kdf: VaultKdf::Pbkdf2Sha256,
        iter: MIN_PBKDF2_ITERATIONS,
        salt: String::from("0123456789abcdef0123456789abcdef"),
        iv: String::from("abcdef012345abcdef012345"),
        ciphertext: String::from("AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcY"),
    }
}

#[test]
fn vault_v2_accepts_valid_and_rejects_unknown_kdf() {
    assert_eq!(VAULT_V2_VERSION, 2);
    assert_eq!(MIN_PBKDF2_ITERATIONS, 600_000);
    assert_eq!(VaultKdf::parse("pbkdf2-sha256"), Ok(VaultKdf::Pbkdf2Sha256));
    assert_eq!(VaultKdf::Pbkdf2Sha256.as_str(), "pbkdf2-sha256");
    for bad in ["", "pbkdf2-sha1", "argon2id", "PBKDF2-SHA256", "scrypt"] {
        assert_eq!(VaultKdf::parse(bad), Err(VaultV2Error::UnsupportedKdf));
    }
    assert_eq!(valid_vault().validate(), Ok(()));
    let mut std_b64 = valid_vault();
    std_b64.salt = String::from("0123+/==");
    std_b64.iv = String::from("abcd_e-f");
    assert_eq!(std_b64.validate(), Ok(()));
}

#[test]
fn vault_v2_rejects_bad_version_iterations_and_encodings() {
    let mut bad_ver = valid_vault();
    bad_ver.version = 1;
    assert_eq!(bad_ver.validate(), Err(VaultV2Error::InvalidVersion(1)));

    let mut low_iter = valid_vault();
    low_iter.iter = MIN_PBKDF2_ITERATIONS - 1;
    assert_eq!(
        low_iter.validate(),
        Err(VaultV2Error::InsufficientIterations(599_999))
    );

    for bad_enc in ["", "x", "abc$def", "ab+cd-ef", "ab=", "a===", "ab=cd"] {
        let mut rec = valid_vault();
        rec.salt = String::from(bad_enc);
        assert_eq!(rec.validate(), Err(VaultV2Error::InvalidSalt));

        let mut rec_iv = valid_vault();
        rec_iv.iv = String::from(bad_enc);
        assert_eq!(rec_iv.validate(), Err(VaultV2Error::InvalidIv));

        let mut rec_ct = valid_vault();
        rec_ct.ciphertext = String::from(bad_enc);
        assert_eq!(rec_ct.validate(), Err(VaultV2Error::InvalidCiphertext));
    }
}
