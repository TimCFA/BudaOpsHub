"""PIN hashes for tests. The app stores Manage PINs as werkzeug hashes and
checks whatever method the stored hash names, so a test can seed one made the
cheap way: same format, same code path through the app, without paying for a
real scrypt (about 85 ms) on every sign-in a test makes. That was 82 of the
suite's 140 seconds (Nov 10 2026). PINs the app itself hashes during a test
(a PIN change) still use the real method.
"""
from werkzeug.security import generate_password_hash as _real


def generate_password_hash(pin):
    return _real(pin, method='pbkdf2:sha256:1')
