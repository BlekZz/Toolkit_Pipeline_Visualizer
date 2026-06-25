// ─── Emoji lookup for known tag values ───────────────────────────────────────
// Keys are always lowercase. Call tagEmoji(value) with any casing.

const EMOJI_MAP: Record<string, string> = {
  // ── Data domains ────────────────────────────────────────────────────────────
  revenue:         '💹',
  acquisition:     '📈',
  retention:       '💎',
  finance:         '💰',
  ops:             '⚙️',
  operations:      '⚙️',
  product:         '🛍️',
  experimentation: '🧪',
  analytics:       '🔬',
  marketing:       '📣',
  infrastructure:  '🏗️',
  security:        '🔒',
  backup:          '💾',
  crm:             '👥',
  hr:              '👤',
  logistics:       '🚚',

  // ── Pipeline types ───────────────────────────────────────────────────────────
  ingestion:       '📥',
  transform:       '⚗️',
  aggregation:     '🔢',
  reporting:       '📋',
  export:          '📤',
  'quality-check': '✅',
  backfill:        '⏮️',
  archive:         '🗄️',
  restore:         '♻️',
  sync:            '🔃',
  streaming:       '🌊',

  // ── Source / Target systems ──────────────────────────────────────────────────
  postgresql:      '🐘',
  postgres:        '🐘',
  mysql:           '🐬',
  mongodb:         '🍃',
  redis:           '🔴',
  snowflake:       '❄️',
  bigquery:        '🔵',
  redshift:        '🔺',
  elasticsearch:   '🔍',
  kafka:           '📨',
  s3:              '☁️',
  gcs:             '☁️',
  'azure-blob':    '🔷',
  azure:           '🔷',
  aws:             '🟠',
  airflow:         '🌬️',
  spark:           '✨',
  databricks:      '🧱',
  dbt:             '🔧',
  warehouse:       '🏛️',
  mart:            '🏪',
  dashboard:       '📈',
  notification:    '🔔',
  sftp:            '📁',
  api:             '🔌',
  webhook:         '🔗',
  local:           '💻',
  csv:             '📄',
  parquet:         '📦',
  clickhouse:      '🖱️',
  oracle:          '🔶',
  mssql:           '🔷',
  sqlite:          '🗄️',
  excel:           '📗',

  // ── Schedule source types ─────────────────────────────────────────────────────
  cron:            '⏱',
  script:          '📜',

  // ── Run types ─────────────────────────────────────────────────────────────────
  automated:       '🤖',
  manual:          '👆',
  'semi-automated':'⚙️',

  // ── Review states ─────────────────────────────────────────────────────────────
  confirmed:       '✅',
  'needs-review':  '⚠️',
  assumed:         '🔵',
  deprecated:      '❌',

  // ── Environment scopes ────────────────────────────────────────────────────────
  production:      '🚀',
  staging:         '🧪',
  development:     '🔧',
  dev:             '🔧',
}

/** Return emoji for a known tag value (case-insensitive). Returns '' if unknown. */
export function tagEmoji(value: string): string {
  return EMOJI_MAP[value.toLowerCase()] ?? ''
}

/** Return display label: emoji prepended when known, otherwise the value unchanged. */
export function tagLabel(value: string): string {
  const emoji = tagEmoji(value)
  return emoji ? `${emoji} ${value}` : value
}
