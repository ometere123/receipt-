"""Platform compatibility for the pinned GenLayer Direct Mode harness.

The v0.29 loader redirects stdin to a temporary file before importing a
contract. Windows keeps that redirected handle open, so its unconditional
unlink raises PermissionError after the message has already been installed.
The contract runtime setup is complete at that point; swallow only that
Windows cleanup error so these remain genuine Direct Mode tests.
"""

import os

if os.name == 'nt':
    from gltest.direct import loader

    _original_inject = loader._inject_message_to_fd0

    def _windows_safe_inject(vm):
        try:
            _original_inject(vm)
        except PermissionError:
            pass

    loader._inject_message_to_fd0 = _windows_safe_inject
