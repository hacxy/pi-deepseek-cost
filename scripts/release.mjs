#!/usr/bin/env node
/**
 * One-command release for the CI-based flow:
 *
 *   pnpm release [patch|minor|major]   # e.g. pnpm release minor
 *
 * Bumps the version (commit + vX.Y.Z tag), pushes main + tags — which
 * triggers .github/workflows/publish.yml (lint → typecheck → test → npm
 * publish via trusted publishing → changelogithub release) — then watches the
 * CI run and reports the outcome. Requires the `gh` CLI (used only to watch
 * CI; release works without it, you just won't get the run status).
 */
import { execSync } from 'node:child_process'

const TYPES = ['patch', 'minor', 'major']
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const type = args.find((a) => !a.startsWith('--')) ?? 'patch'

if (!TYPES.includes(type)) {
  console.error(`usage: pnpm release [${TYPES.join('|')}] — got "${type}"`)
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function run(cmd) {
  console.log(`\n$ ${cmd}`)
  try {
    execSync(cmd, { stdio: 'inherit' })
  } catch {
    console.error(`命令失败：${cmd}`)
    process.exit(1)
  }
}

function out(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).toString().trim()
  } catch {
    console.error(`命令失败：${cmd}`)
    process.exit(1)
  }
}

// --- sanity checks (read-only) --------------------------------------------
const dirty = out('git status --porcelain')
if (dirty) {
  console.error(`工作区不干净，请先提交或 stash：\n${dirty}`)
  process.exit(1)
}
const branch = out('git branch --show-current')
if (branch !== 'main') {
  console.error(`当前分支是 "${branch}"，发版请在 main 上进行`)
  process.exit(1)
}

if (dry) {
  console.log('dry-run，将执行：')
  console.log(`  npm version ${type}`)
  console.log('  git push origin main --tags')
  console.log('  gh run watch <publish run>')
  process.exit(0)
}

// --- bump + push -----------------------------------------------------------
run(`npm version ${type}`) // 提交 + vX.Y.Z tag（会经过 husky 校验）
run('git push origin main --tags')

// --- watch the publish run --------------------------------------------------
const head = out('git rev-parse HEAD')
let runId = null
for (let i = 0; i < 15 && !runId; i++) {
  try {
    const json = execSync(
      'gh run list --workflow=Publish --limit=5 --json databaseId,headSha,event',
      { encoding: 'utf8' },
    ).toString()
    runId = JSON.parse(json).find((r) => r.headSha === head)?.databaseId ?? null
  } catch {
    // gh 未安装或未认证：跳过自动等待
  }
  if (!runId) await sleep(2000)
}

if (!runId) {
  console.log('\n已推送。未能自动定位 CI 运行，可手动查看：')
  console.log('  gh run list --workflow=Publish')
  process.exit(0)
}

try {
  execSync(`gh run watch ${runId} --exit-status`, { stdio: 'inherit' })
  const url = out(`gh run view ${runId} --json url --jq .url`)
  console.log(`\n✅ 发布成功：${url}`)
  console.log('   npm view pi-deepseek-cost version   # 确认新版本')
} catch {
  console.error('\n❌ CI 运行失败，查看详情：')
  console.error(`  gh run view ${runId} --log-failed`)
  process.exit(1)
}
