use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

/// One target language. `code` is what appears in file names and PR text.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Language {
    pub code: String,
    #[serde(default)]
    pub name: String,
}

/// A file family, for projects that ship app strings and error strings separately.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Component {
    pub filemask: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_format: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct EditorConfig {
    #[serde(default)]
    pub remember_token: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub device_flow_client_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PagesConfig {
    /// branch | artifact | none
    pub mode: String,
    pub branch: String,
    pub version: String,
}

impl Default for PagesConfig {
    fn default() -> Self {
        Self { mode: "branch".into(), branch: "editor".into(), version: "latest".into() }
    }
}

/// The declarative project file, written to .gitlocalize/config.json.
/// Field names follow Weblate where the concept exists there.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectConfig {
    pub vcs: String,
    pub repo: String,
    pub branch: String,
    #[serde(default)]
    pub push_branch: String,
    pub file_format: String,
    pub filemask: String,
    #[serde(default)]
    pub template: String,
    pub source_language: String,
    pub source_directory: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub components: Vec<Component>,
    #[serde(default)]
    pub languages: Vec<Language>,
    pub commit_message: String,
    pub pull_message: String,
    pub create_merge_request: bool,
    #[serde(default)]
    pub editor: EditorConfig,
    #[serde(default)]
    pub pages: PagesConfig,
}

impl Default for ProjectConfig {
    fn default() -> Self {
        Self {
            vcs: "github".into(),
            repo: String::new(),
            branch: "main".into(),
            push_branch: "i18n".into(),
            file_format: "yaml".into(),
            filemask: String::new(),
            template: String::new(),
            source_language: "en".into(),
            source_directory: "locales".into(),
            components: Vec::new(),
            languages: Vec::new(),
            commit_message: "i18n(%language%): update translations".into(),
            pull_message: "i18n(%language%): update translations".into(),
            create_merge_request: true,
            editor: EditorConfig::default(),
            pages: PagesConfig::default(),
        }
    }
}

const PLACEHOLDERS: [&str; 3] = ["*", "{language}", "%language%"];

pub fn count_placeholders(mask: &str) -> usize {
    PLACEHOLDERS.iter().map(|p| mask.matches(p).count()).sum()
}

/// Weblate uses *, older GitLocalize configs used {language}; both are accepted.
pub fn normalize_mask(mask: &str) -> String {
    mask.replace("{language}", "*").replace("%language%", "*")
}

pub fn validate_mask(mask: &str) -> Option<String> {
    if mask.trim().is_empty() {
        return Some("the file mask is required".into());
    }
    match count_placeholders(mask) {
        0 => Some("the file mask must contain *, {language} or %language%".into()),
        1 => None,
        _ => Some("the file mask must contain exactly one language placeholder".into()),
    }
}

pub fn directory_from_mask(mask: &str) -> String {
    mask.rsplit_once('/').map(|(dir, _)| dir.to_string()).unwrap_or_else(|| ".".into())
}

