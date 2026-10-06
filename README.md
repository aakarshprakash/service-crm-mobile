# Servon Technician (mobile app)

React Native app for field technicians, built with Expo SDK 57 and Expo Router. It talks to the same Laravel API as the web app (`service-crm-backend`, `/api/v1`) using a Sanctum token from `POST /auth/token`.

## What technicians can do

| Tab | Features |
| --- | --- |
| **Home** | Punch in / out (GPS, geofence-aware), service in progress, job counts, today's & overdue visits, cash in hand, assets issued to them |
| **My jobs** | Open / active / pending / done lists, search by call ID, phone or serial, infinite scroll |
| **Job** | Customer call, WhatsApp, Google Maps directions; complaint, product & warranty; visit history; **Start service** (on site needs location); collect an unpaid balance |
| **Visit** | Live timer; correct call details; photos by type (camera or gallery, resized before upload); add/remove parts with stock check; complete as completed / pending / cancelled with charges and payment |
| **Payments** | Cash, UPI, cheque, bank or credit; **UPI QR** the customer scans (from the company's UPI accounts), then enter the UPI reference |
| **My cash** | Expected cash in hand, today's collections, daily cash close (in order), recent closes |
| **Parts** | Search spares / consumables, stock at your branch and every other branch |
| **Me** | Attendance calendar, leave balances, apply / cancel leave, payslip PDFs, sign out |

Push notifications (new job, reschedule, leave decision, asset issued) open the right screen when tapped.

## Run it in development

```bash
npm install
cp .env.example .env          # set EXPO_PUBLIC_API_URL to your computer's LAN IP
npx expo start
```

The phone must reach the API, so start Laravel on all interfaces:

```bash
cd ../service-crm-backend
php artisan serve --host=0.0.0.0 --port=8000
```

Technicians can also change the server address on the sign-in screen (**Server · Change**).

Demo login: `ravi@demo.test` / `Demo@12345` (after running the backend's `DemoSeeder`).

> **Expo Go vs development build.** Most screens work in Expo Go. Push notifications on Android need a development build (`npx expo run:android` or `npx eas-cli@latest build --profile development`) plus Firebase: add `google-services.json` and set `"android.googleServicesFile"` in `app.json`. The API sends push through FCM (`PUSH_DRIVER=fcm`).

## Checks

```bash
npm run typecheck             # tsc --noEmit
npx expo-doctor               # dependency / config checks
npx expo export --platform android   # bundles the JS, catches Metro errors without an Android SDK
```

## Build an APK / store bundle

Set the production API address in `eas.json` (`EXPO_PUBLIC_API_URL` under `preview` / `production`), then:

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # installable APK
npx eas-cli@latest build -p android --profile production   # Play Store .aab
```

`android/` and `ios/` are generated (Continuous Native Generation) — configure native behaviour in `app.json`, never edit those folders.

## Versioning

App version `2.1.0` (`app.json` → `version`, Android `versionCode` 210) ships with Servon 2.1. On start the app calls `GET /api/v1/version`; if the API's `min_mobile_version` is newer than the app, technicians see an "update required" banner. Bump both `version` and `versionCode` for every release.

## Layout

```
src/app/            screens (Expo Router: every file is a route)
  _layout.tsx       providers, auth-protected stack, notification taps, update check
  login.tsx
  (app)/(tabs)/     Home, My jobs, My cash, Parts, Me
  (app)/job/[id]    job detail, start service, collect balance
  (app)/visit/[id]  active visit: call, photos, parts, complete
src/components/     UI kit, QR code (react-native-svg), UPI sheet, payment sheet, toasts
src/lib/            API client, auth, formatting, location, push, UPI links, types
```
