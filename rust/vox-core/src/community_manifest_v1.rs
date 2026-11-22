//! Closed domain reference types for Community Manifest v1 (ADR-038 / ADR-039 Phase 1b).
//!
//! Mirrors `docs/specs/community-manifest-v1.md` and `docs/specs/fork-comunidade-exp03.md`:
//! - Enforces `v == 1`, `id` prefix `"cm_"`, `issued_at > 0`.
//! - Item size budget `<= 16_384` bytes is checked by the caller (this crate does not serialize):
//!   [`CommunityManifestV1::validate`] covers the structured fields only, so callers must also run
//!   [`CommunityManifestV1::validate_byte_len`] on the wire byte length.
//! - Forbids `extensions` in v1 (`has_extensions` must be `false`).
//! - Restricts `fork_of` to initial manifests where `prev.is_none()` and `fork_of.community_id != community_id`.
//! - Restricts `about.links` to `https://`, `theme` to `#RRGGBB` hex tokens, and `modules` to the closed [`ModuleKind`] set.

use alloc::{string::String, vec::Vec};
use core::fmt;

use crate::vault_v2::is_lowercase_hex_len;

/// Wire format version for Community Manifest v1.
pub const MANIFEST_V1_VERSION: u8 = 1;

/// Maximum serialized manifest item size in bytes (16 KiB).
pub const MAX_MANIFEST_BYTES: usize = 16_384;

/// Maximum character count for `about.text` and `about.rules`.
pub const MAX_ABOUT_TEXT_CHARS: usize = 2_000;

/// Maximum number of links allowed in `about.links`.
pub const MAX_ABOUT_LINKS: usize = 8;

/// Maximum number of module entries allowed in `modules`.
pub const MAX_MODULES: usize = 32;

/// Maximum character count for `modules[].label`.
pub const MAX_MODULE_LABEL_CHARS: usize = 60;

/// Maximum length of a `communityId` slug.
pub const MAX_COMMUNITY_ID_LEN: usize = 128;

const SHA256_PREFIX: &str = "sha256:";

/// Closed set of module kinds permitted in Community Manifest v1 (§5).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModuleKind {
    /// Community index mirror (`"index"`).
    Index,
    /// TURN relay server (`"turn"`).
    Turn,
    /// Arweave pinning/seeding pool (`"ar-pool"`).
    ArPool,
    /// WebRTC signaling server (`"signaling"`).
    Signaling,
    /// Full HTTP relay node (`"relay-http"`).
    RelayHttp,
}

impl ModuleKind {
    /// Parses a wire-format module kind string, rejecting any unknown kind.
    pub fn parse(raw: &str) -> Result<Self, CommunityManifestError> {
        match raw {
            "index" => Ok(Self::Index),
            "turn" => Ok(Self::Turn),
            "ar-pool" => Ok(Self::ArPool),
            "signaling" => Ok(Self::Signaling),
            "relay-http" => Ok(Self::RelayHttp),
            _ => Err(CommunityManifestError::InvalidModuleKind),
        }
    }

    /// Returns the canonical wire-format module kind string.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Index => "index",
            Self::Turn => "turn",
            Self::ArPool => "ar-pool",
            Self::Signaling => "signaling",
            Self::RelayHttp => "relay-http",
        }
    }
}

/// Validation errors for [`CommunityManifestV1`] and its sub-structures.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommunityManifestError {
    /// Manifest version does not equal [`MANIFEST_V1_VERSION`].
    InvalidVersion(u8),
    /// Manifest ID is missing the `"cm_"` prefix or has no suffix.
    InvalidManifestId,
    /// Community ID is empty, too long, or contains disallowed characters.
    InvalidCommunityId,
    /// Author route ID is empty or missing the `"vx_"` prefix.
    InvalidAuthor,
    /// `issued_at` timestamp is not strictly positive.
    InvalidIssuedAt(i64),
    /// `extensions` field is forbidden in manifest v1 (§6).
    ExtensionsForbiddenInV1,
    /// `fork_of` is only permitted on initial manifests where `prev` is `None` (§7).
    ForkRequiresNullPrev,
    /// `fork_of.community_id` cannot match the manifest's own `community_id`.
    ForkSelfReference,
    /// Hash reference does not match `"sha256:<64 lowercase hex>"`.
    InvalidSha256Ref,
    /// `about.text` or `about.rules` exceeds [`MAX_ABOUT_TEXT_CHARS`].
    AboutTextTooLong,
    /// `about.links` exceeds [`MAX_ABOUT_LINKS`].
    TooManyAboutLinks,
    /// An `about.links` entry has an empty label or non-`https://` / credentialed URL.
    InvalidAboutLink,
    /// A `theme` color token is not formatted as `#RRGGBB`.
    InvalidThemeColor,
    /// `modules` exceeds [`MAX_MODULES`].
    TooManyModules,
    /// Module `kind` is not in the closed v1 set.
    InvalidModuleKind,
    /// Module `url` violates scheme or credential-free authority rules.
    InvalidModuleUrl,
    /// Module `label` is empty or exceeds [`MAX_MODULE_LABEL_CHARS`].
    InvalidModuleLabel,
    /// Module `operator` is empty or missing the `"vx_"` prefix.
    InvalidModuleOperator,
    /// Serialized manifest byte length exceeds [`MAX_MANIFEST_BYTES`].
    ManifestTooLarge(usize),
}

