use crate::config::{self, Language, ProjectConfig};
use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Cell, Paragraph, Row, Table, Wrap},
    Frame, Terminal,
};
use std::{io, time::Duration};

const STEPS: [&str; 7] = [
    "Repository",
    "Files",
    "Languages",
    "Flow",
    "Hosting",
    "Review",
    "Execute",
];

pub struct App {
    pub config: ProjectConfig,
    pub step: usize,
    pub focus: usize,
    pub editing: bool,
    pub input: String,
    pub status: String,
    pub written: Vec<String>,
}

impl App {
    pub fn new(config: ProjectConfig) -> Self {
        Self { config, step: 0, focus: 0, editing: false, input: String::new(), status: String::new(), written: Vec::new() }
    }

    fn field_count(&self) -> usize {
        match self.step {
            0 => 3,                          // repo, branch, push_branch
            1 => 4,                          // filemask, template, source_language, source_directory
            2 => self.config.languages.len(), // the language table
            3 => 3,                          // commit_message, pull_message, create_merge_request
            4 => 3,                          // pages.mode, pages.branch, pages.version
            _ => 1,
        }
    }

    fn current_value(&self) -> String {
        match (self.step, self.focus) {
            (0, 0) => self.config.repo.clone(),
            (0, 1) => self.config.branch.clone(),
            (0, 2) => self.config.push_branch.clone(),
            (1, 0) => self.config.filemask.clone(),
            (1, 1) => self.config.template.clone(),
            (1, 2) => self.config.source_language.clone(),
            (1, 3) => self.config.source_directory.clone(),
            (2, index) => self.config.languages.get(index).map(|l| l.code.clone()).unwrap_or_default(),
            (3, 0) => self.config.commit_message.clone(),
            (3, 1) => self.config.pull_message.clone(),
            (3, 2) => self.config.create_merge_request.to_string(),
            (4, 0) => self.config.pages.mode.clone(),
            (4, 1) => self.config.pages.branch.clone(),
            (4, 2) => self.config.pages.version.clone(),
            _ => String::new(),
        }
    }

    fn commit_input(&mut self) {
        let value = self.input.trim().to_string();
        match (self.step, self.focus) {
            (0, 0) => self.config.repo = value,
            (0, 1) => self.config.branch = value,
            (0, 2) => self.config.push_branch = value,
            (1, 0) => {
                self.config.filemask = value.clone();
                self.config.source_directory = config::directory_from_mask(&config::normalize_mask(&value));
            }
            (1, 1) => self.config.template = value,
            (1, 2) => self.config.source_language = value,
            (1, 3) => self.config.source_directory = value,
            (2, index) => {
                if let Some(language) = self.config.languages.get_mut(index) {
                    language.code = value;
                }
            }
            (3, 0) => self.config.commit_message = value,
            (3, 1) => self.config.pull_message = value,
            (3, 2) => self.config.create_merge_request = !self.config.create_merge_request,
            (4, 0) => self.config.pages.mode = value,
            (4, 1) => self.config.pages.branch = value,
            (4, 2) => self.config.pages.version = value,
            _ => {}
        }
    }

    fn cycle_choice(&mut self, forward: bool) {
        let options: &[&str] = match (self.step, self.focus) {
            (4, 0) => &["branch", "artifact", "none"],
            (4, 2) => &["latest", "pinned"],
            _ => return,
        };
        let current = self.current_value();
        let index = options.iter().position(|o| *o == current).unwrap_or(0);
        let next = if forward { (index + 1) % options.len() } else { (index + options.len() - 1) % options.len() };
        let value = options[next].to_string();
        match (self.step, self.focus) {
            (4, 0) => self.config.pages.mode = value,
            (4, 2) => self.config.pages.version = value,
            _ => {}
        }
    }

    fn write_outputs(&mut self) -> Result<()> {
        self.config.validate()?;
        let mut written = Vec::new();
        std::fs::create_dir_all(".gitlocalize")?;
        let config_path = ".gitlocalize/config.json";
        std::fs::write(config_path, serde_json::to_string_pretty(&self.config)? + "\n")?;
        written.push(config_path.to_string());

        std::fs::create_dir_all(".github/workflows")?;
        for (name, body) in crate::templates::workflows(&self.config) {
            let path = format!(".github/workflows/{name}");
            std::fs::write(&path, body)?;
            written.push(path);
        }
        self.written = written;
        Ok(())
    }
}

pub fn run(mut app: App) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;
    terminal.clear()?;

    let result = event_loop(&mut terminal, &mut app);

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    result
}

