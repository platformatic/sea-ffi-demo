import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, chmod, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const NODE_VERSION = '26.10.0'
const NODE_DOWNLOAD_URL = `https://nodejs.org/dist/v${NODE_VERSION}`
const EXECUTABLE_BASENAME = 'sea-ffi-demo'

const root = resolve(import.meta.dirname, '..')
const directories = {
  downloads: join(root, 'build/downloads'),
  tools: join(root, 'build/tools'),
  build: join(root, 'build'),
  output: join(root, 'dist')
}

const ZIG_EXECUTABLE = join(directories.tools, 'zig/zig')
const MACOS_SDK = '/macos-sdk'

const targets = [
  {
    name: 'darwin-arm64',
    download: `node-v${NODE_VERSION}-darwin-arm64.tar.xz`,
    nodeExecutable: `node-v${NODE_VERSION}-darwin-arm64/bin/node`,
    librarySuffix: 'dylib',
    executableSuffix: '',
    zigTarget: 'aarch64-macos',
    requiresMacosSdk: true,
    compilerFlags: ['-isysroot', MACOS_SDK, '-fPIC']
  },
  {
    name: 'linux-x64',
    download: `node-v${NODE_VERSION}-linux-x64.tar.xz`,
    nodeExecutable: `node-v${NODE_VERSION}-linux-x64/bin/node`,
    librarySuffix: 'so',
    executableSuffix: '',
    zigTarget: 'x86_64-linux-gnu.2.28',
    compilerFlags: ['-fPIC']
  },
  {
    name: 'win-x64',
    download: 'win-x64/node.exe',
    nodeExecutable: 'win-x64-node.exe',
    librarySuffix: 'dll',
    executableSuffix: '.exe',
    zigTarget: 'x86_64-windows-gnu',
    compilerFlags: []
  }
]

function validateBuildHost() {
  if (process.platform !== 'linux' || process.version !== `v${NODE_VERSION}`) {
    throw new Error(`Run this build on Linux with Node.js ${NODE_VERSION}`)
  }
}

async function selectTargets() {
  try {
    await access(join(MACOS_SDK, 'usr/include/stdio.h'))
    await access(join(MACOS_SDK, 'usr/lib/libSystem.tbd'))
    return targets
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
      throw error
    }
    console.log('Skipping darwin-arm64: no macOS SDK available at /macos-sdk.')
    return targets.filter(target => !target.requiresMacosSdk)
  }
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

async function downloadFile(path) {
  const response = await fetch(`${NODE_DOWNLOAD_URL}/${path}`)
  if (!response.ok) {
    throw new Error(`Download failed for ${path}: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function downloadChecksums() {
  const content = await downloadFile('SHASUMS256.txt')
  await writeFile(join(directories.downloads, 'SHASUMS256.txt'), content)

  return new Map(
    content
      .toString()
      .trim()
      .split('\n')
      .map(line => {
        const [hash, name] = line.trim().split(/\s+/)
        return [name, hash]
      })
  )
}

async function prepareNodeExecutable(target, checksums) {
  const expectedHash = checksums.get(target.download)
  if (!expectedHash) {
    throw new Error(`No published checksum for ${target.download}`)
  }

  const bytes = await downloadFile(target.download)
  const actualHash = createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== expectedHash) {
    throw new Error(`Checksum mismatch for ${target.download}`)
  }

  const downloadPath = join(directories.downloads, target.download.replaceAll('/', '-'))
  await writeFile(downloadPath, bytes)
  if (target.download.endsWith('.tar.xz')) {
    run('tar', ['-xJf', downloadPath, '-C', directories.downloads, target.nodeExecutable])
  }

  return join(directories.downloads, target.nodeExecutable)
}

function compileLibrary(target) {
  const libraryPath = join(directories.build, `message.${target.librarySuffix}`)
  run(ZIG_EXECUTABLE, [
    'cc',
    '-target',
    target.zigTarget,
    '-shared',
    '-O2',
    '-o',
    libraryPath,
    join(root, 'lib/native/message.c'),
    ...target.compilerFlags
  ])
  return libraryPath
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

async function buildSea(target, nodeExecutable, libraryPath) {
  const output = join(directories.output, `${EXECUTABLE_BASENAME}-${target.name}${target.executableSuffix}`)
  const configPath = join(directories.build, `${target.name}.json`)
  await writeJson(configPath, {
    main: join(root, 'lib/main.js'),
    mainFormat: 'module',
    executable: nodeExecutable,
    output,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    useVfs: true,
    assets: { [`native/message.${target.librarySuffix}`]: libraryPath }
  })

  run(process.execPath, ['--build-sea', configPath])
  await chmod(output, 0o755)
}

async function writeProvenance(selectedTargets) {
  await writeJson(join(directories.build, 'provenance.json'), {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    generatedAt: new Date().toISOString(),
    targets: selectedTargets.map(target => target.name)
  })
}

async function main() {
  validateBuildHost()
  const selectedTargets = await selectTargets()
  await Promise.all(Object.values(directories).map(directory => mkdir(directory, { recursive: true })))
  const checksums = await downloadChecksums()

  for (const target of selectedTargets) {
    console.log(`Building ${target.name}...`)
    const nodeExecutable = await prepareNodeExecutable(target, checksums)
    const libraryPath = compileLibrary(target)
    await buildSea(target, nodeExecutable, libraryPath)
    console.log(`Built ${target.name} from ${process.platform}/${process.arch}`)
  }

  await writeProvenance(selectedTargets)
}

await main()
