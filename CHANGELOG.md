# Changelog

## 1.1.0 — 2026-10-27

Installs over 1.0.0; accounts and settings are kept.

### Added
- **Info** button in the photo viewer: a panel with the photo's date, place, people, tags, camera and exposure, and file details, as in Memories' info sidebar. Back or Info closes it.

### Changed
- Runs on **webOS TV 23 and newer** (2023 models onwards), instead of webOS TV 26 only: the app is built for Chromium 94.

## 1.0.0 — 2026-10-27

First stable release.

**Upgrading from 0.9.0:** the app ID changed from `com.wisp.memoriestv` to `eu.whisprin.memoriestv`, so webOS installs 1.0.0 as a separate app. Remove the old Memories TV from the TV and sign in again: accounts and settings don't carry over. Removing the old app doesn't revoke its app password; revoke the old "Memories TV" entry in Nextcloud under **Settings → Security**.

### Changed
- App ID `eu.whisprin.memoriestv`, vendor Whisprin.
- Sign-in shows only the QR code. The written-out sign-in link was too long to fit on screen or to type.
- The navigation rail is wider, so "Favourites" and "On this day" are no longer cut off.
- The release is built with Node.js 24.

### Fixed
- The welcome screen's subtitle is centred.
- The white box behind the sign-in QR code has square corners all round.

## 0.9.0 — 2026-10-27

First release of Memories TV, a read-only Nextcloud Memories client for LG webOS TVs, forked from [immich-tv-webos](https://github.com/Seeky91/immich-tv-webos).

- **Sections**, in Memories' order: Timeline, Folders, Favourites, Albums, People (Recognize or Face Recognition), Archive, On this day, Places and Tags. Explore, Map and Trash are not included yet.
- **Viewer and video**: full-screen photos with a local rotate option, and videos played from the original file with seeking, including HDR video.
- **Slideshow** with crossfades, shuffle and an adjustable interval, keeping the TV's screen saver away.
- **RAW files**: a RAW badge, and RAW files stacked behind the JPG or HEIC of the same name when Memories' *Stack RAW files with same name* is on.
- **Sign-in with your phone** through a QR code (Nextcloud Login Flow), with several accounts and switching between them.
- **Error and empty screens** written for Nextcloud: TV offline, server unreachable or in maintenance mode, revoked sign-in, with **Try again**.
