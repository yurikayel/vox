//! Constant-time GF(256) arithmetic and Shamir secret sharing (ADR-039 Phase 1).
//!
//! Uses the AES field polynomial (`0x11b`) with zero lookup tables and zero
//! secret-dependent branches. Matches `client/js/shamir-gf256.js`.

use alloc::{vec, vec::Vec};
use core::fmt;

/// Minimum threshold `M` allowed (`M = 1` would hand the secret to a single guardian).
pub const MIN_M: usize = 2;

/// Maximum number of shares `N`.
pub const MAX_N: usize = 7;

/// Byte length of a split identifier.
pub const SPLIT_ID_BYTES: usize = 16;

/// Errors returned by GF(256) Shamir operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShamirError {
    /// Attempted division by zero in GF(256).
    DivisionByZero,
    /// Invalid threshold/share count (`m < MIN_M`, `n > MAX_N`, or `m > n`).
    InvalidThreshold,
    /// Secret slice must not be empty.
    EmptySecret,
    /// Coefficient buffer length does not match `secret.len() * (m - 1)`.
    InvalidCoeffLength,
    /// Fewer than `m` shares were provided to [`combine`].
    InsufficientShares,
    /// A share has `x == 0`, which would reveal the secret directly.
    InvalidShareX,
    /// Two or more shares share the same `x` coordinate.
    DuplicateShareX,
    /// Share data is empty or shares have different byte lengths.
    MismatchedShareLength,
}

impl fmt::Display for ShamirError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DivisionByZero => f.write_str("division by zero in GF(256)"),
            Self::InvalidThreshold => f.write_str("threshold m and share count n out of range"),
            Self::EmptySecret => f.write_str("secret must not be empty"),
            Self::InvalidCoeffLength => f.write_str("invalid coefficient buffer length"),
            Self::InsufficientShares => f.write_str("insufficient shares to reconstruct secret"),
            Self::InvalidShareX => f.write_str("share x coordinate must be in 1..=255"),
            Self::DuplicateShareX => f.write_str("duplicate share x coordinate"),
            Self::MismatchedShareLength => f.write_str("empty or mismatched share byte lengths"),
        }
    }
}

/// A single Shamir share `(x, y)` with `x` in `1..=255`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Share {
    /// Non-zero evaluation point in GF(256) (`1..=n`).
    pub x: u8,
    /// Evaluated byte vector `f_k(x)` for each byte `k` of the secret.
    pub data: Vec<u8>,
}

/// Constant-time multiplication in GF(2^8) modulo `x^8 + x^4 + x^3 + x + 1` (`0x11b`).
///
/// Runs 8 fixed Russian-peasant iterations using bitwise masks with no lookup
/// tables and no secret-dependent branches.
pub fn gf_mul(a: u8, b: u8) -> u8 {
    let mut x = a;
    let mut y = b;
    let mut out = 0u8;
    for _ in 0..8 {
        let lsb_mask = 0u8.wrapping_sub(y & 1);
        out ^= x & lsb_mask;
        let hi_mask = 0u8.wrapping_sub(x >> 7);
        x = (x << 1) ^ (0x1b & hi_mask);
        y >>= 1;
    }
    out
}

/// Constant-time multiplicative inverse in GF(2^8) via `a^254`.
///
/// Returns `0` for `a == 0` and uses a fixed square-and-multiply chain over [`gf_mul`].
pub fn gf_inv(a: u8) -> u8 {
    let mut sq = gf_mul(a, a);
    let mut acc = sq;
    for _ in 0..6 {
        sq = gf_mul(sq, sq);
        acc = gf_mul(acc, sq);
    }
    acc
}

/// Constant-time division `a / b` in GF(2^8).
///
/// Returns [`ShamirError::DivisionByZero`] when `b == 0`.
pub fn gf_div(a: u8, b: u8) -> Result<u8, ShamirError> {
    if b == 0 {
        return Err(ShamirError::DivisionByZero);
    }
    Ok(gf_mul(a, gf_inv(b)))
}

fn eval_poly(secret_byte: u8, random_coeffs: &[u8], x: u8) -> u8 {
    let mut acc = 0u8;
    for &c in random_coeffs.iter().rev() {
        acc = gf_mul(acc, x) ^ c;
    }
    gf_mul(acc, x) ^ secret_byte
}

/// Splits `secret` into `n` shares with threshold `m` using caller-supplied
/// random polynomial coefficients `coeffs` (layout: `(m - 1)` coefficients
/// of degrees `1..m` per secret byte).
pub fn split_with_coeffs(
    secret: &[u8],
    n: u8,
    m: u8,
    coeffs: &[u8],
) -> Result<Vec<Share>, ShamirError> {
    let m_usize = usize::from(m);
    let n_usize = usize::from(n);
    if m_usize < MIN_M || n_usize > MAX_N || m_usize > n_usize {
        return Err(ShamirError::InvalidThreshold);
    }
    if secret.is_empty() {
        return Err(ShamirError::EmptySecret);
    }
    let degree = m_usize - 1;
    if coeffs.len() != secret.len() * degree {
        return Err(ShamirError::InvalidCoeffLength);
    }

    let mut shares: Vec<Share> = (1..=n)
        .map(|x| Share {
            x,
            data: vec![0u8; secret.len()],
        })
        .collect();

    for (k, &s_byte) in secret.iter().enumerate() {
        let byte_coeffs = &coeffs[k * degree..(k + 1) * degree];
        for share in &mut shares {
            share.data[k] = eval_poly(s_byte, byte_coeffs, share.x);
        }
    }
    Ok(shares)
}

fn validate_picked(picked: &[Share]) -> Result<usize, ShamirError> {
    let data_len = picked[0].data.len();
    if data_len == 0 {
        return Err(ShamirError::MismatchedShareLength);
    }
    for (i, share) in picked.iter().enumerate() {
        if share.x == 0 {
            return Err(ShamirError::InvalidShareX);
        }
        if share.data.len() != data_len {
            return Err(ShamirError::MismatchedShareLength);
        }
        if picked[i + 1..].iter().any(|other| other.x == share.x) {
            return Err(ShamirError::DuplicateShareX);
        }
    }
    Ok(data_len)
}

fn lagrange_weight_at_zero(picked: &[Share], idx: usize) -> Result<u8, ShamirError> {
    let xi = picked[idx].x;
    let mut weight = 1u8;
    for (j, other) in picked.iter().enumerate() {
        if j == idx {
            continue;
        }
        let ratio = gf_div(other.x, other.x ^ xi)?;
        weight = gf_mul(weight, ratio);
    }
    Ok(weight)
}

/// Reconstructs a secret from the first `m` shares using Lagrange interpolation at `x = 0`.
pub fn combine(shares: &[Share], m: usize) -> Result<Vec<u8>, ShamirError> {
    if !(MIN_M..=MAX_N).contains(&m) {
        return Err(ShamirError::InvalidThreshold);
    }
    if shares.len() < m {
        return Err(ShamirError::InsufficientShares);
    }
    let picked = &shares[..m];
    let data_len = validate_picked(picked)?;

    let mut weights = Vec::with_capacity(m);
    for i in 0..m {
        weights.push(lagrange_weight_at_zero(picked, i)?);
    }

    let mut secret = vec![0u8; data_len];
    for (k, out_byte) in secret.iter_mut().enumerate() {
        let mut acc = 0u8;
        for (share, &w) in picked.iter().zip(weights.iter()) {
            acc ^= gf_mul(share.data[k], w);
        }
        *out_byte = acc;
    }
    Ok(secret)
}
