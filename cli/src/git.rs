use anyhow::{bail, Context, Result};
use std::process::Command;

pub fn run(args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(args)
        .output()
        .context("git is not installed or not on PATH")?;
    if !output.status.success() {
        bail!("git {} failed: {}", args.join(" "), String::from_utf8_lossy(&output.stderr).trim());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// owner/repo from the origin remote, when it points at GitHub.
pub fn detect_repo() -> Option<String> {
    let url = run(&["config", "--get", "remote.origin.url"]).ok()?;
    let marker = "github.com";
    let index = url.find(marker)?;
    let rest = url[index + marker.len()..].trim_start_matches([':', '/']);
    let repo = rest.strip_suffix(".git").unwrap_or(rest).trim_end_matches('/');
    (repo.split('/').count() == 2).then(|| repo.to_string())
}

pub fn current_branch() -> Result<String> {
    run(&["rev-parse", "--abbrev-ref", "HEAD"])
}

pub fn is_dirty() -> bool {
    run(&["status", "--porcelain"]).map(|out| !out.is_empty()).unwrap_or(false)
}

/// Local file paths matching a mask, used to seed the language table.
pub fn files_matching(mask: &str, source: &str) -> Vec<String> {
    let normalized = mask.replace("{language}", "*").replace("%language%", "*");
    let (prefix, suffix) = normalized.split_once('*').unwrap_or((normalized.as_str(), ""));
    let directory = prefix.rsplit_once('/').map(|(dir, _)| dir.to_string()).unwrap_or_else(|| ".".into());
    let base = prefix.rsplit('/').next().unwrap_or("").to_string();
    let mut found = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&directory) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with(&base) || !name.ends_with(suffix) {
                continue;
            }
            let code = &name[base.len()..name.len().saturating_sub(suffix.len())];
            if !code.is_empty() && code != source {
                found.push(code.to_string());
            }
        }
    }
    found.sort();
    found
}
