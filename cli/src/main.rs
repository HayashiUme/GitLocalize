mod config;
mod git;
mod templates;
mod tui;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use config::{normalize_mask, Language, ProjectConfig};
use std::io::IsTerminal;

#[derive(Parser)]
#[command(name = "gitlocalize", version, about = "Deploy GitLocalize into an existing repository")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Configure a repository: writes .gitlocalize/config.json and the workflows
    Init {
        /// owner/repo (defaults to the origin remote)
        repo: Option<String>,
        /// Base branch that reviewed translations land on
        #[arg(long, default_value = "main")]
        branch: String,
        /// File mask with one language placeholder, e.g. "locales/app.*.yml"
        #[arg(long)]
        filemask: Option<String>,
        /// Source language file, e.g. "locales/app.en.yml"
        #[arg(long)]
        template: Option<String>,
        /// Source language code
        #[arg(long, default_value = "en")]
        source_language: String,
        /// Print the resolved configuration and exit
        #[arg(long)]
        print_config: bool,
        /// Never prompt; fail when required fields are missing
        #[arg(long)]
        yes: bool,
        /// Read answers from a JSON file
        #[arg(long)]
        config: Option<String>,
    },
    /// Check the local configuration and the branches it references
    Doctor {
        #[arg(long)]
        json: bool,
    },
    /// Publish the upstream editor build onto the pages branch
    PublishEditor {
        /// Branch receiving the build (defaults to pages.branch in the config)
        #[arg(long)]
        branch: Option<String>,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Init { repo, branch, filemask, template, source_language, print_config, yes, config } => {
            init(repo, branch, filemask, template, source_language, print_config, yes, config)
        }
        Command::Doctor { json } => doctor(json),
        Command::PublishEditor { branch } => publish_editor(branch),
    }
}

fn init(
    repo: Option<String>,
    branch: String,
    filemask: Option<String>,
    template: Option<String>,
    source_language: String,
    print_config: bool,
    yes: bool,
    config_path: Option<String>,
) -> Result<()> {
    let mut config = match config_path {
        Some(path) => {
            let raw = std::fs::read_to_string(&path).with_context(|| format!("cannot read {path}"))?;
            serde_json::from_str::<ProjectConfig>(&raw).with_context(|| format!("{path} is not a valid project config"))?
        }
        None => ProjectConfig::default(),
    };

    if let Some(repo) = repo {
        config.repo = repo;
    }
    if config.repo.is_empty() {
        config.repo = git::detect_repo().unwrap_or_default();
    }
    config.branch = branch;
    config.source_language = source_language;
    if let Some(mask) = filemask {
        config.filemask = mask;
    }
    if config.filemask.is_empty() {
        config.filemask = "locales/app.*.yml".into();
    }
    config.source_directory = config::directory_from_mask(&normalize_mask(&config.filemask));
    if let Some(template) = template {
        config.template = template;
    }
    if config.template.is_empty() {
        config.template = normalize_mask(&config.filemask).replace('*', &config.source_language);
    }
    if config.languages.is_empty() {
        config.languages = git::files_matching(&config.filemask, &config.source_language)
            .into_iter()
            .map(|code| Language { code, name: String::new() })
            .collect();
    }

    if print_config {
        config.validate()?;
        println!("{}", serde_json::to_string_pretty(&config)?);
        return Ok(());
    }

    let interactive = std::io::stdin().is_terminal() && std::io::stdout().is_terminal() && !yes;
    if interactive {
        let app = tui::App::new(config);
        return tui::run(app);
    }

    config.validate()?;
    std::fs::create_dir_all(".gitlocalize")?;
    std::fs::write(".gitlocalize/config.json", serde_json::to_string_pretty(&config)? + "\n")?;
    std::fs::create_dir_all(".github/workflows")?;
    let workflows = templates::workflows(&config);
    for (name, body) in &workflows {
        std::fs::write(format!(".github/workflows/{name}"), body)?;
    }
    println!("Wrote .gitlocalize/config.json");
    for (name, _) in &workflows {
        println!("Wrote .github/workflows/{name}");
    }
    println!("Editor: {}", config.editor_url());
    println!("\nNext:\n  git add .gitlocalize .github/workflows\n  git commit -m 'chore: set up GitLocalize'\n  git push origin {}", config.branch);
    Ok(())
}

