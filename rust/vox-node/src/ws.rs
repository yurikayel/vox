//! WebSocket RFC 6455 framing and fragmented message assembly.

use std::io::{self, Read};
use std::net::TcpStream;
use std::time::Duration;

/// Maximum payload size of a single WebSocket frame (1 MiB).
pub const MAX_WS_FRAME_SIZE: usize = 1024 * 1024;
/// Maximum size of a reassembled fragmented WebSocket message (1 MiB).
pub const MAX_WS_MESSAGE_SIZE: usize = MAX_WS_FRAME_SIZE;
/// Maximum payload length for control frames (RFC 6455 §5.5).
pub const MAX_CONTROL_PAYLOAD: usize = 125;
/// Default timeout for receiving the remainder of a frame after its 2-byte header.
pub const DEFAULT_FRAME_TIMEOUT: Duration = Duration::from_secs(30);

/// WebSocket opcode constants.
pub const OP_CONT: u8 = 0x0;
/// Text data frame opcode.
pub const OP_TEXT: u8 = 0x1;
/// Binary data frame opcode.
pub const OP_BINARY: u8 = 0x2;
/// Close control frame opcode.
pub const OP_CLOSE: u8 = 0x8;
/// Ping control frame opcode.
pub const OP_PING: u8 = 0x9;
/// Pong control frame opcode.
pub const OP_PONG: u8 = 0xA;

/// A single decoded WebSocket frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WsFrame {
    /// Final fragment flag (`FIN`).
    pub fin: bool,
    /// 4-bit opcode.
    pub opcode: u8,
    /// Unmasked payload bytes.
    pub payload: Vec<u8>,
}

/// Returns `true` if `opcode` is a WebSocket control opcode (`0x8`, `0x9`, `0xA`).
pub fn is_control_opcode(opcode: u8) -> bool {
    matches!(opcode, OP_CLOSE | OP_PING | OP_PONG)
}

/// Returns `true` if `opcode` is a WebSocket data opcode (`0x0`, `0x1`, `0x2`).
pub fn is_data_opcode(opcode: u8) -> bool {
    matches!(opcode, OP_CONT | OP_TEXT | OP_BINARY)
}

/// Builds an unmasked server-to-client WebSocket frame with `FIN=1`.
pub fn make_frame(payload: &[u8], opcode: u8) -> Vec<u8> {
    let first = 0x80 | (opcode & 0x0F);
    let len = payload.len();
    let mut out = Vec::with_capacity(len + 10);
    out.push(first);
    if len < 126 {
        out.push(len as u8);
    } else if len <= 0xFFFF {
        out.push(126);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(127);
        out.extend_from_slice(&(len as u64).to_be_bytes());
    }
    out.extend_from_slice(payload);
    out
}

/// Builds a masked client-to-server WebSocket frame (useful for integration tests).
pub fn make_masked_frame(payload: &[u8], opcode: u8, fin: bool, mask: [u8; 4]) -> Vec<u8> {
    let first = (if fin { 0x80 } else { 0x00 }) | (opcode & 0x0F);
    let len = payload.len();
    let mut out = Vec::with_capacity(len + 14);
    out.push(first);
    if len < 126 {
        out.push(0x80 | (len as u8));
    } else if len <= 0xFFFF {
        out.push(0x80 | 126);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(0x80 | 127);
        out.extend_from_slice(&(len as u64).to_be_bytes());
    }
    out.extend_from_slice(&mask);
    for (i, &b) in payload.iter().enumerate() {
        out.push(b ^ mask[i & 3]);
    }
    out
}

/// Reads a single WebSocket frame from `stream`.
///
/// Waiting for the initial 2-byte header has no timeout (idle registered peers stay open);
/// once the header arrives, the remainder must arrive within `frame_timeout`.
pub fn read_frame(stream: &mut TcpStream, frame_timeout: Duration) -> io::Result<Option<WsFrame>> {
    let mut header = [0u8; 2];
    if !read_exact_or_eof(stream, &mut header)? {
        return Ok(None);
    }
    let prev_timeout = stream.read_timeout().ok().flatten();
    stream.set_read_timeout(Some(frame_timeout))?;
    let body_res = read_frame_body(stream, header[1]);
    let _ = stream.set_read_timeout(prev_timeout);

    let Some(payload) = body_res? else {
        return Ok(None);
    };
    Ok(Some(WsFrame {
        fin: (header[0] & 0x80) != 0,
        opcode: header[0] & 0x0F,
        payload,
    }))
}

