use crate::config::{normalize_mask, ProjectConfig};

pub const UPSTREAM_REPO: &str = "HayashiUme/GitLocalize";

const PR_TEMPLATE: &str = include_str!("../templates/gitlocalize-pr.yml");
const EDITOR_TEMPLATE: &str = include_str!("../templates/gitlocalize-editor.yml");

/// Workflow files written into the target repository, keyed by file name.
pub fn workflows(config: &ProjectConfig) -> Vec<(String, String)> {
    let mut files = Vec::new();
    if !config.push_branch.is_empty() && config.create_merge_request {
        files.push(("gitlocalize-pr.yml".to_string(), render_pr(config)));
    }
    if config.pages.mode == "branch" {
        files.push(("gitlocalize-editor.yml".to_string(), render_editor(config)));
    }
    files
}

fn render_pr(config: &ProjectConfig) -> String {
    PR_TEMPLATE
        .replace("__BRANCH__", &config.branch)
        .replace("__PUSH_BRANCH__", &config.push_branch)
        .replace("__FILEMASK__", &normalize_mask(&config.filemask))
        .replace("__PR_TITLE__", &config.pull_message)
}

fn render_editor(config: &ProjectConfig) -> String {
    EDITOR_TEMPLATE
        .replace("__BRANCH__", &config.branch)
        .replace("__PAGES_BRANCH__", &config.pages.branch)
        .replace("__UPSTREAM__", UPSTREAM_REPO)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> ProjectConfig {
        ProjectConfig {
            repo: "acme/site".into(),
            filemask: "locales/app.{language}.yml".into(),
            template: "locales/app.en.yml".into(),
            ..Default::default()
        }
    }

    #[test]
    fn generated_workflows_are_valid_yaml() {
        for (name, body) in workflows(&sample()) {
            let parsed: Result<serde_yaml_ng::Value, _> = serde_yaml_ng::from_str(&body);
            assert!(parsed.is_ok(), "{name} is not valid YAML: {:?}", parsed.err());
            assert!(!body.contains("__"), "{name} still contains a placeholder");
        }
    }

    #[test]
    fn pr_workflow_uses_the_configured_branches_and_mask() {
        let (_, body) = workflows(&sample())
            .into_iter()
            .find(|(name, _)| name == "gitlocalize-pr.yml")
            .expect("pr workflow");
        assert!(body.contains("branches: [\"i18n\"]"));
        assert!(body.contains("BASE: main"));
        assert!(body.contains("FILEMASK: \"locales/app.*.yml\""));
    }

    #[test]
    fn read_only_projects_get_no_pull_request_workflow() {
        let config = ProjectConfig { push_branch: String::new(), ..sample() };
        let names: Vec<String> = workflows(&config).into_iter().map(|(name, _)| name).collect();
        assert!(!names.iter().any(|name| name == "gitlocalize-pr.yml"), "unexpected pr workflow: {names:?}");
        assert!(names.iter().any(|name| name == "gitlocalize-editor.yml"));
    }
}
