import hashlib
import json
import pathlib
import subprocess
import urllib.request

root = pathlib.Path(__file__).resolve().parent.parent / 'build' / 'tools'
root.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen('https://ziglang.org/download/index.json') as response:
    index = response.read()
(root / 'index.json').write_bytes(index)
release = json.loads(index)['0.15.2']['x86_64-linux']
with urllib.request.urlopen(release['tarball']) as response:
    archive = response.read()
if hashlib.sha256(archive).hexdigest() != release['shasum']:
    raise RuntimeError('Zig checksum mismatch')
archive_path = root / release['tarball'].rsplit('/', 1)[-1]
archive_path.write_bytes(archive)
subprocess.run(['tar', '-xJf', str(archive_path), '-C', str(root)], check=True)
(root / 'zig').symlink_to(root / 'zig-x86_64-linux-0.15.2', target_is_directory=True)
print('Installed Zig 0.15.2 with verified SHA-256', flush=True)