impl fmt::Display for CommunityManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidVersion(v) => write!(f, "invalid manifest version: {v}"),
            Self::InvalidManifestId => f.write_str("manifest id must start with cm_"),
            Self::InvalidCommunityId => f.write_str("invalid community_id slug"),
            Self::InvalidAuthor => f.write_str("manifest author must start with vx_"),
            Self::InvalidIssuedAt(ts) => write!(f, "issued_at must be positive, got {ts}"),
            Self::ExtensionsForbiddenInV1 => f.write_str("extensions are forbidden in manifest v1"),
            Self::ForkRequiresNullPrev => f.write_str("fork_of requires prev to be None"),
            Self::ForkSelfReference => {
                f.write_str("fork_of.community_id cannot equal community_id")
            }
            Self::InvalidSha256Ref => f.write_str("hash ref must be sha256:<64 lowercase hex>"),
            Self::AboutTextTooLong => f.write_str("about text/rules exceeds 2000 chars"),
            Self::TooManyAboutLinks => f.write_str("about.links exceeds 8 entries"),
            Self::InvalidAboutLink => f.write_str("about link requires label and https:// url"),
            Self::InvalidThemeColor => f.write_str("theme token must be #RRGGBB hex color"),
            Self::TooManyModules => f.write_str("modules exceeds 32 entries"),
            Self::InvalidModuleKind => f.write_str("unknown module kind"),
            Self::InvalidModuleUrl => f.write_str("invalid or credentialed module url"),
            Self::InvalidModuleLabel => f.write_str("module label must be 1..=60 chars"),
            Self::InvalidModuleOperator => f.write_str("module operator must start with vx_"),
            Self::ManifestTooLarge(n) => {
                write!(f, "manifest size {n} exceeds {MAX_MANIFEST_BYTES}")
            }
        }
    }
}

/// Content-addressed manifest hash reference formatted as `"sha256:<64 lowercase hex>"`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sha256Ref(pub String);

impl Sha256Ref {
    /// Parses and validates a `"sha256:<64 lowercase hex>"` reference string.
    pub fn parse(raw: &str) -> Result<Self, CommunityManifestError> {
        let candidate = Self(String::from(raw));
        candidate.validate()?;
        Ok(candidate)
    }

    /// Returns the underlying reference string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Validates the exact `"sha256:"` prefix followed by 64 lowercase hexadecimal characters.
    pub fn validate(&self) -> Result<(), CommunityManifestError> {
        let Some(hex) = self.0.strip_prefix(SHA256_PREFIX) else {
            return Err(CommunityManifestError::InvalidSha256Ref);
        };
        if !is_lowercase_hex_len(hex, 64) {
            return Err(CommunityManifestError::InvalidSha256Ref);
        }
        Ok(())
    }
}

/// External community link inside [`ManifestAbout::links`] (`https://` only).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AboutLink {
    /// Display label for the link.
    pub label: String,
    /// Link URL; must use `https://` without embedded credentials.
    pub url: String,
}

impl AboutLink {
    /// Validates that the label is non-empty and the URL uses `https://` without credentials.
    pub fn validate(&self) -> Result<(), CommunityManifestError> {
        if self.label.trim().is_empty() {
            return Err(CommunityManifestError::InvalidAboutLink);
        }
        validate_url_with_schemes(&self.url, &["https://"], false)
            .map_err(|_| CommunityManifestError::InvalidAboutLink)
    }
}