fn read_frame_body(stream: &mut TcpStream, second_byte: u8) -> io::Result<Option<Vec<u8>>> {
    let Some(length) = read_payload_length(stream, second_byte & 0x7F)? else {
        return Ok(None);
    };
    let is_masked = (second_byte & 0x80) != 0;
    let mask_key = if is_masked {
        let mut key = [0u8; 4];
        if !read_exact_or_eof(stream, &mut key)? {
            return Ok(None);
        }
        Some(key)
    } else {
        None
    };
    let mut payload = vec![0u8; length];
    if length > 0 && !read_exact_or_eof(stream, &mut payload)? {
        return Ok(None);
    }
    if let Some(key) = mask_key {
        for (i, b) in payload.iter_mut().enumerate() {
            *b ^= key[i & 3];
        }
    }
    Ok(Some(payload))
}

fn read_payload_length(stream: &mut TcpStream, code: u8) -> io::Result<Option<usize>> {
    let length: u64 = match code {
        126 => {
            let mut ext = [0u8; 2];
            if !read_exact_or_eof(stream, &mut ext)? {
                return Ok(None);
            }
            u64::from(u16::from_be_bytes(ext))
        }
        127 => {
            let mut ext = [0u8; 8];
            if !read_exact_or_eof(stream, &mut ext)? {
                return Ok(None);
            }
            u64::from_be_bytes(ext)
        }
        n => u64::from(n),
    };
    if length > MAX_WS_FRAME_SIZE as u64 {
        return Ok(None);
    }
    Ok(Some(length as usize))
}

fn read_exact_or_eof(stream: &mut TcpStream, buf: &mut [u8]) -> io::Result<bool> {
    let mut filled = 0;
    while filled < buf.len() {
        match stream.read(&mut buf[filled..]) {
            Ok(0) => return Ok(false),
            Ok(n) => filled += n,
            Err(err) if err.kind() == io::ErrorKind::Interrupted => continue,
            Err(err) => return Err(err),
        }
    }
    Ok(true)
}

/// Reassembles fragmented WebSocket data messages (RFC 6455 §5.4).
pub struct MessageAssembler {
    max_size: usize,
    opcode: Option<u8>,
    parts: Vec<u8>,
}

impl MessageAssembler {
    /// Creates an assembler enforcing `max_size` across all fragments.
    pub fn new(max_size: usize) -> Self {
        Self {
            max_size,
            opcode: None,
            parts: Vec::new(),
        }
    }

    /// Feeds a data frame; returns `Ok(Some((opcode, payload)))` when `fin` completes a message.
    pub fn feed(
        &mut self,
        fin: bool,
        opcode: u8,
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, &'static str> {
        if opcode == OP_CONT && self.opcode.is_none() {
            return Err("continuation without open message");
        }
        if opcode != OP_CONT && self.opcode.is_some() {
            return Err("new data message before previous finished");
        }
        if opcode != OP_CONT {
            self.opcode = Some(opcode);
        }
        if self.parts.len().saturating_add(payload.len()) > self.max_size {
            return Err("reassembled message exceeds max size");
        }
        self.parts.extend_from_slice(payload);
        if !fin {
            return Ok(None);
        }
        let done_op = self.opcode.take().unwrap_or(OP_TEXT);
        let done_bytes = std::mem::take(&mut self.parts);
        Ok(Some((done_op, done_bytes)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assembler_reassembles_three_fragments_and_enforces_rules() {
        let mut a = MessageAssembler::new(MAX_WS_MESSAGE_SIZE);
        assert_eq!(a.feed(false, OP_TEXT, br#"{"a""#), Ok(None));
        assert_eq!(a.feed(false, OP_CONT, b":"), Ok(None));
        assert_eq!(
            a.feed(true, OP_CONT, b"1}"),
            Ok(Some((OP_TEXT, br#"{"a":1}"#.to_vec())))
        );
        assert_eq!(
            a.feed(true, OP_TEXT, b"x"),
            Ok(Some((OP_TEXT, b"x".to_vec())))
        );
        assert!(a.feed(true, OP_CONT, b"orphan").is_err());
    }

    #[test]
    fn assembler_rejects_oversized_fragments() {
        let mut a = MessageAssembler::new(8);
        assert_eq!(a.feed(false, OP_TEXT, b"12345"), Ok(None));
        assert!(a.feed(true, OP_CONT, b"6789").is_err());
    }
}
