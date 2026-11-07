"""Restore the vendor mozglue private-assembly manifest in a PROJECT-LOCAL
copy of Playwright Firefox. No binary patches, registry edits or system installs.
"""
from pathlib import Path
import ctypes, shutil, sys, hashlib
ROOT=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]).resolve().parent
target=ROOT/'.local/browsers/firefox'
target.mkdir(parents=True,exist_ok=True)
if not (target/'firefox.exe').exists() or hashlib.sha256((target/'firefox.exe').read_bytes()).digest()!=hashlib.sha256((source/'firefox.exe').read_bytes()).digest():
    shutil.copytree(source,target,dirs_exist_ok=True)
k=ctypes.WinDLL('kernel32',use_last_error=True)
k.LoadLibraryExW.argtypes=[ctypes.c_wchar_p,ctypes.c_void_p,ctypes.c_uint];k.LoadLibraryExW.restype=ctypes.c_void_p
k.FindResourceW.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p];k.FindResourceW.restype=ctypes.c_void_p
k.LoadResource.argtypes=[ctypes.c_void_p,ctypes.c_void_p];k.LoadResource.restype=ctypes.c_void_p
k.LockResource.argtypes=[ctypes.c_void_p];k.LockResource.restype=ctypes.c_void_p
k.SizeofResource.argtypes=[ctypes.c_void_p,ctypes.c_void_p];k.SizeofResource.restype=ctypes.c_uint
h=k.LoadLibraryExW(str(target/'mozglue.dll'),None,2|32)
r=k.FindResourceW(h,2,24)
if not r:
    raise RuntimeError('Vendor mozglue manifest missing')
manifest=ctypes.string_at(k.LockResource(k.LoadResource(h,r)),k.SizeofResource(h,r))
assert b'name="mozglue"' in manifest and b'mozglue.dll' in manifest
(target/'mozglue.manifest').write_bytes(manifest)
print('Project-local Firefox dependency ready; original browser and OS unchanged.')

