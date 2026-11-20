# Network audit

How we checked what leaves the computer when Paceprint runs. Re-run it yourself with the steps below.

## Run 1 — Sat Nov 21 2026, ~01:00 WAT, Windows 11, SDK 3.5.0, telemetry disabled

**Method (OS level, covers the native SDK):** started `node dist/scripts/verify-sdk.js --seconds 25`
(the same SDK configuration the app uses: `enableTelemetry: false`) and polled
`Get-NetTCPConnection -OwningProcess <pid>` every 0.5 s, then reverse-resolved each remote address.
Separately compared total adapter bytes (`Get-NetAdapterStatistics`) over 30 s idle vs a 30 s SDK run.
Hostnames embedded in the SDK binaries were listed with `strings`.

**Findings**

| What | Observed |
|---|---|
| Remote hosts contacted | **One**: `76.223.65.59:443`, which is `cont-api.physiology.presagetech.com` (Presage API, AWS Global Accelerator). HTTPS. Connected at session start. |
| Other hosts | None seen. No analytics, no AI service, nothing else. |
| Downloaded during a 30 s session | ≈ 21 MB (SDK's processing models, fetched at session start; SDK logs name "model metadata" fetches) |
| Uploaded during a 30 s session | ≈ 1.3 MB for the whole computer (idle background ≈ 0.2 MB per 30 s; TCP acknowledgements for a 21 MB download ≈ 0.4 MB). Video at 720p/30 fps would need far more. |
| What the requests are for | SDK logs show API-key authentication and "usage verification" (credit metering) and model metadata/model fetches. |
| Content | Encrypted (TLS, pinned per Presage docs), so we cannot read it. |

**Presage's own statements** (docs/telemetry-and-privacy.md in the SmartSpectra repo, and the repo README):
the SDK computes vitals on-device; telemetry is opt-out (`enableTelemetry: false`), and when disabled
"the SDK starts no telemetry session and transmits nothing"; telemetry never attaches raw frames or
measured physiological values. Authentication can associate requests with the API-key account.

**Renderer:** Electron's `session.webRequest` logs every non-local request from the app window
(`[net] renderer request:` in the terminal, or `recordings/net-audit-renderer.log` with
`PACEPRINT_NET_AUDIT=1`). The app page makes no network requests; its Content Security Policy only
allows local files.

**Judge Mode:** never loads the SDK. No network traffic from Paceprint at all.

**What we cannot prove:** the exact content of the encrypted Presage requests. Our statement is
therefore: video frames are processed on this computer according to Presage, and the upload volume we
measured is consistent with that; we do not claim "nothing leaves your device".

## Re-run it

```powershell
npm run build
# terminal 1
node dist/scripts/verify-sdk.js --seconds 60
# terminal 2 (while it runs)
$id = (Get-Process node | Sort-Object StartTime | Select-Object -Last 1).Id
Get-NetTCPConnection -OwningProcess $id | Where-Object RemoteAddress -notin '0.0.0.0','::','127.0.0.1','::1'
nslookup <remote address>
```
