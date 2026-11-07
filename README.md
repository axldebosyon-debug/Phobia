# Phobia 2.0

Messenger Banat bot with a password-protected dashboard. Group chats are turned on/off from the dashboard; the bot reconnects by itself and remembers its Facebook session.

## Quick start

1. `npm install` then set the environment variables below on your host and `npm start`.
2. Open the dashboard (`/`) and log in with `PHOBIA_PASSWORD`.
3. Paste your Facebook cookie / appstate under **Facebook cookie** and press **Connect session**.
4. Under **Target group chats**, set each group to Banat ON or OFF (or use All ON / All OFF).

## Everything is in the dashboard

- **Facebook login:** paste the c3c appstate JSON (or a cookie header), then Connect session.
- **Admin IDs:** who may use `!banat on/off/toggle` in chat.
- **Bot settings:** switch chat commands on/off, auto-on for new groups, send limit, cooldown, typo/shorthand/hesitation rates, and the reaction emoji.
- **Target group chats:** Banat ON/OFF per group, All ON / All OFF, and per-group options (typing indicator, reply delay, cooldown, quiet hours).

Settings are saved in `DATA_DIR/bot-settings.json`. On a host without a persistent disk they reset on redeploy, so set the defaults again or mount a disk. The variables below only set the starting defaults and the host-level secrets.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PHOBIA_PASSWORD` | Dashboard password. If unset, the built-in hash in `phobia-auth.js` is used. |
| `SESSION_SECRET` | 12+ random characters. Turns on encrypted session saving, so you do not paste the cookie again after a restart, and keeps dashboard logins valid across restarts. |
| `DATABASE_URL` | Optional Postgres/Neon URL. With `SESSION_SECRET`, the encrypted session is also stored there, so it survives redeploys on hosts with no disk (Render Free). |
| `DATA_DIR` | Where the encrypted session, admin IDs and group settings are written. Default `./data`. Needs a persistent disk to survive redeploys. |
| `FB_COOKIES` / `FB_APPSTATE` | Optional first-boot session instead of pasting in the dashboard. |
| `BOT_ADMIN_IDS` | Numeric Messenger IDs that may use `!banat on/off/toggle`. Also editable in the dashboard. |
| `SELF_URL` | Public URL of this service. It is pinged every 4 minutes so free hosts do not put it to sleep. `RENDER_EXTERNAL_URL` is used automatically on Render. |
| `FCA_PACKAGE` | Messenger library to load. Default: the bundled `lazymeta-fca`. |
| `PHOBIA_HEALTH_CHECK_MS` | Messenger health probe interval (default 300000, `0` = off). Three failed probes trigger a reconnect. |
| `PHOBIA_CHECKPOINT_MS` | How often the refreshed session is saved (default 600000). |

## How it stays up

- Session is saved encrypted (AES-256-GCM) after every successful login and every 10 minutes, and restored at boot.
- A health probe reconnects the listener if Messenger goes silent; login retries back off automatically, and stop on a rejected session so the account is not hammered.
- Graceful shutdown saves the session; crashes in handlers are logged instead of killing the process.

## License mode

With none of `ECLIPSE_LICENSE_SERVER_MODE`, `ECLIPSE_LICENSE_SERVER_URL` or `ECLIPSE_LICENSE_PUBLIC_KEY` set, the bot runs standalone and authorizes itself. Setting any of them restores the license enforcement described below.

---

# Phobia

## Runtime

- Node.js 18 or newer (Node 22 recommended).
- Start command: `npm start`
- Health endpoint: `/health`
- Dashboard: `/` or `/dashboard`
- Dashboard API: origin-restricted `/api/dashboard/*` endpoints; owner-only Security management endpoints additionally require the dashboard API key.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `FB_COOKIES` | Facebook cookie/header string for the bot session. |
| `FB_APPSTATE` | Alternative exported cookie/appstate JSON format. Use one session variable, not both. |
| `ECLIPSE_DASHBOARD_ORIGIN` | Allowed dashboard origin(s), comma-separated when more than one is needed. |
| `BOT_ADMIN_IDS` | Comma-, semicolon-, or whitespace-separated Messenger user IDs allowed to use `!banat on`, `!banat off`, and `!banat toggle`. Required for remote state changes; leave unset to deny everyone. |

Optional:
- `BOT_ADMIN_IDS=123456789,987654321` — configure the Messenger sender IDs that may change Banat state. Do not use Facebook names; use numeric Messenger user IDs.
- `ECLIPSE_DASHBOARD_API_KEY` — long random key required for owner-only Security management endpoints; normal dashboard API access remains origin-restricted.
- `BANAT_DEFAULT_ON=true` enables Banat automatically in threads after incoming messages.
- `BANAT_GLOBAL_SEND_LIMIT=2` limits concurrent outgoing messages.
- `BANAT_THREAD_COOLDOWN_MS=12000` sets a per-thread send cooldown.

Never commit Facebook cookies or dashboard keys. Prefer setting them as private service environment variables. The dashboard can accept a cookie header or JSON appstate export and keeps the normalized session in process memory only. On Render Free, local files and process memory are temporary. Facebook sessions must be re-entered after restart/spin-down, and a client installation identity may need owner reapproval if its local identity file is lost. Do not commit or share session values.


## ECLIPSE licensing and authorized deployments

This repository is the owner-controlled upstream for Test Bot 2.0. Do not publish deployment credentials, Facebook sessions, signing keys, or private license data.

### Owner service (the original Render deployment)

Configure these private Render environment variables on the original Test Bot service:

| Variable | Purpose |
| --- | --- |
| `ECLIPSE_LICENSE_SERVER_MODE=true` | Enables the original deployment as the license authority. |
| `ECLIPSE_LICENSE_PRIVATE_KEY` | Ed25519 private key in PEM format; keep this only on the owner service. |
| `ECLIPSE_DASHBOARD_API_KEY` | Long random key required only for owner-only Security management endpoints. |
| `ECLIPSE_DASHBOARD_ORIGIN` | Comma-separated allowed dashboard origins, including the main ECLIPSE dashboard origin. |
| `ECLIPSE_LICENSE_DATABASE_URL` | Neon PostgreSQL connection string used for the durable owner registry. `DATABASE_URL` is accepted as a fallback. |

The owner registry is stored in Neon PostgreSQL, so the original Test Bot does not need a Render persistent disk. Create a Neon project and database, then copy its pooled connection string into `ECLIPSE_LICENSE_DATABASE_URL` on the original Test Bot Render service. Keep the connection string private. The application creates its tables and stores the owner installation identity, installation approvals/revocations, and security events automatically. Use the pooled connection string with SSL enabled. Render Free local files are temporary and must not be used as the owner registry.

Generate a signing keypair on a trusted local machine (never in a public repository):

```bash
node -e "const c=require('crypto');const k=c.generateKeyPairSync('ed25519');console.log('PRIVATE KEY\n'+k.privateKey.export({type:'pkcs8',format:'pem'}));console.log('PUBLIC KEY\n'+k.publicKey.export({type:'spki',format:'pem'}))"
```

Store the private key only in the original service's Render environment. Keep the matching public key for authorized client installations.

### Authorized client deployments

A deployment that runs the protected version must have:

- `ECLIPSE_LICENSE_SERVER_URL`: the original owner's Test Bot service URL.
- `ECLIPSE_LICENSE_PUBLIC_KEY`: the matching Ed25519 public key.
- `ECLIPSE_SECURITY_DATA_DIR` (optional): local directory for its installation identity. On Render Free, the local identity file can be lost after spin-down/redeploy, which creates a new pending installation that must be approved again. This does not erase the owner registry in Neon.
- `ECLIPSE_FORK_REPOSITORY` (optional): the fork's `owner/repository` name so the owner registry can label it.

New installations appear as pending in the owner's Security panel. The owner must approve them before Messenger login starts. Revoked installations stop processing when the next license check is received. Signed leases are short-lived; temporary authority outages are tolerated only while a previously issued lease remains valid.

### Existing forks

Forks that are already running the older version are not remotely changed by this release and may continue running their current code. If an existing fork updates to this protected version, it must be registered and approved by the owner before it can start. Existing forks are not automatically revoked merely because the protection is introduced.

### Important limits

GitHub monitoring detects public GitHub forks of the upstream repository; it cannot reliably discover private copies, downloaded archives, or code redistributed elsewhere. The license check protects deployments that retain this enforcement code and depend on the owner's license authority. Someone who removes or rewrites the check can bypass it, so never include private credentials or signing keys in the repository.

## Banat commands

Send these in the target Messenger group:
- `!banat on`
- `!banat off`
- `!banat toggle`
- `!banat status`
- `!banat help`

Only IDs listed in `BOT_ADMIN_IDS` can run the state-changing `on`, `off`, and `toggle` commands. Status and help remain available to everyone. If no admin IDs are configured, state-changing commands are denied.

## Dashboard behavior

The dashboard displays session connection state, process state, uptime, Node version, memory, and recent dashboard control events. Start/pause buttons only resume or pause message processing; they do not log in, log out, or replace the Facebook session. The event list is in-memory and resets when the process restarts.

The dashboard API's origin check is controlled by `ECLIPSE_DASHBOARD_ORIGIN`. Dashboard-provided Facebook sessions are process-memory-only and are cleared by restarts or Render Free spin-downs.

## Safety and deployment

Keep this branch separate until syntax checks and a real test session are verified. Do not deploy solely because the dashboard page loads. Confirm the dashboard API key, CORS origin, session login, command handling, direct targeting, thread cooldown, and pause/resume behavior before merging.


## Raid Mode (Test Bot instance)

Raid Mode is a dashboard-only persistent group-theme enforcer. It can enforce the selected group's title, one configured nickname across all current members, and the configured group photo. It does not send Messenger activation or confirmation messages.

The Test Bot's Raid Mode state is stored under the `test-bot` namespace. Theme metadata is stored in the separate `eclipse_raid_themes` table; selected groups and enforcement history use `eclipse_raid_groups` and `eclipse_raid_events`. These tables do not overlap with the Anti-Fork licensing tables. A second bot can use the same Neon database and theme ID while keeping a different bot namespace and its own independent group activation state/dashboard.

Configure these private Render environment variables before using Raid Mode:

| Variable | Purpose |
| --- | --- |
| `ECLIPSE_RAID_DATABASE_URL` | Neon PostgreSQL connection string. If omitted, the existing `ECLIPSE_LICENSE_DATABASE_URL` or `DATABASE_URL` is used. |
| `ECLIPSE_RAID_S3_ENDPOINT` | S3-compatible object-storage endpoint, such as a Cloudflare R2 account endpoint. |
| `ECLIPSE_RAID_S3_BUCKET` | Private bucket used for Raid Mode theme images. |
| `ECLIPSE_RAID_S3_ACCESS_KEY_ID` | Object-storage access key ID. |
| `ECLIPSE_RAID_S3_SECRET_ACCESS_KEY` | Object-storage secret access key. |
| `ECLIPSE_RAID_S3_REGION` | S3 signing region; use `auto` for Cloudflare R2. |
| `ECLIPSE_RAID_THEME_ID` | Optional theme key. Defaults to `shared`; use the same value across bot instances only when intentionally reusing one theme. |
| `ECLIPSE_RAID_BOT_NAMESPACE` | Optional group-state namespace. Test Bot defaults to `test-bot`. |

The dashboard management endpoints require the existing `X-ECLIPSE-DASHBOARD-KEY` configured through `ECLIPSE_DASHBOARD_API_KEY`. Enter that key in the Raid Mode panel; it is sent as a request header and is not saved in browser storage. Upload accepts PNG, JPEG, or WebP up to 5 MB. Image bytes are stored in the private S3-compatible bucket; only the object key and metadata are stored in Neon.

Activation requires a saved theme, uploaded photo, selected group(s), and explicit dashboard confirmation. Event-driven repairs listen for group title/photo, nickname, and membership/admin mutations. A 10-minute reconciliation loop provides a fallback; the image is re-applied at most every 30 minutes during periodic reconciliation. Failed repairs record dashboard-visible status and use bounded backoff, with longer waits for rate-limit responses. Emergency Stop disables enforcement for all groups in this Test Bot namespace.

Before activation, verify the Neon and object-storage settings, dashboard API key, Messenger session permissions, and image bucket access. Do not deploy this feature until a live group test confirms all three Messenger mutations and event delivery.

## FCA library (Messenger client)

The Messenger library is selected with environment variables, so you can switch to your Lazymeta FCA build without editing code:

| Variable | Purpose |
| --- | --- |
| `FCA_PACKAGE` | npm package (or GitHub install name) of the FCA to load. Default: `lazymeta-fca` (bundled in `./lazymeta-fca`). |
| `FCA_SESSION_FORMAT` | `cookie` or `appstate`. Auto: `cookie` for ws3-fca, `appstate` for everything else. |
| `FCA_TYPING_STYLE` | `ws3` (`sendTypingIndicator(active, threadID, cb)`) or `legacy` (`sendTypingIndicator(threadID, cb)` returning a stop function). Auto-detected like above. |

Install your build (`npm i <package>`), then set `FCA_PACKAGE=<package>` on the host. `lazymeta-fca` wraps `ws3-fca`, which does the actual Messenger transport, and is installed automatically by `npm install`.
