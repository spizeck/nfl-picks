# Changelog

## 1.1.0

### Added

- Installable NFL Picks PWA metadata, standard/maskable/Apple icons, native install support, and platform-specific fallback instructions.
- Minimal offline navigation fallback that explains games and picks require a connection.
- User-controlled service-worker update prompt that will not reload while picks are unsaved.
- Visible pick-save confirmation and authenticated server-side profile synchronization.

### Fixed

- Google popup sign-in now reports actionable failures while preserving the verified popup flow.
- Current NFL season/week selection uses explicit ESPN season and season-type qualification.
- January/February postseason games map to the preceding NFL season; internal postseason weeks remain 19–22 and skip the Pro Bowl.
- Stale, mixed, partial, empty, or wrongly labeled schedule responses cannot become trusted schedules.
- Firestore schedules require a fresh exact event-ID synchronization marker.
- Pick saves verify HTTP results, game identity, selected team, and kickoff locking.

### Verified

- 2026 regular-season Week 1 schedule identity against live ESPN data and the official NFL schedule.
- Google sign-in, leaderboard profile creation, week navigation, schedule refresh, and pick save/reload against isolated staging Firebase data.
- TypeScript, ESLint, regression tests, Cloud Functions compilation, and the Next.js production build.

### Outstanding limitations

- Physical-device iOS and Android standalone installation have not yet been verified.
- The PWA intentionally provides no offline game data, offline pick queue, push notifications, or background synchronization.
- Firebase Cloud Functions require a separate deployment after Vercel; merging alone does not update scheduled writers.
- Historical mislabeled Firestore game records remain pending separately approved repair. Existing 2025 picks and statistics were not modified.