/// Community long-form description, rules, and links (`about` group).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestAbout {
    /// Optional long-form description (at most [`MAX_ABOUT_TEXT_CHARS`] characters).
    pub text: Option<String>,
    /// Optional community rules text (at most [`MAX_ABOUT_TEXT_CHARS`] characters).
    pub rules: Option<String>,
    /// Optional external links (at most [`MAX_ABOUT_LINKS`] entries).
    pub links: Vec<AboutLink>,
}

impl ManifestAbout {
    /// Validates text/rules character limits and all [`AboutLink`] entries.
    pub fn validate(&self) -> Result<(), CommunityManifestError> {
        if self
            .text
            .as_deref()
            .is_some_and(|t| t.chars().count() > MAX_ABOUT_TEXT_CHARS)
        {
            return Err(CommunityManifestError::AboutTextTooLong);
        }
        if self
            .rules
            .as_deref()
            .is_some_and(|r| r.chars().count() > MAX_ABOUT_TEXT_CHARS)
        {
            return Err(CommunityManifestError::AboutTextTooLong);
        }
        if self.links.len() > MAX_ABOUT_LINKS {
            return Err(CommunityManifestError::TooManyAboutLinks);
        }
        for link in &self.links {
            link.validate()?;
        }
        Ok(())
    }
}

/// Closed theme token set for community-scoped styling (§4).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestTheme {
    /// Accent color (`#RRGGBB`).
    pub accent: Option<String>,
    /// Text/icon color placed over `accent` (`#RRGGBB`).
    pub on_accent: Option<String>,
    /// Hyperlink color (`#RRGGBB`).
    pub link: Option<String>,
    /// Surface background color (`#RRGGBB`).
    pub surface: Option<String>,
    /// Primary text color over `surface` (`#RRGGBB`).
    pub text: Option<String>,
}

impl ManifestTheme {
    /// Validates that every present theme token is a 6-digit `#RRGGBB` hex color.
    pub fn validate(&self) -> Result<(), CommunityManifestError> {
        let tokens = [
            self.accent.as_deref(),
            self.on_accent.as_deref(),
            self.link.as_deref(),
            self.surface.as_deref(),
            self.text.as_deref(),
        ];
        for token in tokens.into_iter().flatten() {
            if !is_hex_color(token) {
                return Err(CommunityManifestError::InvalidThemeColor);
            }
        }
        Ok(())
    }
}

/// Suggested network connectivity module entry in [`CommunityManifestV1::modules`] (§5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestModule {
    /// Closed module kind.
    pub kind: ModuleKind,
    /// Endpoint URL (`https:`/`wss:`, or `turns:` for [`ModuleKind::Turn`]), without credentials.
    pub url: String,
    /// Human-readable label (1..=[`MAX_MODULE_LABEL_CHARS`] chars).
    pub label: String,
    /// Optional operator route ID (`vx_...`).
    pub operator: Option<String>,
}

impl ManifestModule {
    /// Validates module kind, URL scheme/credentials, label length, and optional operator ID.
    pub fn validate(&self) -> Result<(), CommunityManifestError> {
        let url_res = match self.kind {
            ModuleKind::Turn => validate_url_with_schemes(&self.url, &["turns://", "turns:"], true),
            _ => validate_url_with_schemes(&self.url, &["https://", "wss://"], false),
        };
        if url_res.is_err() {
            return Err(CommunityManifestError::InvalidModuleUrl);
        }
        let label_len = self.label.chars().count();
        if self.label.trim().is_empty() || label_len > MAX_MODULE_LABEL_CHARS {
            return Err(CommunityManifestError::InvalidModuleLabel);
        }
        if self
            .operator
            .as_deref()
            .is_some_and(|op| !is_valid_vx_id(op))
        {
            return Err(CommunityManifestError::InvalidModuleOperator);
        }
        Ok(())
    }
}

/// Origin reference for a forked community's initial manifest (§7 / EXP-03).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForkRef {
    /// Origin community identifier (`!=` the forked manifest's `community_id`).
    pub community_id: String,
    /// Content hash of the origin manifest at fork time.
    pub manifest: Sha256Ref,
}

impl ForkRef {
    /// Validates the origin community ID slug and manifest hash reference.
    pub fn validate(&self) -> Result<(), CommunityManifestError> {
        if !is_valid_community_id(&self.community_id) {
            return Err(CommunityManifestError::InvalidCommunityId);
        }
        self.manifest.validate()
    }
}

