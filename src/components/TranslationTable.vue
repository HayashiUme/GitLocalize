<script setup lang="ts">
import { actions, filteredEntries, issuesByKey, stats, useEditor } from '../state/editorStore'

const { state } = useEditor()
</script>

<template>
  <div class="glz-table-wrap">
    <table class="glz-table">
      <thead>
        <tr>
          <th class="glz-col-key">Key</th>
          <th class="glz-col-source">English (source)</th>
          <th class="glz-col-target">Translation</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in filteredEntries" :key="entry.key" :class="{ 'glz-modified': state.overrides[entry.key] !== undefined }">
          <td class="glz-col-key"><code>{{ entry.key }}</code></td>
          <td class="glz-col-source">
            <span :class="{ 'glz-multiline': entry.kind === 'multiline' }">{{ entry.source }}</span>
          </td>
          <td class="glz-col-target">
            <textarea
              v-if="entry.kind === 'multiline'"
              :value="entry.translation"
              rows="2"
              spellcheck="false"
              @input="actions.setTranslation(entry.key, ($event.target as HTMLTextAreaElement).value)"
            />
            <input
              v-else
              :value="entry.translation"
              spellcheck="false"
              type="text"
              @input="actions.setTranslation(entry.key, ($event.target as HTMLInputElement).value)"
            />
            <div v-if="issuesByKey.get(entry.key)?.length" class="glz-issues">
              <span v-for="issue in issuesByKey.get(entry.key)" :key="issue.code + issue.message" class="glz-issue">
                ⚠ {{ issue.message }}
              </span>
            </div>
            <span v-else-if="!entry.translated" class="glz-untranslated">未翻译</span>
          </td>
        </tr>
        <tr v-if="filteredEntries.length === 0">
          <td colspan="3" class="glz-empty">No entries match the current filter.</td>
        </tr>
      </tbody>
    </table>
    <footer class="glz-table-footer">
      <span>{{ filteredEntries.length }} / {{ stats.total }} entries</span>
      <span v-if="stats.untranslated > 0">{{ stats.untranslated }} untranslated</span>
      <span v-if="stats.modified > 0">{{ stats.modified }} modified</span>
    </footer>
  </div>
</template>

<style scoped>
.glz-table-wrap {
  border: 1px solid var(--glz-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--glz-surface);
}
.glz-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}
.glz-table th {
  text-align: left;
  padding: 8px 12px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--glz-text-muted);
  background: var(--glz-surface-alt);
  border-bottom: 1px solid var(--glz-border);
}
.glz-table td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--glz-border-soft);
  vertical-align: top;
}
.glz-col-key {
  width: 26%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--glz-text-muted);
  word-break: break-all;
}
.glz-col-source {
  width: 34%;
  color: var(--glz-text-muted);
}
.glz-col-target {
  width: 40%;
}
.glz-col-target input,
.glz-col-target textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--glz-border);
  border-radius: 6px;
  font: inherit;
  background: #fff;
  color: var(--glz-text);
  resize: vertical;
}
.glz-multiline {
  white-space: pre-wrap;
}
.glz-modified td {
  background: var(--glz-modified);
}
.glz-issues {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 3px;
}
.glz-issue {
  font-size: 11px;
  color: var(--glz-warn);
}
.glz-untranslated {
  display: inline-block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--glz-text-muted);
}
.glz-empty {
  padding: 24px;
  text-align: center;
  color: var(--glz-text-muted);
}
.glz-table-footer {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--glz-text-muted);
  background: var(--glz-surface-alt);
}
</style>
