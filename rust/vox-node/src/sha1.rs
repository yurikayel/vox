//! Pure-Rust SHA-1 (RFC 3174) and Base64 (RFC 4648) for RFC 6455 WebSocket handshakes.
//!
//! Used exclusively to derive `Sec-WebSocket-Accept` as mandated by RFC 6455 §1.3.

const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const B64_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Computes the RFC 6455 `Sec-WebSocket-Accept` header value from a client key.
pub fn compute_accept_key(sec_key: &str) -> String {
    let mut input = Vec::with_capacity(sec_key.len() + WS_GUID.len());
    input.extend_from_slice(sec_key.trim().as_bytes());
    input.extend_from_slice(WS_GUID.as_bytes());
    base64_encode(&sha1_digest(&input))
}

/// Computes a 20-byte SHA-1 digest (RFC 3174).
pub fn sha1_digest(data: &[u8]) -> [u8; 20] {
    let mut state: [u32; 5] = [
        0x6745_2301,
        0xEFCD_AB89,
        0x98BA_DCFE,
        0x1032_5476,
        0xC3D2_E1F0,
    ];
    let padded = pad_message(data);
    for chunk in padded.chunks_exact(64) {
        compress_block(&mut state, chunk);
    }
    let mut out = [0u8; 20];
    for (i, word) in state.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

fn pad_message(data: &[u8]) -> Vec<u8> {
    let bit_len = (data.len() as u64).wrapping_mul(8);
    let mut buf = Vec::with_capacity(data.len() + 72);
    buf.extend_from_slice(data);
    buf.push(0x80);
    while (buf.len() % 64) != 56 {
        buf.push(0);
    }
    buf.extend_from_slice(&bit_len.to_be_bytes());
    buf
}

fn expand_schedule(block: &[u8]) -> [u32; 80] {
    let mut w = [0u32; 80];
    for (i, slot) in w.iter_mut().enumerate().take(16) {
        let base = i * 4;
        *slot = u32::from_be_bytes([
            block[base],
            block[base + 1],
            block[base + 2],
            block[base + 3],
        ]);
    }
    for i in 16..80 {
        w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
    }
    w
}

fn round_fn(i: usize, b: u32, c: u32, d: u32) -> (u32, u32) {
    match i {
        0..=19 => ((b & c) | ((!b) & d), 0x5A82_7999),
        20..=39 => (b ^ c ^ d, 0x6ED9_EBA1),
        40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1B_BCDC),
        _ => (b ^ c ^ d, 0xCA62_C1D6),
    }
}

fn compress_block(state: &mut [u32; 5], block: &[u8]) {
    let w = expand_schedule(block);
    let [mut a, mut b, mut c, mut d, mut e] = *state;
    for (i, &word) in w.iter().enumerate() {
        let (f, k) = round_fn(i, b, c, d);
        let temp = a
            .rotate_left(5)
            .wrapping_add(f)
            .wrapping_add(e)
            .wrapping_add(k)
            .wrapping_add(word);
        e = d;
        d = c;
        c = b.rotate_left(30);
        b = a;
        a = temp;
    }
    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
}

/// Encodes bytes using standard Base64 with `=` padding (RFC 4648 §4).
pub fn base64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = if chunk.len() > 1 {
            u32::from(chunk[1])
        } else {
            0
        };
        let b2 = if chunk.len() > 2 {
            u32::from(chunk[2])
        } else {
            0
        };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64_TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(B64_TABLE[((triple >> 12) & 0x3F) as usize] as char);
        out.push(if chunk.len() > 1 {
            B64_TABLE[((triple >> 6) & 0x3F) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            B64_TABLE[(triple & 0x3F) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc6455_example_accept_key_matches() {
        // RFC 6455 Section 1.3 canonical test vector
        assert_eq!(
            compute_accept_key("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        );
    }

    #[test]
    fn sha1_matches_known_vectors() {
        let empty = sha1_digest(b"");
        let hex: String = empty.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "da39a3ee5e6b4b0d3255bfef95601890afd80709");

        let abc = sha1_digest(b"abc");
        let hex_abc: String = abc.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex_abc, "a9993e364706816aba3e25717850c26c9cd0d89d");
    }
}
