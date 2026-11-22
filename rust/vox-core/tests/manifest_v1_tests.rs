//! Integration tests for ADR-039 Phase 1b `community_manifest_v1` closed domain types.

use vox_core::community_manifest_v1::{
    AboutLink, CommunityManifestError, CommunityManifestV1, ForkRef, ManifestAbout, ManifestModule,
    ManifestTheme, ModuleKind, Sha256Ref, MANIFEST_V1_VERSION, MAX_ABOUT_LINKS,
    MAX_ABOUT_TEXT_CHARS, MAX_MANIFEST_BYTES, MAX_MODULES,
};

fn valid_hash(hex_char: char) -> String {
    let mut s = String::from("sha256:");
    for _ in 0..64 {
        s.push(hex_char);
    }
    s
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
fn sha256_ref_accepts_lowercase_hex_only() {
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
}

#[test]
fn manifest_v1_rejects_about_text_over_limit() {
    let mut long_about = valid_manifest();
    long_about.about.as_mut().unwrap().text = Some("a".repeat(MAX_ABOUT_TEXT_CHARS + 1));
    assert_eq!(
        long_about.validate(),
        Err(CommunityManifestError::AboutTextTooLong)
    );
}

#[test]
fn manifest_v1_rejects_non_https_about_links() {
    for bad_url in ["http://insecure.example", "javascript:alert(1)"] {
        let mut bad_link = valid_manifest();
        bad_link.about.as_mut().unwrap().links[0].url = String::from(bad_url);
        assert_eq!(
            bad_link.validate(),
            Err(CommunityManifestError::InvalidAboutLink)
        );
    }
}

#[test]
fn manifest_v1_rejects_too_many_about_links() {
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
}

#[test]
fn manifest_v1_rejects_short_hex_theme_color() {
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
