#!/usr/bin/env node
/**
 * First publish of a new package (bootstrap): verifies npm login, publishes,
 * and auto-handles the 2FA/OTP step that npm v11 no longer prompts for
 * (publishing with a token that lacks "bypass 2FA" fails with a 403 instead
 * of asking for a one-time password).
 *
 *   pnpm publish:first
 *
 * After it succeeds, configure the npmjs.com trusted publisher for this
 * package (Settings → Trusted publishing), then set Publishing access to
 * "Require two-factor authentication and disallow tokens". Future releases
 * go through CI only (`pnpm release`) — this script is not needed again.
 */
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'

const ask = (prompt) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function publish(extra = []) {
  return execFileSync('npm', ['publish', ...extra], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
}

try {
  const who = execFileSync('npm', ['whoami'], { encoding: 'utf8' }).toString().trim()
  console.log(`已登录 npm 账号：${who}`)
} catch {
  console.error('未登录 npm。请先执行 npm login（若提示 OTP 请输入验证码），再运行本脚本。')
  process.exit(1)
}

let output
try {
  output = publish()
} catch (err) {
  const detail = `${err.stdout ?? ''}${err.stderr ?? ''}`
  console.error(detail)
  if (!/two-factor|bypass 2fa|E403/i.test(detail)) {
    console.error('发布失败（非 2FA 错误），请查看上方日志。')
    process.exit(1)
  }
  const otp = await ask('需要 2FA 验证码（认证器/短信）：')
  try {
    output = publish([`--otp=${otp}`])
  } catch (err2) {
    console.error(`${err2.stdout ?? ''}${err2.stderr ?? ''}`)
    console.error(
      '发布仍失败：请确认验证码正确，或改用带 "Enable bypass 2FA" 的 granular access token。',
    )
    process.exit(1)
  }
}

console.log(output)
console.log('\n✅ 发布成功。接下来（一次性）：')
console.log('  1. npmjs.com 包 Settings → Trusted publishing → 配置 GitHub Actions')
console.log('  2. Publishing access → "Require two-factor authentication and disallow tokens"')
console.log('  3. 之后发版只需：pnpm release')
