import { exec } from 'child_process'
import { join, basename } from 'path'
import { existsSync, mkdirSync } from 'fs'

// 沙箱目录
const SANDBOX_DIR = join(process.env.HOME || '/tmp', 'XueMateSandbox')

// 确保沙箱目录存在
function ensureSandbox(): string {
  if (!existsSync(SANDBOX_DIR)) {
    mkdirSync(SANDBOX_DIR, { recursive: true })
  }
  return SANDBOX_DIR
}

// 命令分类
type CommandLevel = 'safe' | 'confirm' | 'blocked'

// 解析命令的主程序名
function extractCommand(cmd: string): string {
  const trimmed = cmd.trim()
  // 处理 env 前缀
  if (trimmed.startsWith('env ')) {
    return trimmed.split(/\s+/)[1] || ''
  }
  // 处理 /usr/bin/xxx 路径
  const parts = trimmed.split(/\s+/)
  const bin = parts[0] || ''
  return basename(bin) || bin
}

// 完全禁止的命令（黑名单优先）
const BLOCKED_PATTERNS = [
  /^rm\s+-rf\s+\/(\s|$)/, // rm -rf /
  /^rm\s+-rf\s+~\/(\s|$)/, // rm -rf ~/
  /\bsudo\b/, // sudo
  /\bchmod\s+777\b/, // chmod 777
  /\bshutdown\b/, // shutdown
  /\breboot\b/, // reboot
  /\bmkfs\b/, // mkfs
  /\bdd\s+.*of=\/dev\//, // dd to device
  /\b:(){ :\|:& };:/, // fork bomb
  /\bcurl\b.*\|\s*(ba)?sh/, // curl | sh
  /\bwget\b.*\|\s*(ba)?sh/, // wget | sh
  /\bkill\s+-9\s+-1\b/ // kill all processes
]

// 只读命令（自动执行，不需要确认）
const SAFE_COMMANDS = new Set([
  'ls',
  'll',
  'la',
  'dir',
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'grep',
  'rg',
  'ag',
  'ack',
  'find',
  'fd',
  'wc',
  'sort',
  'uniq',
  'cut',
  'awk',
  'sed', // 只读 sed 用法会单独检查
  'pwd',
  'echo',
  'printf',
  'whoami',
  'id',
  'date',
  'cal',
  'which',
  'whereis',
  'type',
  'file',
  'stat',
  'du',
  'df',
  'tree',
  'env',
  'printenv',
  'uname',
  'sw_vers',
  'hostname',
  'ps',
  'top',
  'uptime',
  'free',
  'ifconfig',
  'ipconfig',
  'ping',
  'traceroute',
  'nslookup',
  'dig',
  'python3',
  'python',
  'node',
  'ruby' // 执行脚本属于 confirm
])

// 需要确认的写操作命令
const CONFIRM_COMMANDS = new Set([
  'rm',
  'rmdir',
  'unlink',
  'mv',
  'cp',
  'mkdir',
  'touch',
  'chmod',
  'chown',
  'chgrp',
  'tee',
  'tar',
  'zip',
  'unzip',
  'gzip',
  'gunzip',
  'npm',
  'yarn',
  'pnpm',
  'pip',
  'pip3',
  'brew',
  'git',
  'curl',
  'wget',
  'python',
  'python3',
  'node',
  'ruby',
  'go',
  'cargo',
  'make',
  'cmake',
  'docker',
  'vim',
  'nano',
  'vi',
  'open',
  'xcode-select'
])

// 检查命令是否包含重定向写操作
function hasRedirect(cmd: string): boolean {
  // 排除在引号内的 >
  const stripped = cmd.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '')
  return />\s/.test(stripped) || />>/.test(stripped)
}

// 检查命令是否包含管道（管道中的命令也需要检查）
function hasPipe(cmd: string): boolean {
  return /\|/.test(cmd.replace(/\|{2}/, '')) // || 不算管道
}

// 命令分类
export function classifyCommand(cmd: string): { level: CommandLevel; reason: string } {
  const trimmed = cmd.trim()

  // 1. 检查黑名单
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: 'blocked', reason: '该命令被安全策略禁止' }
    }
  }

  // 2. 检查重定向写操作
  if (hasRedirect(trimmed)) {
    return { level: 'confirm', reason: '该命令会写入文件' }
  }

  // 3. 提取主命令
  const mainCmd = extractCommand(trimmed)

  // 4. 只读命令自动放行
  if (SAFE_COMMANDS.has(mainCmd)) {
    // 但如果是 python/node 执行脚本，需要确认
    if (['python', 'python3', 'node', 'ruby', 'go'].includes(mainCmd)) {
      return { level: 'confirm', reason: '该命令会执行代码' }
    }
    return { level: 'safe', reason: '只读命令' }
  }

  // 5. 需要确认的命令
  if (CONFIRM_COMMANDS.has(mainCmd)) {
    // git 的只读子命令自动放行
    if (mainCmd === 'git') {
      const subCmd = trimmed.split(/\s+/)[1] || ''
      const gitSafe = ['status', 'log', 'diff', 'show', 'branch', 'remote', 'describe']
      if (gitSafe.includes(subCmd)) {
        return { level: 'safe', reason: 'Git 只读命令' }
      }
      return { level: 'confirm', reason: 'Git 写操作' }
    }
    // npm/pip 只读子命令
    if (['npm', 'yarn', 'pnpm'].includes(mainCmd)) {
      const subCmd = trimmed.split(/\s+/)[1] || ''
      if (['ls', 'list', 'info', 'view', 'outdated', 'doctor'].includes(subCmd)) {
        return { level: 'safe', reason: '包管理器只读命令' }
      }
      return { level: 'confirm', reason: '包管理器操作' }
    }
    return { level: 'confirm', reason: '该命令会修改系统状态' }
  }

  // 6. 未知命令默认需要确认
  return { level: 'confirm', reason: '未知命令，需要确认' }
}

// 在沙箱中执行命令
export function execInSandbox(
  command: string,
  options?: { cwd?: string; timeout?: number }
): Promise<{ stdout: string; stderr: string; code: number }> {
  const cwd = options?.cwd || ensureSandbox()
  const timeout = options?.timeout || 30000

  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024,
        shell: '/bin/zsh',
        env: { ...process.env, XM_SANDBOX: '1' }
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          code: error ? error.code || 1 : 0
        })
      }
    )
  })
}

export { SANDBOX_DIR, ensureSandbox }
