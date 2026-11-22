//! Integration tests for constant-time GF(256) arithmetic and Shamir sharing.

use vox_core::shamir_gf256::{
    combine, gf_div, gf_inv, gf_mul, split_with_coeffs, ShamirError, Share, MAX_N, MIN_M,
    SPLIT_ID_BYTES,
};

fn slow_mul(mut a: u8, mut b: u8) -> u8 {
    let mut out = 0u8;
    while b != 0 {
        if (b & 1) != 0 {
            out ^= a;
        }
        let hi = (a & 0x80) != 0;
        a <<= 1;
        if hi {
            a ^= 0x1b;
        }
        b >>= 1;
    }
    out
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        use core::fmt::Write as _;
        let _ = write!(s, "{b:02x}");
    }
    s
}

fn subsets(shares: &[Share], size: usize) -> Vec<Vec<Share>> {
    if size == 0 {
        return vec![Vec::new()];
    }
    if shares.len() < size {
        return Vec::new();
    }
    let mut out = Vec::new();
    for tail in subsets(&shares[1..], size - 1) {
        let mut with_head = Vec::with_capacity(tail.len() + 1);
        with_head.push(shares[0].clone());
        with_head.extend(tail);
        out.push(with_head);
    }
    out.extend(subsets(&shares[1..], size));
    out
}

#[test]
fn gf256_constants_and_fips_vectors() {
    assert_eq!(MIN_M, 2);
    assert_eq!(MAX_N, 7);
    assert_eq!(SPLIT_ID_BYTES, 16);
    assert_eq!(gf_mul(0x57, 0x83), 0xc1);
    assert_eq!(gf_mul(0x53, 0xca), 0x01);
    assert_eq!(gf_inv(0), 0);
    assert_eq!(gf_div(1, 0), Err(ShamirError::DivisionByZero));
    assert_eq!(gf_div(0, 0), Err(ShamirError::DivisionByZero));
}

#[test]
fn gf256_exhaustive_inverses_and_field_axioms() {
    for a in 1u8..=255 {
        assert_eq!(gf_mul(a, gf_inv(a)), 1, "inverse failed for {a:#04x}");
    }
    for a in (0u8..=255).step_by(17) {
        assert_eq!(gf_mul(0, a), 0);
        assert_eq!(gf_mul(a, 0), 0);
        assert_eq!(gf_mul(1, a), a);
        assert_eq!(gf_mul(a, 1), a);
        for b in (1u8..=255).step_by(19) {
            assert_eq!(gf_mul(a, b), slow_mul(a, b));
            assert_eq!(gf_mul(a, b), gf_mul(b, a));
            assert_eq!(gf_mul(gf_div(a, b).unwrap(), b), a);
            for c in (0u8..=255).step_by(51) {
                assert_eq!(gf_mul(a, b ^ c), gf_mul(a, b) ^ gf_mul(a, c));
            }
        }
    }
}

#[test]
fn shamir_golden_vector_3_of_5_matches_js() {
    let secret: Vec<u8> = (0u8..16).collect();
    // Matches counterRandom() in tests/shamir-gf256.test.js after the 16-byte splitId.
    let coeffs: Vec<u8> = (16..48).map(|c| ((c * 37 + 11) & 0xff) as u8).collect();
    let shares = split_with_coeffs(&secret, 5, 3, &coeffs).unwrap();
    let expected = [
        (1u8, "db6ef9642f3a2de073e6512c2752e568"),
        (2u8, "805597128f61d8eb2890ff8c7c24c603"),
        (3u8, "5b3a6c75a45ef30c537fa4ab577b2d64"),
        (4u8, "afb7c87050a5b7203d4bec1774359132"),
        (5u8, "74d833177b9a9cc746a4b7305f6a7a55"),
    ];
    let got: Vec<(u8, String)> = shares.iter().map(|s| (s.x, to_hex(&s.data))).collect();
    let want: Vec<(u8, String)> = expected
        .iter()
        .map(|(x, h)| (*x, (*h).to_string()))
        .collect();
    assert_eq!(got, want);
    assert_eq!(combine(&shares, 3).unwrap(), secret);
}

