<script setup lang="ts">
import { computed } from 'vue'
import { describePermission } from '../github/permissions'
import { actions, stats, targetPath, useEditor } from '../state/editorStore'

const { state } = useEditor()
const branch = computed(() => state.target?.translationBranch ?? '—')
</script>

<template>
  <section class="glz-status">
    <div class="glz-status-main">
      <img v-if="state.user?.avatar_url" :src="state.user.avatar_url" alt="" class="glz-avatar" />
      <div>
        <div class="glz-user">
          Signed in as
          <a :href="`https://github.com/${state.user?.login}`" target="_blank" rel="noreferrer">@{{ state.user?.login }}</a>
          <span class="glz-badge">{{ describePermission(state.repo?.viewerPermission ?? 'none') }}</span>
          <span v-if="state.mock" class="glz-badge glz-badge-warn">mock</span>
        </div>
        <div class="glz-meta">
          <span>{{ state.target?.owner }}/{{ state.target?.repo }}</span>
          <span>Branch: {{ branch }}</span>
          <span>HEAD: {{ state.headSha.slice(0, 7) || '—' }}</span>
        </div>
      </div>
    </div>
    <dl class="glz-stats">
      <div><dt>File</dt><dd>{{ targetPath }}</dd></div>
      <div><dt>Modified</dt><dd class="glz-strong">{{ stats.modified }}</dd></div>
      <div><dt>Untranslated</dt><dd>{{ stats.untranslated }}</dd></div>
      <div><dt>Warnings</dt><dd :class="{ 'glz-strong': stats.warnings > 0 }">{{ stats.warnings }}</dd></div>
    </dl>
    <div class="glz-status-actions">
      <button class="glz-secondary" :disabled="state.busy" @click="actions.reload">Reload from branch</button>
      <button class="glz-secondary" @click="actions.signOut">Sign out</button>
    </div>
  </section>
</template>

<style scoped>
.glz-status {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--glz-border);
  border-radius: 10px;
  padding: 12px 16px;
  background: var(--glz-surface);
}
.glz-status-main {
  display: flex;
  gap: 12px;
  align-items: center;
}
.glz-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}
.glz-user {
  font-size: 13px;
  font-weight: 600;
}
.glz-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--glz-text-muted);
  margin-top: 2px;
}
.glz-stats {
  display: flex;
  gap: 20px;
  margin: 0;
  flex-wrap: wrap;
}
.glz-stats dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--glz-text-muted);
}
.glz-stats dd {
  margin: 2px 0 0;
  font-size: 13px;
}
.glz-strong {
  color: var(--glz-accent);
  font-weight: 700;
}
.glz-status-actions {
  display: flex;
  gap: 8px;
}
</style>
