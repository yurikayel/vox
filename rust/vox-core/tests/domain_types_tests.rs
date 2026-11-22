//! Integration tests for ADR-039 Phase 1b closed domain reference types:
//! `vault_v2`, `dm_envelope_v1`, and `community_manifest_v1`.

use vox_core::community_manifest_v1::{
    AboutLink, CommunityManifestError, CommunityManifestV1, ForkRef, ManifestAbout, ManifestModule,
    ManifestTheme, ModuleKind, Sha256Ref, MANIFEST_V1_VERSION, MAX_ABOUT_LINKS,
    MAX_ABOUT_TEXT_CHARS, MAX_MANIFEST_BYTES, MAX_MODULES,
};
use vox_core::dm_envelope_v1::{
    DeleteTokenEnvelope, DmEnvelopeError, DmEnvelopeV1, P256PublicJwk, DM_V1_VERSION, MAX_DM_ID_LEN,
};
use vox_core::sig_format::JsonValue;
use vox_core::vault_v2::{
    VaultKdf, VaultRecordV2, VaultV2Error, MIN_PBKDF2_ITERATIONS, VAULT_V2_VERSION,
};

fn valid_hash(hex_char: char) -> String {
    let mut s = String::from("sha256:");
    for _ in 0..64 {
        s.push(hex_char);
    }
    s
}

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

