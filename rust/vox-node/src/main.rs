#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Scaffold binary for `vox-node` (ADR-039 Phase 4, PR4.1a).
//!
//! Exposes a minimal zero-external-dependency CLI (`--help`, `--version`,
//! `--health-json` / `--check`) consuming [`vox_core::genesis_guard`].

use std::env;
use std::process::ExitCode;

use vox_core::genesis_data::GENESIS_MS;
use vox_core::genesis_guard;

const PKG_NAME: &str = env!("CARGO_PKG_NAME");
const PKG_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Parsed CLI command for the PR4.1a scaffold.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Command {
    Help,
    Version,
    HealthJson,
}

fn usage_text() -> String {
    format!(
        "{PKG_NAME} {PKG_VERSION} — Vox unified node scaffold (ADR-039 PR4.1a)\n\
         \n\
         USAGE:\n\
         \t{PKG_NAME} [OPTIONS]\n\
         \n\
         OPTIONS:\n\
         \t-h, --help           Show this help message\n\
         \t-V, --version        Show version information\n\
         \t    --health-json    Emit JSON health report using vox_core::genesis_guard\n\
         \t    --check          Alias for --health-json\n"
    )
}

fn parse_args<I>(args: I) -> Result<Command, String>
where
    I: IntoIterator<Item = String>,
{
    let mut iter = args.into_iter();
    let _program = iter.next();
    let Some(first) = iter.next() else {
        return Ok(Command::Help);
    };
    if iter.next().is_some() {
        return Err("too many arguments (expected at most one flag)".to_string());
    }
    match first.as_str() {
        "-h" | "--help" => Ok(Command::Help),
        "-V" | "--version" => Ok(Command::Version),
        "--health-json" | "--check" | "health-json" | "check" => Ok(Command::HealthJson),
        other => Err(format!("unknown argument: {other}")),
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

fn run<I>(args: I) -> Result<String, (u8, String)>
where
    I: IntoIterator<Item = String>,
{
    match parse_args(args) {
        Ok(Command::Help) => Ok(usage_text()),
        Ok(Command::Version) => Ok(format!("{PKG_NAME} {PKG_VERSION}\n")),
        Ok(Command::HealthJson) => render_health_json()
            .map(|json| format!("{json}\n"))
            .map_err(|err| (1, err.to_string())),
        Err(msg) => Err((2, format!("{msg}\n\n{}", usage_text()))),
    }
}

fn main() -> ExitCode {
    match run(env::args()) {
        Ok(out) => {
            print!("{out}");
            ExitCode::SUCCESS
        }
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
    }

    #[test]
    fn rejects_unknown_or_extra_arguments() {
        assert!(parse_args(args(&["vox-node", "--unknown"])).is_err());
        assert!(parse_args(args(&["vox-node", "--version", "--help"])).is_err());
    }

    #[test]
    fn health_json_reports_ok_and_genesis_ms() {
        let out = run(args(&["vox-node", "--health-json"])).expect("health json should succeed");
        let trimmed = out.trim();
        assert!(trimmed.starts_with('{') && trimmed.ends_with('}'));
        assert!(trimmed.contains("\"status\":\"ok\""));
        assert!(trimmed.contains("\"service\":\"vox-node\""));
        assert!(trimmed.contains(&format!("\"genesis_ms\":{GENESIS_MS}")));
        assert!(trimmed.contains("\"genesis_guard\":\"ok\""));
    }

    #[test]
    fn version_and_help_outputs_are_populated() {
        let version = run(args(&["vox-node", "--version"])).expect("version output");
        assert_eq!(version.trim(), format!("vox-node {PKG_VERSION}"));

        let help = run(args(&["vox-node", "--help"])).expect("help output");
        assert!(help.contains("--health-json"));
        assert!(help.contains("--check"));
    }
}
