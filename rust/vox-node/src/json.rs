//! Minimal zero-dependency JSON parser and serializer for signaling messages.

const MAX_JSON_DEPTH: usize = 32;

/// Owned JSON value representation preserving object fields for passthrough forwarding.
#[derive(Debug, Clone, PartialEq)]
pub enum JsonValue {
    /// JSON `null`.
    Null,
    /// JSON boolean (`true` / `false`).
    Bool(bool),
    /// JSON numeric literal stored verbatim.
    Number(String),
    /// JSON string.
    String(String),
    /// JSON array.
    Array(Vec<JsonValue>),
    /// JSON object preserving insertion order.
    Object(Vec<(String, JsonValue)>),
}

impl JsonValue {
    /// Parses a JSON document from a UTF-8 string.
    pub fn parse(input: &str) -> Result<Self, &'static str> {
        let mut parser = Parser::new(input);
        let value = parser.parse_value(0)?;
        parser.skip_ws();
        if parser.pos != parser.bytes.len() {
            return Err("trailing characters after JSON value");
        }
        Ok(value)
    }

    /// Returns a field value if `self` is an object.
    pub fn get(&self, key: &str) -> Option<&JsonValue> {
        let JsonValue::Object(entries) = self else {
            return None;
        };
        entries.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    /// Returns the string slice if `self` is a `JsonValue::String`.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsonValue::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Inserts or overwrites a field on a `JsonValue::Object`.
    pub fn set_field(&mut self, key: &str, value: JsonValue) {
        let JsonValue::Object(entries) = self else {
            return;
        };
        if let Some((_, existing)) = entries.iter_mut().find(|(k, _)| k == key) {
            *existing = value;
        } else {
            entries.push((key.to_string(), value));
        }
    }

    /// Serializes this value to a compact JSON string.
    pub fn to_json_string(&self) -> String {
        let mut out = String::new();
        self.write_to(&mut out);
        out
    }

    fn write_to(&self, out: &mut String) {
        match self {
            JsonValue::Null => out.push_str("null"),
            JsonValue::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            JsonValue::Number(n) => out.push_str(n),
            JsonValue::String(s) => write_escaped_str(s, out),
            JsonValue::Array(items) => write_array(items, out),
            JsonValue::Object(entries) => write_object(entries, out),
        }
    }
}

fn write_array(items: &[JsonValue], out: &mut String) {
    out.push('[');
    for (idx, item) in items.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        item.write_to(out);
    }
    out.push(']');
}

fn write_object(entries: &[(String, JsonValue)], out: &mut String) {
    out.push('{');
    for (idx, (k, v)) in entries.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        write_escaped_str(k, out);
        out.push(':');
        v.write_to(out);
    }
    out.push('}');
}

