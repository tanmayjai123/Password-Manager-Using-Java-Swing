# Password Manager: Java Swing + browser edition

This repository keeps the original Java Swing project in `desktop-source.zip` and adds **Keyspace**, a browser-only password-vault demo.

## Live website

https://tanmayjai123.github.io/Password-Manager-Using-Java-Swing/

The website is a new browser implementation of the project's core workflow, not the Java Swing program running inside a browser. It does not use the Java app's MySQL database.

## Browser features

- Create and unlock a local vault with a master password.
- Add, search, edit, copy and delete saved logins.
- Generate random passwords with uppercase, lowercase, numbers and symbols.
- Check password length and character variety. This is a simple estimate, not breach detection.
- Export and restore encrypted JSON backups.
- Lock manually or after five minutes without interaction.

## Run locally

Serve the website folder over localhost, for example with `python -m http.server 8080`, then open `http://localhost:8080`. Web Crypto requires HTTPS or localhost. No package installation or build is needed.

## Storage and encryption

The browser uses Web Crypto: PBKDF2-HMAC-SHA-256 with 600,000 iterations and a random 16-byte salt derives an AES-256-GCM key from the master password. Every save uses a fresh random 12-byte IV. The encrypted vault is kept in localStorage; the master password is not persisted. App names, usernames, passwords and notes are all inside the encrypted payload.

There is no backend, registration service, analytics or automatic syncing. Each browser profile, origin and device has a separate vault. Public repository visitors do not see other people's locally stored vaults. Browser storage is shared by origin, so other sites under the same GitHub Pages hostname can access the encrypted storage; repository paths are not a security boundary. Use a dedicated origin for any real vault.

## Important limits

**This is an educational demo, not a security-audited password manager. Use sample credentials only.**

- Forgotten master passwords cannot be recovered. Use a long, unique passphrase.
- Clearing site data, browser storage eviction or losing the browser profile can delete the vault. Export an encrypted backup regularly.
- Import replaces the current vault rather than merging it. Export before restoring. Restore backups from a different vault from the locked screen using that backup's master password.
- Browser extensions, malware, shared-device access and malicious code served from this origin can compromise an unlocked vault. Encryption at rest does not solve those threats.
- Copied passwords can remain on the clipboard; clear it after use.
- Auto-lock is best effort: browser suspension can delay timers. Lock manually before leaving the device.
- Do not edit the same vault in multiple tabs. Another tab's storage change locks this page, but simultaneous saves are not transactionally coordinated.
- No Java/MySQL vault migration is implemented. The two editions have different formats.

## Original Java desktop project

`desktop-source.zip` contains the supplied Maven project and its tests. Build outputs, IDE automation hooks and screenshots were excluded. Source files were preserved without converting the Java desktop code itself.

The original project specifies JDK 25 and requires MySQL plus `DB_URL`, `DB_USER`, `DB_PASSWORD` and a Base64-encoded 32-byte `PM_AES_KEY`. After extracting it, see its `README.md` and Java source. No real credentials or encryption keys are included. The ZIP did not supply a database schema, so the desktop setup is not a turnkey deployment.

This repository does not claim that the original Java app was executed or that its tests were rerun. The browser version is deployed separately as a static GitHub Pages site.
