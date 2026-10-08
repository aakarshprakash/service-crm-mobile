# Servon Technician (mobile app)

React Native app for field technicians, built with Expo SDK 57 and Expo Router. It talks to the same Laravel API as the web app (`service-crm-backend`, `/api/v1`) using a Sanctum token from `POST /auth/token`.

## What technicians can do

| Tab | Features |
| --- | --- |
| **Home** | Punch in / out (GPS, geofence-aware), service in progress, job counts, today's & overdue visits, cash in hand, assets issued to them |
| **My jobs** | Open / active / pending / done lists, search by call ID, phone or serial, infinite scroll |
| **Job** | Customer call, WhatsApp, Google Maps directions; complaint, product & warranty; visit history; **Start service** (on site needs location); collect an unpaid balance |
| **Visit** | Live timer; correct call details; photos by type (camera or gallery, several at once); add/remove parts with stock check; **customer signature**; complete as completed / pending / cancelled with charges and payment |
| **Payments** | Cash, UPI, cheque, bank or credit; **UPI QR** the customer scans (from the company's UPI accounts), then enter the UPI reference |
| **My cash** | Expected cash in hand, today's collections, daily cash close (in order), recent closes |
| **Parts** | Search spares / consumables, stock at your branch and every other branch |
| **Me** | Attendance calendar, leave balances, apply / cancel leave, payslip PDFs, notification status + test, sign out |

Push notifications (new job, reschedule, leave decision, asset issued) open the right screen when tapped.

## Photo uploads that never get lost

Photos and signatures go through a persistent upload queue (`src/lib/uploads.ts`):

- Each photo is resized on the phone (max 1600 px JPEG) and copied into the app's own storage before anything is sent, so closing the app, losing signal or Android killing the app doesn't lose it.
- Files go up one at a time through the native uploader with a progress bar. Dropped connections, slow networks (stall watchdog) and server errors retry automatically with back-off, and resume when the network comes back or the app reopens.
- Only a refusal from the server (for example, the visit was already closed) stops retrying; the thumbnail turns red and the technician can retry or remove it.
- Completing a visit waits for that visit's uploads to finish first.
- If Android closes the app while the camera is open, the photo is recovered on restart.
- The server also accepts raw camera photos up to 25 MB and shrinks them to 2000 px, as a safety net.

## Customer signature

On **Complete**, the technician can hand the phone to the customer to sign. The signature and the signer's name are uploaded with the visit and printed on the invoice PDF. The company can make it mandatory in the web app: **Settings → Preferences → Require customer signature**.

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

## Push notifications (Firebase)

Push needs one Firebase project, set up once:

1. In the [Firebase console](https://console.firebase.google.com) create a project, then **Add app → Android** with package name `com.servon.technician`.
2. Download **google-services.json** into this folder (next to `app.json`; it is gitignored). `app.config.js` picks it up automatically, then rebuild the APK.
3. **Project settings → Service accounts → Generate new private key**. Save the JSON on the API server and set in the backend `.env`:
   ```
   PUSH_DRIVER=fcm
   FCM_CREDENTIALS=/full/path/to/firebase-service-account.json
   ```
4. Run the queue worker with the notifications queue: `php artisan queue:work --queue=notifications,default,exports`.
5. On the phone: **Me → Notifications → Send test notification**.

An APK built without `google-services.json` works normally; the Me tab just shows notifications as unavailable.

## Checks

```bash
npm run typecheck             # tsc --noEmit
npx expo-doctor               # dependency / config checks
npx expo export --platform android   # bundles the JS, catches Metro errors without an Android SDK
```

## Build the APK on this PC (no Expo account needed)

Tools (already installed here): JDK 17 in `D:\tools\jdk17`, Android SDK in `D:\tools\android-sdk` (platform 36, build-tools 36, NDK 27.1, CMake 3.22).

The default server address baked into the APK comes from `EXPO_PUBLIC_API_URL`. For release builds export the live API first (`export EXPO_PUBLIC_API_URL=https://service-crm.peoplenex.online`); otherwise the LAN address in `.env.local` is used. Technicians can change it on the sign-in screen. Delete `android/app/build/generated/assets/react` when you change it so the JS bundle is rebuilt. Then, from Git Bash:

```bash
export JAVA_HOME=/d/tools/jdk17 ANDROID_HOME=D:/tools/android-sdk NODE_ENV=production
npx expo prebuild --platform android --clean      # regenerates android/ from app.json
echo "sdk.dir=D:/tools/android-sdk" > android/local.properties
# then point android/gradle/wrapper/gradle-wrapper.properties at the local copy:
#   distributionUrl=file:///D:/tools/gradle-9.3.1-bin.zip
subst S: 'D:\service-crm'                         # short path, see below
cd /s/service-crm-mobile/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
# → android/app/build/outputs/apk/release/app-release.apk
```

**Windows path length.** React Native's C++ build creates paths longer than Windows' 260-character limit. Building through a short drive letter (`subst S: D:\service-crm`) plus the `withShortCmakeObjectPaths` plugin keeps them under it. Alternatively enable long paths once as administrator (`LongPathsEnabled=1`). The Gradle distribution is a local file because one of GitHub's download servers is unreachable from this network.

**Testing on the emulator.** The release APK only contains ARM code; the x86_64 emulator can't load it. For emulator tests build a separate copy with `-PreactNativeArchitectures=x86_64` (don't ship that one).

**Release signing.** Release builds are signed with `credentials/servon-release.jks` (gitignored). Its passwords are in `%USERPROFILE%\.gradle\gradle.properties` (`SERVON_KEYSTORE*`), never in the repo. **Back up the keystore and those passwords somewhere safe**: Android only installs an update over an existing app if it is signed with the same key, and the Play Store needs it for every future release.

Plain `http://` server addresses are allowed (`usesCleartextTraffic`) so the app works against a LAN server; use `https://` in production.

### With EAS instead

Set the production API address in `eas.json`, then `npx eas-cli@latest build -p android --profile preview` (APK) or `--profile production` (Play Store .aab).

`android/` and `ios/` are generated (Continuous Native Generation) — configure native behaviour in `app.json` / `plugins/`, never edit those folders.

## Versioning

App version `2.1.1` (`app.json` → `version`, Android `versionCode` 211) ships with Servon 2.1. On start the app calls `GET /api/v1/version`; if the API's `min_mobile_version` is newer than the app, technicians see an "update required" banner. Bump both `version` and `versionCode` for every release.

## Layout

```
src/app/            screens (Expo Router: every file is a route)
  _layout.tsx       providers, error boundary, offline-aware queries, notification taps, upload queue start-up
  login.tsx
  (app)/(tabs)/     Home, My jobs, My cash, Parts, Me
  (app)/job/[id]    job detail, start service, collect balance
  (app)/visit/[id]  active visit: call, photos, parts, complete
src/components/     UI kit, signature pad, offline/upload status pill, QR code, UPI sheet, payment sheet, toasts
src/lib/            API client, auth (offline-safe), upload queue, photo prep, formatting, location, push, UPI, types
plugins/            config plugin for release signing
```
