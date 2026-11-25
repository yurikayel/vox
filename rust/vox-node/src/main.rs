#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Binary entry point for `vox-node` (ADR-039 Phase 4, PR4.3).
//!
//! Supports `--help`, `--version`, `--health-json` / `--check`,
//! `--mode signaling [--host <addr>] [--port <port>]`,
//! `--mode relay [--host <addr>] [--port <port>] [--data-dir <dir>]`, and
//! `--mode memoria [--host <addr>] [--port <port>] [--data-dir <dir>]`.

use std::env;
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use vox_core::genesis_data::GENESIS_MS;
use vox_core::genesis_guard;
use vox_node::memoria::{MemoriaConfig, MemoriaServer};
use vox_node::relay::{RelayConfig, RelayServer};
use vox_node::signaling::{SignalingConfig, SignalingServer};

const PKG_NAME: &str = env!("CARGO_PKG_NAME");
const PKG_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, PartialEq, Eq)]
enum Command {
    Help,
    Version,
    HealthJson,
    Signaling {
        host: Option<String>,
        port: Option<u16>,
    },
    Relay {
        host: Option<String>,
        port: Option<u16>,
        data_dir: Option<PathBuf>,
    },
    Memoria {
        host: Option<String>,
        port: Option<u16>,
        data_dir: Option<PathBuf>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ServerMode {
    Signaling,
    Relay,
    Memoria,
}

fn usage_text() -> String {
    format!(
        "{PKG_NAME} {PKG_VERSION} — Vox unified node (ADR-039 PR4.3)\n\
         \n\
         USAGE:\n\
         \t{PKG_NAME} [OPTIONS]\n\
         \t{PKG_NAME} --mode signaling [--host <ADDR>] [--port <PORT>]\n\
         \t{PKG_NAME} --mode relay [--host <ADDR>] [--port <PORT>] [--data-dir <DIR>]\n\
         \t{PKG_NAME} --mode memoria [--host <ADDR>] [--port <PORT>] [--data-dir <DIR>]\n\
         \n\
         OPTIONS:\n\
         \t-h, --help                 Show this help message\n\
         \t-V, --version              Show version information\n\
         \t    --health-json          Emit JSON health report using vox_core::genesis_guard\n\
         \t    --check                Alias for --health-json\n\
         \t    --mode signaling       Run WebSocket signaling + HTTP health server\n\
         \t    --mode relay           Run HTTP relay server (/health, /status, /ping, /version, /inbox/*)\n\
         \t    --mode memoria         Run local Vox Memoria dashboard, memory store & control server\n\
         \t    --host <ADDR>          Bind host (signaling: 0.0.0.0; relay/memoria: 127.0.0.1)\n\
         \t    --port <PORT>          Bind port (signaling: 3921; relay: 3920; memoria: 3922; 0 = ephemeral)\n\
         \t    --data-dir <DIR>       Base persistence directory for relay/memoria modes\n"
    )
}

fn parse_args<I>(args: I) -> Result<Command, String>
where
    I: IntoIterator<Item = String>,
{
    let items: Vec<String> = args.into_iter().skip(1).collect();
    let Some(first) = items.first().map(String::as_str) else {
        return Ok(Command::Help);
    };
    if items.len() == 1 {
        return parse_single_arg(first);
    }
    parse_mode_args(&items)
}

fn parse_single_arg(arg: &str) -> Result<Command, String> {
    match arg {
        "-h" | "--help" => Ok(Command::Help),
        "-V" | "--version" => Ok(Command::Version),
        "--health-json" | "--check" | "health-json" | "check" => Ok(Command::HealthJson),
        "signaling" => Ok(Command::Signaling {
            host: None,
            port: None,
        }),
        "relay" => Ok(Command::Relay {
            host: None,
            port: None,
            data_dir: None,
        }),
        "memoria" => Ok(Command::Memoria {
            host: None,
            port: None,
            data_dir: None,
        }),
        other => Err(format!("unknown argument: {other}")),
    }
}

fn parse_mode_value(raw: &str) -> Result<ServerMode, String> {
    match raw {
        "signaling" => Ok(ServerMode::Signaling),
        "relay" => Ok(ServerMode::Relay),
        "memoria" => Ok(ServerMode::Memoria),
        other => Err(format!("unsupported mode: {other}")),
    }
}

fn parse_mode_args(items: &[String]) -> Result<Command, String> {
    let mut mode: Option<ServerMode> = None;
    let mut host = None;
    let mut port = None;
    let mut data_dir = None;
    let mut idx = 0;

    while idx < items.len() {
        match items[idx].as_str() {
            "signaling" => mode = Some(ServerMode::Signaling),
            "relay" => mode = Some(ServerMode::Relay),
            "memoria" => mode = Some(ServerMode::Memoria),
            "--mode" => {
                idx += 1;
                let raw = items.get(idx).ok_or("missing value for --mode")?;
                mode = Some(parse_mode_value(raw)?);
            }
            "--host" => {
                idx += 1;
                host = Some(items.get(idx).ok_or("missing value for --host")?.clone());
            }
            "--port" => {
                idx += 1;
                let raw = items.get(idx).ok_or("missing value for --port")?;
                let parsed = raw
                    .parse::<u16>()
                    .map_err(|_| format!("invalid port value: {raw}"))?;
                port = Some(parsed);
            }
            "--data-dir" => {
                idx += 1;
                let raw = items.get(idx).ok_or("missing value for --data-dir")?;
                data_dir = Some(PathBuf::from(raw));
            }
            other => return Err(format!("unknown argument: {other}")),
        }
        idx += 1;
    }

    build_mode_command(mode, host, port, data_dir)
}

fn build_mode_command(
    mode: Option<ServerMode>,
    host: Option<String>,
    port: Option<u16>,
    data_dir: Option<PathBuf>,
) -> Result<Command, String> {
    match mode {
        Some(ServerMode::Signaling) if data_dir.is_some() => {
            Err("--data-dir is only supported in --mode relay|memoria".to_string())
        }
        Some(ServerMode::Signaling) => Ok(Command::Signaling { host, port }),
        Some(ServerMode::Relay) => Ok(Command::Relay {
            host,
            port,
            data_dir,
        }),
        Some(ServerMode::Memoria) => Ok(Command::Memoria {
            host,
            port,
            data_dir,
        }),
        None => Err(
            "too many arguments (expected --mode signaling|relay|memoria or a single flag)".into(),
        ),
    }
}

fn genesis_guard_ready() -> bool {
    genesis_guard::is_before_genesis_ms(GENESIS_MS - 1)
        && !genesis_guard::is_before_genesis_ms(GENESIS_MS)
        && genesis_guard::refuses_post(Some("vx_ana"), None)
        && !genesis_guard::refuses_post(None, Some(GENESIS_MS))
        && genesis_guard::refuses_profile_card(Some("vx_ana"))
}

fn render_health_json() -> Result<String, &'static str> {
    if !genesis_guard_ready() {
        return Err("genesis_guard self-check failed");
    }
    Ok(format!(
        "{{\"status\":\"ok\",\"service\":\"{PKG_NAME}\",\"version\":\"{PKG_VERSION}\",\"genesis_ms\":{GENESIS_MS},\"genesis_guard\":\"ok\"}}"
    ))
}

fn run_signaling(host: Option<String>, port: Option<u16>) -> Result<(), (u8, String)> {
    let config = SignalingConfig::from_env(host, port);
    let server = SignalingServer::bind(config)
        .map_err(|err| (1, format!("failed to bind signaling server: {err}")))?;
    let addr = server.local_addr();
    let _ = writeln!(io::stdout(), "PORT={}", addr.port());
    let _ = io::stdout().flush();
    eprintln!(
        "{PKG_NAME} {PKG_VERSION} signaling listening on ws://{}:{}", // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket — banner de bind local (loopback/LAN)
        addr.ip(),
        addr.port()
    );
    server.serve_forever();
    Ok(())
}

fn run_relay(
    host: Option<String>,
    port: Option<u16>,
    data_dir: Option<PathBuf>,
) -> Result<(), (u8, String)> {
    let config = RelayConfig::from_env(host, port, data_dir);
    let server = RelayServer::bind(config)
        .map_err(|err| (1, format!("failed to bind relay server: {err}")))?;
    let addr = server.local_addr();
    let _ = writeln!(io::stdout(), "PORT={}", addr.port());
    let _ = io::stdout().flush();
    eprintln!(
        "{PKG_NAME} {PKG_VERSION} relay listening on http://{}:{}",
        addr.ip(),
        addr.port()
    );
    server.serve_forever();
    Ok(())
}

fn run_memoria(
    host: Option<String>,
    port: Option<u16>,
    data_dir: Option<PathBuf>,
) -> Result<(), (u8, String)> {
    let config = MemoriaConfig::from_env(host, port, data_dir);
    let server = MemoriaServer::bind(config)
        .map_err(|err| (1, format!("failed to bind memoria server: {err}")))?;
    let addr = server.local_addr();
    let _ = writeln!(io::stdout(), "PORT={}", addr.port());
    let _ = io::stdout().flush();
    eprintln!(
        "{PKG_NAME} {PKG_VERSION} memoria listening on http://{}:{}",
        addr.ip(),
        addr.port()
    );
    server.serve_forever();
    Ok(())
}

fn run<I>(args: I) -> Result<Option<String>, (u8, String)>
where
    I: IntoIterator<Item = String>,
{
    match parse_args(args) {
        Ok(Command::Help) => Ok(Some(usage_text())),
        Ok(Command::Version) => Ok(Some(format!("{PKG_NAME} {PKG_VERSION}\n"))),
        Ok(Command::HealthJson) => render_health_json()
            .map(|json| Some(format!("{json}\n")))
            .map_err(|err| (1, err.to_string())),
        Ok(Command::Signaling { host, port }) => run_signaling(host, port).map(|()| None),
        Ok(Command::Relay {
            host,
            port,
            data_dir,
        }) => run_relay(host, port, data_dir).map(|()| None),
        Ok(Command::Memoria {
            host,
            port,
            data_dir,
        }) => run_memoria(host, port, data_dir).map(|()| None),
        Err(msg) => Err((2, format!("{msg}\n\n{}", usage_text()))),
    }
}

fn main() -> ExitCode {
    match run(env::args()) {
        Ok(Some(out)) => {
            print!("{out}");
            ExitCode::SUCCESS
        }
        Ok(None) => ExitCode::SUCCESS,
        Err((code, msg)) => {
            eprintln!("{msg}");
            ExitCode::from(code)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn parses_supported_flags_and_subcommands() {
        assert_eq!(parse_args(args(&["vox-node"])), Ok(Command::Help));
        assert_eq!(parse_args(args(&["vox-node", "-h"])), Ok(Command::Help));
        assert_eq!(parse_args(args(&["vox-node", "--help"])), Ok(Command::Help));
        assert_eq!(parse_args(args(&["vox-node", "-V"])), Ok(Command::Version));
        assert_eq!(
            parse_args(args(&["vox-node", "--version"])),
            Ok(Command::Version)
        );
        assert_eq!(
            parse_args(args(&["vox-node", "--health-json"])),
            Ok(Command::HealthJson)
        );
        assert_eq!(
            parse_args(args(&["vox-node", "--check"])),
            Ok(Command::HealthJson)
        );
        assert_eq!(
            parse_args(args(&[
                "vox-node",
                "--mode",
                "signaling",
                "--host",
                "127.0.0.1",
                "--port",
                "0"
            ])),
            Ok(Command::Signaling {
                host: Some("127.0.0.1".to_string()),
                port: Some(0)
            })
        );
        assert_eq!(
            parse_args(args(&[
                "vox-node",
                "--mode",
                "relay",
                "--host",
                "127.0.0.1",
                "--port",
                "0",
                "--data-dir",
                "/tmp/vox-relay"
            ])),
            Ok(Command::Relay {
                host: Some("127.0.0.1".to_string()),
                port: Some(0),
                data_dir: Some(PathBuf::from("/tmp/vox-relay")),
            })
        );
        assert_eq!(
            parse_args(args(&[
                "vox-node",
                "--mode",
                "memoria",
                "--host",
                "127.0.0.1",
                "--port",
                "3922",
                "--data-dir",
                "/tmp/vox-memoria"
            ])),
            Ok(Command::Memoria {
                host: Some("127.0.0.1".to_string()),
                port: Some(3922),
                data_dir: Some(PathBuf::from("/tmp/vox-memoria")),
            })
        );
    }

    #[test]
    fn rejects_unknown_or_extra_arguments() {
        assert!(parse_args(args(&["vox-node", "--unknown"])).is_err());
        assert!(parse_args(args(&["vox-node", "--version", "--help"])).is_err());
        assert!(parse_args(args(&["vox-node", "--mode", "invalid"])).is_err());
        assert!(parse_args(args(&[
            "vox-node",
            "--mode",
            "signaling",
            "--data-dir",
            "/tmp/x"
        ]))
        .is_err());
    }

    #[test]
    fn health_json_reports_ok_and_genesis_ms() {
        let out = run(args(&["vox-node", "--health-json"]))
            .expect("health json should succeed")
            .expect("output string");
        let trimmed = out.trim();
        assert!(trimmed.starts_with('{') && trimmed.ends_with('}'));
        assert!(trimmed.contains("\"status\":\"ok\""));
        assert!(trimmed.contains("\"service\":\"vox-node\""));
        assert!(trimmed.contains(&format!("\"genesis_ms\":{GENESIS_MS}")));
        assert!(trimmed.contains("\"genesis_guard\":\"ok\""));
    }

    #[test]
    fn version_and_help_outputs_are_populated() {
        let version = run(args(&["vox-node", "--version"]))
            .expect("version output")
            .expect("output string");
        assert_eq!(version.trim(), format!("vox-node {PKG_VERSION}"));

        let help = run(args(&["vox-node", "--help"]))
            .expect("help output")
            .expect("output string");
        assert!(help.contains("--health-json"));
        assert!(help.contains("--mode signaling"));
        assert!(help.contains("--mode relay"));
        assert!(help.contains("--mode memoria"));
    }
}