/// Reference Community Manifest v1 item (`type: "community_manifest"`, ADR-038).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommunityManifestV1 {
    /// Manifest schema version; must equal [`MANIFEST_V1_VERSION`] (`1`).
    pub v: u8,
    /// Manifest item ID; must begin with `"cm_"`.
    pub id: String,
    /// Target community identifier slug.
    pub community_id: String,
    /// Signing author route ID (`vx_...`).
    pub author: String,
    /// Issuance timestamp in UTC milliseconds (`issued_at > 0`).
    pub issued_at: i64,
    /// Hash of the previous manifest, or `None` for the initial manifest.
    pub prev: Option<Sha256Ref>,
    /// Optional `about` text/rules/links group.
    pub about: Option<ManifestAbout>,
    /// Optional `theme` color palette group.
    pub theme: Option<ManifestTheme>,
    /// Optional `modules` connectivity suggestions (owner-only group).
    pub modules: Option<Vec<ManifestModule>>,
    /// Optional fork provenance; allowed only when `prev.is_none()`.
    pub fork_of: Option<ForkRef>,
    /// Whether an `extensions` field was present on the wire; must be `false` in v1 (§6).
    pub has_extensions: bool,
}

impl CommunityManifestV1 {
    /// Checks that a serialized manifest byte length does not exceed [`MAX_MANIFEST_BYTES`].
    pub fn validate_byte_len(byte_len: usize) -> Result<(), CommunityManifestError> {
        if byte_len > MAX_MANIFEST_BYTES {
            return Err(CommunityManifestError::ManifestTooLarge(byte_len));
        }
        Ok(())
    }

    /// Validates all Community Manifest v1 invariants (§1–§7).
    pub fn validate(&self) -> Result<(), CommunityManifestError> {
        self.validate_header()?;
        self.validate_lineage()?;
        self.validate_groups()
    }

    fn validate_header(&self) -> Result<(), CommunityManifestError> {
        if self.v != MANIFEST_V1_VERSION {
            return Err(CommunityManifestError::InvalidVersion(self.v));
        }
        if self.has_extensions {
            return Err(CommunityManifestError::ExtensionsForbiddenInV1);
        }
        let has_id_suffix = self
            .id
            .strip_prefix("cm_")
            .is_some_and(|rest| !rest.trim().is_empty());
        if !has_id_suffix {
            return Err(CommunityManifestError::InvalidManifestId);
        }
        if !is_valid_community_id(&self.community_id) {
            return Err(CommunityManifestError::InvalidCommunityId);
        }
        if !is_valid_vx_id(&self.author) {
            return Err(CommunityManifestError::InvalidAuthor);
        }
        if self.issued_at <= 0 {
            return Err(CommunityManifestError::InvalidIssuedAt(self.issued_at));
        }
        Ok(())
    }

    fn validate_lineage(&self) -> Result<(), CommunityManifestError> {
        if let Some(prev) = &self.prev {
            prev.validate()?;
        }
        if let Some(fork) = &self.fork_of {
            if self.prev.is_some() {
                return Err(CommunityManifestError::ForkRequiresNullPrev);
            }
            if fork.community_id == self.community_id {
                return Err(CommunityManifestError::ForkSelfReference);
            }
            fork.validate()?;
        }
        Ok(())
    }

    fn validate_groups(&self) -> Result<(), CommunityManifestError> {
        if let Some(about) = &self.about {
            about.validate()?;
        }
        if let Some(theme) = &self.theme {
            theme.validate()?;
        }
        if let Some(modules) = &self.modules {
            if modules.len() > MAX_MODULES {
                return Err(CommunityManifestError::TooManyModules);
            }
            for module in modules {
                module.validate()?;
            }
        }
        Ok(())
    }
}

fn is_valid_community_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_COMMUNITY_ID_LEN
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

fn is_valid_vx_id(id: &str) -> bool {
    id.strip_prefix("vx_")
        .is_some_and(|rest| !rest.is_empty() && !rest.bytes().any(|b| b.is_ascii_whitespace()))
}

fn is_hex_color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(|b| b.is_ascii_hexdigit())
}

fn validate_url_with_schemes(
    url: &str,
    schemes: &[&str],
    allow_schemeless_turn: bool,
) -> Result<(), ()> {
    if url.is_empty()
        || url
            .bytes()
            .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
    {
        return Err(());
    }
    let Some(rest) = schemes.iter().find_map(|p| url.strip_prefix(p)) else {
        return Err(());
    };
    if !allow_schemeless_turn && rest.starts_with('/') {
        return Err(());
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') || authority.starts_with(':') {
        return Err(());
    }
    Ok(())
}