fn doctor(json: bool) -> Result<()> {
    let path = ".gitlocalize/config.json";
    let mut findings: Vec<(bool, String)> = Vec::new();
    let config = match std::fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<ProjectConfig>(&raw) {
            Ok(config) => {
                findings.push((true, format!("{path} is valid")));
                Some(config)
            }
            Err(error) => {
                findings.push((false, format!("{path} cannot be parsed: {error}")));
                None
            }
        },
        Err(_) => {
            findings.push((false, format!("{path} is missing - run `gitlocalize init`")));
            None
        }
    };

    if let Some(config) = &config {
        match config.validate() {
            Ok(()) => findings.push((true, "configuration validates".into())),
            Err(error) => findings.push((false, format!("configuration invalid: {error}"))),
        }
        for (name, _) in templates::workflows(config) {
            let workflow_path = format!(".github/workflows/{name}");
            let exists = std::path::Path::new(&workflow_path).exists();
            findings.push((exists, format!("{workflow_path} {}", if exists { "present" } else { "missing" })));
        }
        if !config.push_branch.is_empty() {
            let remote = git::run(&["ls-remote", "--heads", "origin", &config.push_branch]);
            match remote {
                Ok(out) if out.is_empty() => findings.push((false, format!("remote branch {} does not exist yet", config.push_branch))),
                Ok(_) => findings.push((true, format!("remote branch {} exists", config.push_branch))),
                Err(error) => findings.push((false, format!("cannot inspect the remote: {error}"))),
            }
        }
    }
    findings.push((!git::is_dirty(), if git::is_dirty() { "working tree has uncommitted changes".into() } else { "working tree clean".into() }));

    if json {
        let items: Vec<serde_json::Value> = findings
            .iter()
            .map(|(ok, message)| serde_json::json!({ "ok": ok, "message": message }))
            .collect();
        println!("{}", serde_json::to_string_pretty(&items)?);
    } else {
        for (ok, message) in &findings {
            println!("{} {message}", if *ok { "ok  " } else { "FAIL" });
        }
    }
    if findings.iter().any(|(ok, _)| !ok) {
        bail!("doctor found problems");
    }
    Ok(())
}

fn publish_editor(branch: Option<String>) -> Result<()> {
    let config = std::fs::read_to_string(".gitlocalize/config.json")
        .ok()
        .and_then(|raw| serde_json::from_str::<ProjectConfig>(&raw).ok())
        .unwrap_or_default();
    let target = branch.unwrap_or(config.pages.branch);
    let repo = if config.repo.is_empty() { git::detect_repo().context("cannot detect the repository from the origin remote")? } else { config.repo.clone() };

    let temp = std::env::temp_dir().join(format!("gitlocalize-editor-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp)?;
    let temp_str = temp.to_string_lossy().to_string();

    let upstream = format!("https://github.com/{}.git", templates::UPSTREAM_REPO);
    git::run(&["clone", "--quiet", "--depth", "1", "--branch", "editor", &upstream, &temp_str])
        .context("cannot fetch the upstream editor branch")?;
    std::fs::remove_dir_all(temp.join(".git")).ok();
    std::fs::write(temp.join(".nojekyll"), b"")?;
    if !temp.join("index.html").exists() {
        bail!("the upstream editor branch has no index.html");
    }

    git::run(&["-C", &temp_str, "init", "-q"])?;
    git::run(&["-C", &temp_str, "config", "user.name", "github-actions[bot]"])?;
    git::run(&["-C", &temp_str, "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"])?;
    git::run(&["-C", &temp_str, "checkout", "-B", &target])?;
    git::run(&["-C", &temp_str, "add", "-A"])?;
    if git::run(&["-C", &temp_str, "diff", "--cached", "--quiet"]).is_ok() {
        println!("Nothing to publish: {target} already carries this build.");
        return Ok(());
    }
    git::run(&["-C", &temp_str, "commit", "-m", "chore: publish the editor build"])?;
    let push_url = format!("https://github.com/{repo}.git");
    git::run(&["-C", &temp_str, "push", "--force", &push_url, &target])?;
    println!("Published the editor to {target} ({repo}).");
    Ok(())
}
