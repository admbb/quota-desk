"""Read GitHub tokens out of the Windows Credential Manager.

Quota Desk runs on Node, which has no way to call CredReadW without a native addon, so the
lookup lives in this tiny helper: it enumerates the current user's credentials, keeps the
GitHub / Copilot ones, and prints them as base64 so the caller never has to parse binary.

Nothing here writes anything: the blobs go straight to the parent process over stdout.
"""
import base64
import ctypes
import json
import sys
from ctypes import wintypes

CRED_TYPE_GENERIC = 1
MATCH = ('copilot', 'github')


class CREDENTIAL(ctypes.Structure):
    _fields_ = [
        ('Flags', wintypes.DWORD),
        ('Type', wintypes.DWORD),
        ('TargetName', wintypes.LPWSTR),
        ('Comment', wintypes.LPWSTR),
        ('LastWritten', wintypes.FILETIME),
        ('CredentialBlobSize', wintypes.DWORD),
        ('CredentialBlob', ctypes.POINTER(ctypes.c_byte)),
        ('Persist', wintypes.DWORD),
        ('AttributeCount', wintypes.DWORD),
        ('Attributes', ctypes.c_void_p),
        ('TargetAlias', wintypes.LPWSTR),
        ('UserName', wintypes.LPWSTR),
    ]


def load_api():
    api = ctypes.WinDLL('advapi32', use_last_error=True)
    api.CredEnumerateW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(ctypes.POINTER(ctypes.POINTER(CREDENTIAL))),
    ]
    api.CredEnumerateW.restype = wintypes.BOOL
    api.CredReadW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(ctypes.POINTER(CREDENTIAL)),
    ]
    api.CredReadW.restype = wintypes.BOOL
    api.CredFree.argtypes = [ctypes.c_void_p]
    api.CredFree.restype = None
    return api


def enumerate_targets(api):
    count = wintypes.DWORD()
    array = ctypes.POINTER(ctypes.POINTER(CREDENTIAL))()
    if not api.CredEnumerateW(None, 0, ctypes.byref(count), ctypes.byref(array)):
        return []
    targets = []
    for index in range(count.value):
        entry = array[index]
        if not entry:
            continue
        targets.append(entry.contents.TargetName or '')
    return targets


def read_blob(api, target):
    entry = ctypes.POINTER(CREDENTIAL)()
    if not api.CredReadW(target, CRED_TYPE_GENERIC, 0, ctypes.byref(entry)):
        return None
    try:
        item = entry.contents
        blob = ctypes.string_at(item.CredentialBlob, item.CredentialBlobSize)
        return base64.b64encode(blob).decode('ascii')
    finally:
        api.CredFree(ctypes.cast(entry, ctypes.c_void_p))


def main():
    if not sys.platform.startswith('win'):
        print(json.dumps({'creds': []}))
        return
    api = load_api()
    found = []
    for target in enumerate_targets(api):
        lowered = target.lower()
        if not any(key in lowered for key in MATCH):
            continue
        blob = read_blob(api, target)
        if blob:
            found.append({'target': target, 'blob': blob})
    print(json.dumps({'creds': found}))


if __name__ == '__main__':
    main()