fn event_loop(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>, app: &mut App) -> Result<()> {
    loop {
        terminal.draw(|frame| draw(frame, app))?;
        if !event::poll(Duration::from_millis(200))? {
            continue;
        }
        let Event::Key(key) = event::read()? else { continue };

        if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('s') {
            match app.write_outputs() {
                Ok(()) => {
                    app.step = 6;
                    app.status = "Configuration written. Review the files, then commit and push.".into();
                }
                Err(error) => app.status = format!("Cannot write: {error}"),
            }
            continue;
        }

        if app.editing {
            match key.code {
                KeyCode::Enter => {
                    app.commit_input();
                    app.editing = false;
                    app.input.clear();
                }
                KeyCode::Esc => {
                    app.editing = false;
                    app.input.clear();
                }
                KeyCode::Backspace => {
                    app.input.pop();
                }
                KeyCode::Char(c) => app.input.push(c),
                _ => {}
            }
            continue;
        }

        match key.code {
            KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
            KeyCode::Tab | KeyCode::Right => {
                app.step = (app.step + 1) % STEPS.len();
                app.focus = 0;
            }
            KeyCode::BackTab | KeyCode::Left => {
                app.step = (app.step + STEPS.len() - 1) % STEPS.len();
                app.focus = 0;
            }
            KeyCode::Down => {
                let count = app.field_count().max(1);
                app.focus = (app.focus + 1) % count;
            }
            KeyCode::Up => {
                let count = app.field_count().max(1);
                app.focus = (app.focus + count - 1) % count;
            }
            KeyCode::Enter => {
                let current = app.current_value();
                if current == "true" || current == "false" {
                    app.commit_input();
                } else if app.step == 4 && app.focus != 1 {
                    app.cycle_choice(true);
                } else if app.step == 2 {
                    app.editing = true;
                    app.input = current;
                } else {
                    app.editing = true;
                    app.input = current;
                }
            }
            KeyCode::Char('a') if app.step == 2 => {
                app.config.languages.push(Language { code: "xx".into(), name: String::new() });
                app.focus = app.config.languages.len() - 1;
                app.editing = true;
                app.input = "xx".into();
            }
            KeyCode::Char('d') if app.step == 2 && !app.config.languages.is_empty() => {
                app.config.languages.remove(app.focus.min(app.config.languages.len() - 1));
                app.focus = app.focus.saturating_sub(1);
            }
            _ => {}
        }
    }
}

fn draw(frame: &mut Frame, app: &App) {
    let chunks = Layout::vertical([Constraint::Length(3), Constraint::Min(0), Constraint::Length(4)]).split(frame.area());

    let mut header = vec![Span::styled(" gitlocalize ", Style::default().fg(Color::Black).bg(Color::Green).add_modifier(Modifier::BOLD))];
    for (index, name) in STEPS.iter().enumerate() {
        let style = if index == app.step {
            Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(Color::Gray)
        };
        header.push(Span::raw(" "));
        header.push(Span::styled(format!(" {} {} ", index + 1, name), style));
    }
    frame.render_widget(Paragraph::new(Line::from(header)).block(Block::default().borders(Borders::ALL)), chunks[0]);

    match app.step {
        2 => draw_languages(frame, app, chunks[1]),
        5 => draw_review(frame, app, chunks[1]),
        6 => draw_result(frame, app, chunks[1]),
        _ => draw_fields(frame, app, chunks[1]),
    }

    let help = if app.editing {
        " Enter save · Esc cancel · Backspace delete "
    } else {
        " Tab/←→ steps · ↑↓ fields · Enter edit · a add · d delete · Ctrl+S write · q quit "
    };
    let status = if app.status.is_empty() { String::new() } else { format!("\n{}", app.status) };
    frame.render_widget(
        Paragraph::new(format!("{help}{status}"))
            .style(Style::default().fg(Color::DarkGray))
            .block(Block::default().borders(Borders::TOP)),
        chunks[2],
    );
}

fn field_rows(app: &App) -> Vec<(&'static str, String, String)> {
    match app.step {
        0 => vec![
            ("Repository (owner/repo)", app.config.repo.clone(), "required · validated against GitHub".into()),
            ("Base branch", app.config.branch.clone(), "where reviewed translations land".into()),
            ("Translation branch", app.config.push_branch.clone(), "empty = read-only".into()),
        ],
        1 => {
            let mask_problem = config::validate_mask(&app.config.filemask).unwrap_or_default();
            vec![
                ("File mask", app.config.filemask.clone(), if mask_problem.is_empty() { "*.yml / {language} / %language%".into() } else { mask_problem }),
                ("Template (source file)", app.config.template.clone(), "required".into()),
                ("Source language", app.config.source_language.clone(), "e.g. en".into()),
                ("Source directory", app.config.source_directory.clone(), "derived from the mask".into()),
            ]
        }
        3 => vec![
            ("Commit message", app.config.commit_message.clone(), "%language% is replaced".into()),
            ("Pull message / title", app.config.pull_message.clone(), "%language% is replaced".into()),
            ("Create pull request", app.config.create_merge_request.to_string(), "Enter toggles".into()),
        ],
        4 => vec![
            ("Pages mode", app.config.pages.mode.clone(), "branch | artifact | none · Enter cycles".into()),
            ("Pages branch", app.config.pages.branch.clone(), "the branch that serves the editor".into()),
            ("Editor version", app.config.pages.version.clone(), "latest".into()),
        ],
        _ => vec![],
    }
}