fn valid_manifest() -> CommunityManifestV1 {
    CommunityManifestV1 {
        v: MANIFEST_V1_VERSION,
        id: String::from("cm_vox_1795430400000_0a1b2c3d"),
        community_id: String::from("comunidade-vox.01"),
        author: String::from("vx_owner123"),
        issued_at: 1_795_430_400_000,
        prev: Some(Sha256Ref(valid_hash('a'))),
        about: Some(ManifestAbout {
            text: Some(String::from("Comunidade local-first")),
            rules: Some(String::from("Respeito mútuo")),
            links: vec![AboutLink {
                label: String::from("Site"),
                url: String::from("https://vox.example.org/sobre"),
            }],
        }),
        theme: Some(ManifestTheme {
            accent: Some(String::from("#1f6feb")),
            on_accent: Some(String::from("#ffffff")),
            link: Some(String::from("#0b57d0")),
            surface: Some(String::from("#ffffff")),
            text: Some(String::from("#1b1b1b")),
        }),
        modules: Some(vec![ManifestModule {
            kind: ModuleKind::RelayHttp,
            url: String::from("https://relay.example.org"),
            label: String::from("Relay principal"),
            operator: Some(String::from("vx_op1")),
        }]),
        fork_of: None,
        has_extensions: false,
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

#[test]
fn manifest_v1_accepts_valid_and_closed_module_kinds() {
    assert_eq!(MANIFEST_V1_VERSION, 1);
    assert_eq!(MAX_MANIFEST_BYTES, 16_384);
    assert_eq!(MAX_ABOUT_TEXT_CHARS, 2_000);
    assert_eq!(MAX_ABOUT_LINKS, 8);
    assert_eq!(MAX_MODULES, 32);
    assert_eq!(valid_manifest().validate(), Ok(()));
    assert_eq!(
        CommunityManifestV1::validate_byte_len(MAX_MANIFEST_BYTES),
        Ok(())
    );
    assert_eq!(
        CommunityManifestV1::validate_byte_len(MAX_MANIFEST_BYTES + 1),
        Err(CommunityManifestError::ManifestTooLarge(16_385))
    );

    for (raw, expected) in [
        ("index", ModuleKind::Index),
        ("turn", ModuleKind::Turn),
        ("ar-pool", ModuleKind::ArPool),
        ("signaling", ModuleKind::Signaling),
        ("relay-http", ModuleKind::RelayHttp),
    ] {
        assert_eq!(ModuleKind::parse(raw), Ok(expected));
        assert_eq!(expected.as_str(), raw);
    }
    assert_eq!(
        ModuleKind::parse("central-memory"),
        Err(CommunityManifestError::InvalidModuleKind)
    );
}

#[test]
fn manifest_v1_rejects_extensions_bad_header_and_fork_invariants() {
    let mut ext = valid_manifest();
    ext.has_extensions = true;
    assert_eq!(
        ext.validate(),
        Err(CommunityManifestError::ExtensionsForbiddenInV1)
    );

    let mut bad_v = valid_manifest();
    bad_v.v = 2;
    assert_eq!(
        bad_v.validate(),
        Err(CommunityManifestError::InvalidVersion(2))
    );

    let mut bad_id = valid_manifest();
    bad_id.id = String::from("post_123");
    assert_eq!(
        bad_id.validate(),
        Err(CommunityManifestError::InvalidManifestId)
    );

    let mut bad_ts = valid_manifest();
    bad_ts.issued_at = 0;
    assert_eq!(
        bad_ts.validate(),
        Err(CommunityManifestError::InvalidIssuedAt(0))
    );

    let mut fork_with_prev = valid_manifest();
    fork_with_prev.fork_of = Some(ForkRef {
        community_id: String::from("origem"),
        manifest: Sha256Ref(valid_hash('b')),
    });
    assert_eq!(
        fork_with_prev.validate(),
        Err(CommunityManifestError::ForkRequiresNullPrev)
    );

    let mut fork_valid = fork_with_prev;
    fork_valid.prev = None;
    assert_eq!(fork_valid.validate(), Ok(()));

    fork_valid.fork_of.as_mut().unwrap().community_id = fork_valid.community_id.clone();
    assert_eq!(
        fork_valid.validate(),
        Err(CommunityManifestError::ForkSelfReference)
    );
}

#[test]
fn manifest_v1_rejects_bad_sha256_about_theme_and_modules() {
    assert_eq!(
        Sha256Ref::parse(&valid_hash('f')),
        Ok(Sha256Ref(valid_hash('f')))
    );
    assert_eq!(
        Sha256Ref::parse(&valid_hash('F')),
        Err(CommunityManifestError::InvalidSha256Ref)
    );
    assert_eq!(
        Sha256Ref::parse("sha1:0000"),
        Err(CommunityManifestError::InvalidSha256Ref)
    );

    let mut long_about = valid_manifest();
    long_about.about.as_mut().unwrap().text = Some("a".repeat(MAX_ABOUT_TEXT_CHARS + 1));
    assert_eq!(
        long_about.validate(),
        Err(CommunityManifestError::AboutTextTooLong)
    );

    let mut bad_link = valid_manifest();
    bad_link.about.as_mut().unwrap().links[0].url = String::from("http://insecure.example");
    assert_eq!(
        bad_link.validate(),
        Err(CommunityManifestError::InvalidAboutLink)
    );

    let mut js_link = valid_manifest();
    js_link.about.as_mut().unwrap().links[0].url = String::from("javascript:alert(1)");
    assert_eq!(
        js_link.validate(),
        Err(CommunityManifestError::InvalidAboutLink)
    );

    let mut too_many_links = valid_manifest();
    too_many_links.about.as_mut().unwrap().links = vec![
        AboutLink {
            label: String::from("L"),
            url: String::from("https://vox.example.org"),
        };
        MAX_ABOUT_LINKS + 1
    ];
    assert_eq!(
        too_many_links.validate(),
        Err(CommunityManifestError::TooManyAboutLinks)
    );

    let mut bad_theme = valid_manifest();
    bad_theme.theme.as_mut().unwrap().accent = Some(String::from("#fff"));
    assert_eq!(
        bad_theme.validate(),
        Err(CommunityManifestError::InvalidThemeColor)
    );
}

#[test]
fn manifest_v1_rejects_bad_module_urls_credentials_and_limits() {
    let turn_ok = ManifestModule {
        kind: ModuleKind::Turn,
        url: String::from("turns:turn.example.org:5349"),
        label: String::from("TURN TLS"),
        operator: None,
    };
    assert_eq!(turn_ok.validate(), Ok(()));

    let mut turn_cred = turn_ok;
    turn_cred.url = String::from("turns://user:secret@turn.example.org:5349");
    assert_eq!(
        turn_cred.validate(),
        Err(CommunityManifestError::InvalidModuleUrl)
    );

    let mut bad_ws = valid_manifest();
    bad_ws.modules.as_mut().unwrap()[0] = ManifestModule {
        kind: ModuleKind::Signaling,
        url: String::from("ws://plain.example.org"),
        label: String::from("Sig"),
        operator: None,
    };
    assert_eq!(
        bad_ws.validate(),
        Err(CommunityManifestError::InvalidModuleUrl)
    );

    let mut too_many_mods = valid_manifest();
    let sample = too_many_mods.modules.as_ref().unwrap()[0].clone();
    too_many_mods.modules = Some(vec![sample; MAX_MODULES + 1]);
    assert_eq!(
        too_many_mods.validate(),
        Err(CommunityManifestError::TooManyModules)
    );
}
