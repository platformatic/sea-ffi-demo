# Node.js SEA + FFI cross-compilation demo

Build standalone executables for **Linux x64 (glibc)**, **Windows x64**, and
**macOS arm64** from a Linux container. No npm dependencies required.

The demo bundles a small C library in a Node.js SEA virtual filesystem and calls
it with the built-in `node:ffi` module. Each executable runs without a separate
Node.js installation or shared library.

## Requirements

- Linux or macOS with Docker running (including Linux amd64 container support).
- Internet access to download Node.js **26.10.0** and Zig **0.15.2**.
- Optional: an Apple SDK to build the macOS target (Xcode Command Line Tools on macOS).

Node.js, npm, Python, and Zig are only needed inside the container, not on the host.

## Build

Run from this directory:

```sh
npm run build
```

or, equivalently

```sh
sh scripts/build.sh
```

This builds Linux and Windows executables inside a Linux container. On macOS,
the script detects the Apple SDK with `xcrun` and mounts it read-only directly
from its installed location: nothing is copied. Without an SDK, the macOS target
is skipped. Existing artifacts in `dist/` are not removed when a target is skipped.

With Docker Desktop, allow the SDK's location in **Settings → Resources → File Sharing**
if it is not already shared (typically under `/Applications/Xcode.app`).
Use `SKIP_MACOS=1 sh scripts/build.sh` to build only Linux and Windows on any host.

To use an SDK at a specific path (including on Linux):

```sh
MACOS_SDK_PATH=/path/to/MacOSX.sdk sh scripts/build.sh
```

If the macOS target was built, sign it on a Mac before running it:

```sh
codesign --force --sign - dist/sea-ffi-demo-darwin-arm64
```

## Run

Copy only the matching executable to the destination machine:

| Target | Executable |
| --- | --- |
| Linux x64, glibc 2.28+ | `dist/sea-ffi-demo-linux-x64` |
| Windows x64 | `dist/sea-ffi-demo-win-x64.exe` |
| macOS arm64 | `dist/sea-ffi-demo-darwin-arm64` |

```sh
# Linux (restore executable permissions if needed)
chmod +x ./sea-ffi-demo-linux-x64
./sea-ffi-demo-linux-x64 'Hello from Linux'

# macOS
./sea-ffi-demo-darwin-arm64 'Hello from macOS'
```

```powershell
# Windows
.\sea-ffi-demo-win-x64.exe 'Hello from Windows'
```

Output: `[<unix timestamp>] <message>`. An experimental FFI warning may also appear.

## How it works

- `lib/native/message.c` exports `print_message()`; Zig cross-compiles it for each target.
- `lib/main.js` loads the bundled library from the SEA VFS via `node:ffi`.
- `scripts/build.sh` runs Docker and optionally mounts the host's Apple SDK read-only.
- `scripts/build.js` downloads official target Node.js binaries, verifies their published
  SHA-256 checksums, and builds SEAs with VFS enabled and snapshots/code cache disabled.
- `scripts/setup-tools.py` downloads Zig and verifies its published SHA-256 checksum.

Downloads, tools, caches, and intermediate files stay in `build/`; the optional SDK stays on the host.
Final executables are generated in `dist/`. Both directories are ignored by Git.

## Limitations

Node.js itself is not cross-compiled: this demo uses official target binaries.
The macOS signing step still requires a Mac; ad hoc signing is not Developer ID
signing or notarization. The Windows executable is unsigned. Building an artifact
does not verify execution on its target OS; run each executable there to test it.

The application does not extract assets itself, but Node.js internally loads VFS
libraries through a temporary, self-cleaning image. The C timestamp uses `%d`
and an `int` cast, so it has the 2038 limitation.
