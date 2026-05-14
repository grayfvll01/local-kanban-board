# Release Staging

This folder is for local release staging only.

Public distribution should happen through GitHub Releases. Each public release should attach the generated Windows executable or installer from the Tauri build output.

Do not commit large generated release artifacts unless that is intentional for a specific release workflow. The repository `.gitignore` excludes common Windows release artifacts in this folder.