fn draw_fields(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    let rows = field_rows(app);
    let mut lines: Vec<Line> = Vec::new();
    for (index, (label, value, hint)) in rows.iter().enumerate() {
        let focused = index == app.focus;
        let shown = if focused && app.editing { app.input.clone() } else { value.clone() };
        lines.push(Line::from(vec![
            Span::styled(format!("{:<26}", label), if focused { Style::default().fg(Color::Yellow) } else { Style::default().fg(Color::Gray) }),
            Span::styled(shown, Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
            Span::styled(format!("   {hint}"), Style::default().fg(Color::DarkGray)),
        ]));
    }
    if lines.is_empty() {
        lines.push(Line::from("Nothing to configure on this step."));
    }
    frame.render_widget(
        Paragraph::new(lines).wrap(Wrap { trim: false }).block(Block::default().borders(Borders::ALL).title(format!(" {} ", STEPS[app.step]))),
        area,
    );
}

fn draw_languages(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    let header = Row::new(vec![Cell::from("code"), Cell::from("repository files"), Cell::from("")]).style(Style::default().add_modifier(Modifier::BOLD));
    let rows: Vec<Row> = app
        .config
        .languages
        .iter()
        .enumerate()
        .map(|(index, language)| {
            let focused = index == app.focus;
            let shown = if focused && app.editing { app.input.clone() } else { language.code.clone() };
            Row::new(vec![
                Cell::from(shown),
                Cell::from(format!("{}.{}", config::normalize_mask(&app.config.filemask).replace('*', &language.code), "")),
                Cell::from(if language.name.is_empty() { "" } else { &language.name }),
            ])
            .style(if focused { Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD) } else { Style::default() })
        })
        .collect();
    let table = Table::new(rows, [Constraint::Length(16), Constraint::Min(30), Constraint::Length(20)])
        .header(header)
        .block(Block::default().borders(Borders::ALL).title(" Target languages · a add · d delete "));
    frame.render_widget(table, area);
}

fn draw_review(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    let workflows = crate::templates::workflows(&app.config);
    let mut lines = vec![
        Line::from(Span::styled("Files that will be written", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  .gitlocalize/config.json"),
    ];
    for (name, _) in &workflows {
        lines.push(Line::from(format!("  .github/workflows/{name}")));
    }
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled("Editor URL", Style::default().add_modifier(Modifier::BOLD))));
    lines.push(Line::from(format!("  {}", app.config.editor_url())));
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled("Branches", Style::default().add_modifier(Modifier::BOLD))));
    lines.push(Line::from(format!("  base: {}   translations: {}", app.config.branch, if app.config.push_branch.is_empty() { "(read-only)" } else { &app.config.push_branch })));
    lines.push(Line::from(""));
    let validation = app.config.validate();
    match validation {
        Ok(()) => lines.push(Line::from(Span::styled("Ctrl+S writes the files", Style::default().fg(Color::Green)))),
        Err(error) => lines.push(Line::from(Span::styled(format!("Cannot write yet: {error}"), Style::default().fg(Color::Red)))),
    }
    frame.render_widget(
        Paragraph::new(lines).wrap(Wrap { trim: false }).block(Block::default().borders(Borders::ALL).title(" Review ")),
        area,
    );
}

fn draw_result(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    let mut lines = vec![Line::from(Span::styled("Written", Style::default().add_modifier(Modifier::BOLD)))];
    if app.written.is_empty() {
        lines.push(Line::from("  (nothing yet — press Ctrl+S on the review step)"));
    }
    for path in &app.written {
        lines.push(Line::from(format!("  {path}")));
    }
    lines.push(Line::from(""));
    lines.push(Line::from("Next:"));
    lines.push(Line::from("  git add .gitlocalize .github/workflows"));
    lines.push(Line::from("  git commit -m 'chore: set up GitLocalize'"));
    lines.push(Line::from("  git push origin main"));
    lines.push(Line::from(""));
    lines.push(Line::from(format!("Editor: {}", app.config.editor_url())));
    frame.render_widget(
        Paragraph::new(lines).wrap(Wrap { trim: false }).block(Block::default().borders(Borders::ALL).title(" Execute ")),
        area,
    );
}