/// All distinct directories referenced by the project, in declaration order.
pub fn directories(config: &ProjectConfig) -> Vec<String> {
    let mut masks = vec![config.filemask.clone()];
    masks.extend(config.components.iter().map(|c| c.filemask.clone()));
    let mut dirs: Vec<String> = Vec::new();
    for mask in masks.iter().filter(|m| !m.is_empty()) {
        let dir = directory_from_mask(&normalize_mask(mask));
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs
}

/// Extract the language code from a concrete path given its mask.
pub fn language_from_masked_path(path: &str, mask: &str) -> Option<String> {
    let normalized = normalize_mask(mask);
    let (prefix, suffix) = normalized.split_once('*')?;
    if !path.starts_with(prefix) || !path.ends_with(suffix) || path.len() <= prefix.len() + suffix.len() {
        return None;
    }
    let code = &path[prefix.len()..path.len() - suffix.len()];
    (!code.is_empty() && !code.contains('/')).then(|| code.to_string())
}

/// Derive the language list from files that exist in the repository.
pub fn languages_from_paths(paths: &[String], mask: &str, source: &str) -> Vec<Language> {
    let mut codes: Vec<String> = Vec::new();
    for path in paths {
        if let Some(code) = language_from_masked_path(path, mask) {
            if code != source && !codes.contains(&code) {
                codes.push(code);
            }
        }
    }
    codes.sort();
    codes.into_iter().map(|code| Language { code, name: String::new() }).collect()
}

impl ProjectConfig {
    pub fn validate(&self) -> Result<()> {
        if self.vcs != "github" {
            bail!("only the github vcs is supported");
        }
        if self.repo.split('/').filter(|p| !p.is_empty()).count() != 2 {
            bail!("repo must look like owner/repo");
        }
        for (label, branch) in [("branch", &self.branch), ("push_branch", &self.push_branch)] {
            if !branch.is_empty() && !branch.chars().all(|c| c.is_alphanumeric() || "._/-".contains(c)) {
                bail!("{label} contains characters git does not allow: {branch}");
            }
        }
        if matches!(self.file_format.as_str(), "yaml" | "json") == false {
            bail!("file_format must be yaml or json (the editor runtime supports no others)");
        }
        if let Some(problem) = validate_mask(&self.filemask) {
            bail!(problem);
        }
        for component in &self.components {
            if let Some(problem) = validate_mask(&component.filemask) {
                bail!(problem);
            }
        }
        if self.template.is_empty() {
            bail!("template (the source language file) is required");
        }
        if !matches!(self.pages.mode.as_str(), "branch" | "artifact" | "none") {
            bail!("pages.mode must be branch, artifact or none");
        }
        Ok(())
    }

    /// The final public URL of the editor, for the review screen.
    pub fn editor_url(&self) -> String {
        let repo_name = self.repo.split('/').nth(1).unwrap_or("repo");
        let owner = self.repo.split('/').next().unwrap_or("owner").to_lowercase();
        match self.pages.mode.as_str() {
            "artifact" => format!("https://{owner}.github.io/{repo_name}/Editor/"),
            "none" => "(not published)".into(),
            _ => format!("https://{owner}.github.io/{repo_name}/"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_all_placeholder_styles() {
        assert!(validate_mask("locales/app.*.yml").is_none());
        assert!(validate_mask("locales/app.{language}.yml").is_none());
        assert!(validate_mask("locales/app.%language%.yml").is_none());
        assert!(validate_mask("locales/app.en.yml").is_some());
        assert!(validate_mask("*/*.yml").is_some());
    }

    #[test]
    fn normalises_to_glob() {
        assert_eq!(normalize_mask("a.{language}.yml"), "a.*.yml");
        assert_eq!(normalize_mask("a.%language%.yml"), "a.*.yml");
    }

    #[test]
    fn derives_directory_and_language() {
        assert_eq!(directory_from_mask("locales/app.*.yml"), "locales");
        assert_eq!(directory_from_mask("app.*.yml"), ".");
        assert_eq!(language_from_masked_path("locales/app.zh-CN.yml", "locales/app.*.yml").as_deref(), Some("zh-CN"));
        assert_eq!(language_from_masked_path("locales/app.zh-CN.yml", "locales/other.*.yml"), None);
    }

    #[test]
    fn collects_directories_from_components() {
        let mut config = ProjectConfig { filemask: "locales/app.*.yml".into(), ..Default::default() };
        config.components = vec![Component { filemask: "web/ui.*.json".into(), template: None, file_format: None }];
        assert_eq!(directories(&config), vec!["locales".to_string(), "web".to_string()]);
    }

    #[test]
    fn validates_the_manifest() {
        let config = ProjectConfig {
            repo: "acme/site".into(),
            filemask: "locales/app.*.yml".into(),
            template: "locales/app.en.yml".into(),
            ..Default::default()
        };
        assert!(config.validate().is_ok());
        let broken = ProjectConfig { repo: "acme".into(), ..config.clone() };
        assert!(broken.validate().is_err());
        let bad_mask = ProjectConfig { filemask: "locales/app.en.yml".into(), ..config };
        assert!(bad_mask.validate().is_err());
    }

    #[test]
    fn reports_the_public_url() {
        let mut config = ProjectConfig { repo: "Acme/Site".into(), ..Default::default() };
        assert_eq!(config.editor_url(), "https://acme.github.io/Site/");
        config.pages.mode = "artifact".into();
        assert_eq!(config.editor_url(), "https://acme.github.io/Site/Editor/");
    }
}
