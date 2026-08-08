# Grok Workbench Mobile

iOS/Android client, directly connected to the existing Grok2API server:

- Default server: `http://192.168.123.195:38695`
- Direct calls: `/healthz`, `/v1/models`, `/v1/images/generations`, `/v1/images/edits`
- No custom backend/proxy server
- Video is intentionally skipped for now

## Dev

```bash
cd apps/mobile
npm install
npm start
```

Or from the repo root:

```bash
npm start
```

Fill the Grok2API Base URL and full client key in the app settings.

## Build APK / IPA

This project is configured for EAS cloud builds:

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build:configure
npm run build:android:apk
npm run build:ios:ipa
```

Android APK uses the `preview` profile. iOS IPA requires an Apple developer
account and EAS credentials.