#[test]
fn shamir_all_m_of_n_subsets_reconstruct_and_m_minus_one_fails() {
    let secret = vec![0x00, 0xff, 0x01, 0xfe, 0x80, 0x7f, 0x42, 0x13];
    for n in (MIN_M as u8)..=(MAX_N as u8) {
        for m in (MIN_M as u8)..=n {
            let coeff_len = secret.len() * usize::from(m - 1);
            let coeffs: Vec<u8> = (0..coeff_len)
                .map(|i| ((i * 53 + 7) & 0xff) as u8)
                .collect();
            let shares = split_with_coeffs(&secret, n, m, &coeffs).unwrap();
            for group in subsets(&shares, usize::from(m)) {
                assert_eq!(combine(&group, usize::from(m)).unwrap(), secret);
            }
            assert_eq!(
                combine(&shares[..usize::from(m - 1)], usize::from(m)),
                Err(ShamirError::InsufficientShares)
            );
        }
    }
}

#[test]
fn shamir_order_extras_and_x_255_boundary() {
    let s0 = 0x5au8;
    let c1 = 0xa7u8;
    let share_at = |x: u8| Share {
        x,
        data: vec![s0 ^ gf_mul(c1, x)],
    };
    assert_eq!(combine(&[share_at(255), share_at(1)], 2).unwrap(), vec![s0]);
    let secret = vec![10, 20, 30, 40];
    let coeffs = vec![1, 2, 3, 4, 5, 6, 7, 8];
    let mut shares = split_with_coeffs(&secret, 5, 3, &coeffs).unwrap();
    shares.reverse();
    assert_eq!(combine(&shares, 3).unwrap(), secret);
}

#[test]
fn shamir_rejects_invalid_inputs_and_mutations() {
    let secret = vec![1, 2, 3, 4];
    let coeffs = vec![9, 8, 7, 6];
    assert_eq!(
        split_with_coeffs(&secret, 3, 1, &[]),
        Err(ShamirError::InvalidThreshold)
    );
    assert_eq!(
        split_with_coeffs(&secret, 3, 4, &[1; 12]),
        Err(ShamirError::InvalidThreshold)
    );
    assert_eq!(
        split_with_coeffs(&secret, 8, 2, &coeffs),
        Err(ShamirError::InvalidThreshold)
    );
    assert_eq!(
        split_with_coeffs(&[], 3, 2, &[]),
        Err(ShamirError::EmptySecret)
    );
    assert_eq!(
        split_with_coeffs(&secret, 3, 2, &[1, 2]),
        Err(ShamirError::InvalidCoeffLength)
    );

    let valid = split_with_coeffs(&secret, 3, 2, &coeffs).unwrap();
    assert_eq!(combine(&valid, 1), Err(ShamirError::InvalidThreshold));
    assert_eq!(combine(&valid, 8), Err(ShamirError::InvalidThreshold));
    assert_eq!(
        combine(&[valid[0].clone(), valid[0].clone()], 2),
        Err(ShamirError::DuplicateShareX)
    );
    assert_eq!(
        combine(
            &[
                valid[0].clone(),
                Share {
                    x: 0,
                    data: vec![1, 2, 3, 4]
                }
            ],
            2
        ),
        Err(ShamirError::InvalidShareX)
    );
    assert_eq!(
        combine(
            &[
                valid[0].clone(),
                Share {
                    x: 2,
                    data: vec![1, 2]
                }
            ],
            2
        ),
        Err(ShamirError::MismatchedShareLength)
    );
    assert_eq!(
        combine(
            &[
                Share {
                    x: 1,
                    data: Vec::new()
                },
                Share {
                    x: 2,
                    data: Vec::new()
                }
            ],
            2
        ),
        Err(ShamirError::MismatchedShareLength)
    );
}
