# Logan1 realtor partners

Each agent gets a **unique co-branded link** without changing code.

## Add a new agent (5 minutes)

1. **Copy the template**
   ```bash
   cp partners/example-agent.json partners/jane-smith.json
   ```

2. **Fill in `partners/jane-smith.json`**
   - `slug` — URL-safe id (e.g. `jane-smith`)
   - `name`, `brokerage`, `phone`, `phoneDisplay`, `email` (optional), `website`
   - `photo` — path under `assets/partners/` (e.g. `assets/partners/jane-smith.jpg`)
   - `logo` — brokerage logo under `assets/partners/`
   - Optional: `photoPage` (agent profile URL), `photoUrl` (direct image CDN link), `expAgentId`

3. **Add assets**
   ```bash
   # Save headshot + logo from agent's website into:
   assets/partners/jane-smith.jpg
   assets/partners/brokerage-logo.png
   ```

4. **Share link**
   ```
   https://martinimortgagegroup.com/mortgage-calculator/realtor.html?agent=jane-smith
   ```
   Apply links automatically include `ref=jane-smith` for tracking.

## Sync headshot from agent website

```bash
curl "http://127.0.0.1:8765/api/sync-partner-photo?slug=tyler-chestnutt"
```

If eXp/Cloudflare blocks auto-sync, download the headshot manually from the agent site and save to `assets/partners/{slug}.jpg`, or set `"photoUrl": "https://..."` in the JSON.

## Rules (don't lose attribution)

| Do | Don't |
|----|-------|
| One JSON file per agent (`partners/{slug}.json`) | Reuse the same slug for two agents |
| Unique `?agent=` link per realtor | One generic link for everyone |
| Keep `ref=` on apply URLs (automatic) | Strip query params when sharing |
| Copy `assets/partners/*` when deploying | Deploy without partner images |

## Optional URL overrides

For one-off co-branding without a JSON file:

```
/realtor.html?realtor_name=Jane+Smith&realtor_photo=...&realtor_logo=...&realtor_phone=9195551234
```

JSON file + `?agent=slug` is preferred for repeatable partner links.

## Lead capture

Buyer emails from the optional “Email my estimate” card are appended to `.leads.jsonl` with `agent` slug — route to your CRM from there.