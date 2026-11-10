# Installation and updates

## Install Qwen Code

**Windows (PowerShell):**

```powershell
irm https://qwen-code.oss-accelerate.aliyuncs.com/install.ps1 | iex
```

**Linux / macOS:**

```sh
curl -fsSL 'https://qwen-code.oss-accelerate.aliyuncs.com/install.sh' | bash
```

## Verify the executable

After installation, open a new terminal and run:

```sh
qwen --version
qwen --help
```

Check the version before following this documentation. An older installation may use different settings, authentication flows, or commands. If the command cannot be found, check that the directory containing the executable is on your shell's PATH. If multiple installations exist, check which executable your shell resolves before changing configuration.

The examples in this documentation use the executable name `qwen`.

## Check for an update

For a build with a configured release source:

```sh
qwen update --check
```

This checks availability without installing an update. To apply an available update:

```sh
qwen update
```

`qwen update` and `qwen rollback` manage native installations only. If you installed through npm (`@qwen-code/qwen-code`) or Homebrew (`qwen-code`), update with that package manager.

Restart Qwen Code after an update. An already running process continues using the code it loaded at startup. A build without a configured release source does not silently poll an assumed download service.

## Automatic updates

Interactive builds with a release source can check for updates after startup. Use the following user settings to disable automatic installation while retaining update notifications:

```json
{
  "general": {
    "enableAutoUpdate": false,
    "enableAutoUpdateNotification": true
  }
}
```

Set both values to `false` to disable both automatic installation and update notifications. These settings control the interactive update flow; explicit update commands are separate operations.

## Roll back

Return to the version that was active before the last update:

```sh
qwen rollback
```

This uses the previous version stored locally at the last update and does not contact the release source. It fails if no previous 1.x version from the same channel is recorded; in that case, specify a target:

```sh
qwen rollback --to '<version>'
```

Replace `<version>` with an actual version older than the active version; rollback rejects the current or a newer version. A version not stored locally is downloaded from the configured release source. A successful rollback pauses automatic updates for 24 hours. Rollback changes the installed program; it is not a backup or restore operation for project files, settings, or conversation data.

If an update or rollback fails, retain the error message and the current version. Check the release source and network access before retrying. Do not repeatedly change credentials to address a download failure.

## Next steps

Continue with [Quickstart](/en/users/quickstart/), or see [Troubleshooting](/en/users/troubleshooting/) if the executable fails to start.