/// Escapes and quotes a Rust string as a JSON string literal.
pub fn write_escaped_str(input: &str, out: &mut String) {
    out.push('"');
    for ch in input.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\x08' => out.push_str("\\b"),
            '\x0C' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

struct Parser<'a> {
    src: &'a str,
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src,
            bytes: src.as_bytes(),
            pos: 0,
        }
    }

    fn skip_ws(&mut self) {
        while let Some(&b) = self.bytes.get(self.pos) {
            if matches!(b, b' ' | b'\t' | b'\r' | b'\n') {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn parse_value(&mut self, depth: usize) -> Result<JsonValue, &'static str> {
        if depth > MAX_JSON_DEPTH {
            return Err("JSON nesting too deep");
        }
        self.skip_ws();
        match self.peek().ok_or("unexpected end of JSON")? {
            b'"' => self.parse_string().map(JsonValue::String),
            b'{' => self.parse_object(depth + 1),
            b'[' => self.parse_array(depth + 1),
            b't' => self.consume_lit(b"true").map(|()| JsonValue::Bool(true)),
            b'f' => self.consume_lit(b"false").map(|()| JsonValue::Bool(false)),
            b'n' => self.consume_lit(b"null").map(|()| JsonValue::Null),
            b'-' | b'0'..=b'9' => self.parse_number(),
            _ => Err("unexpected token in JSON"),
        }
    }

    fn consume_lit(&mut self, lit: &[u8]) -> Result<(), &'static str> {
        if self.bytes.get(self.pos..self.pos + lit.len()) == Some(lit) {
            self.pos += lit.len();
            Ok(())
        } else {
            Err("invalid JSON literal")
        }
    }

    fn parse_number(&mut self) -> Result<JsonValue, &'static str> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        let digit_start = self.pos;
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
        if self.pos == digit_start {
            return Err("invalid JSON number");
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            let frac_start = self.pos;
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
            if self.pos == frac_start {
                return Err("invalid JSON fraction");
            }
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            let exp_start = self.pos;
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
            if self.pos == exp_start {
                return Err("invalid JSON exponent");
            }
        }
        Ok(JsonValue::Number(self.src[start..self.pos].to_string()))
    }

    fn parse_string(&mut self) -> Result<String, &'static str> {
        if self.peek() != Some(b'"') {
            return Err("expected quote");
        }
        self.pos += 1;
        let mut out = String::new();
        while self.pos < self.bytes.len() {
            let rest = &self.src[self.pos..];
            let ch = rest.chars().next().ok_or("unterminated string")?;
            self.pos += ch.len_utf8();
            match ch {
                '"' => return Ok(out),
                '\\' => out.push(self.parse_escape()?),
                c if (c as u32) < 0x20 => return Err("unescaped control char in string"),
                c => out.push(c),
            }
        }
        Err("unterminated JSON string")
    }

    fn parse_escape(&mut self) -> Result<char, &'static str> {
        let b = self.peek().ok_or("unterminated escape")?;
        self.pos += 1;
        match b {
            b'"' => Ok('"'),
            b'\\' => Ok('\\'),
            b'/' => Ok('/'),
            b'b' => Ok('\x08'),
            b'f' => Ok('\x0C'),
            b'n' => Ok('\n'),
            b'r' => Ok('\r'),
            b't' => Ok('\t'),
            b'u' => self.parse_unicode_escape(),
            _ => Err("invalid escape sequence"),
        }
    }

    fn parse_hex4(&mut self) -> Result<u16, &'static str> {
        let slice = self
            .src
            .get(self.pos..self.pos + 4)
            .ok_or("short unicode escape")?;
        self.pos += 4;
        u16::from_str_radix(slice, 16).map_err(|_| "invalid hex in unicode escape")
    }

    fn parse_unicode_escape(&mut self) -> Result<char, &'static str> {
        let first = self.parse_hex4()?;
        if (0xD800..=0xDBFF).contains(&first) {
            if self.bytes.get(self.pos..self.pos + 2) != Some(b"\\u") {
                return Err("missing low surrogate");
            }
            self.pos += 2;
            let second = self.parse_hex4()?;
            if !(0xDC00..=0xDFFF).contains(&second) {
                return Err("invalid low surrogate");
            }
            let cp = 0x10000 + ((u32::from(first - 0xD800) << 10) | u32::from(second - 0xDC00));
            return char::from_u32(cp).ok_or("invalid surrogate pair");
        }
        char::from_u32(u32::from(first)).ok_or("invalid unicode codepoint")
    }

    fn parse_array(&mut self, depth: usize) -> Result<JsonValue, &'static str> {
        self.pos += 1;
        self.skip_ws();
        let mut items = Vec::new();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(JsonValue::Array(items));
        }
        loop {
            items.push(self.parse_value(depth)?);
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    return Ok(JsonValue::Array(items));
                }
                _ => return Err("expected ',' or ']' in array"),
            }
        }
    }

    fn parse_object(&mut self, depth: usize) -> Result<JsonValue, &'static str> {
        self.pos += 1;
        self.skip_ws();
        let mut entries = Vec::new();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(JsonValue::Object(entries));
        }
        loop {
            self.skip_ws();
            let key = self.parse_string()?;
            self.skip_ws();
            if self.peek() != Some(b':') {
                return Err("expected ':' in object");
            }
            self.pos += 1;
            let val = self.parse_value(depth)?;
            entries.push((key, val));
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(JsonValue::Object(entries));
                }
                _ => return Err("expected ',' or '}' in object"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_roundtrips_signaling_payload() {
        let raw = r#"{"type":"offer","to":"p2","from":"forged","seq":3,"sdp":{"type":"offer","sdp":"v=0\r\n"}}"#;
        let mut val = JsonValue::parse(raw).expect("valid json");
        assert_eq!(val.get("type").and_then(JsonValue::as_str), Some("offer"));
        val.set_field("from", JsonValue::String("p1".to_string()));
        let out = val.to_json_string();
        assert!(out.contains("\"from\":\"p1\""));
        assert!(!out.contains("forged"));
    }

    #[test]
    fn rejects_invalid_or_deeply_nested_json() {
        assert!(JsonValue::parse("{invalid").is_err());
        let deep = format!("{}{}", "[".repeat(40), "]".repeat(40));
        assert!(JsonValue::parse(&deep).is_err());
    }
}
