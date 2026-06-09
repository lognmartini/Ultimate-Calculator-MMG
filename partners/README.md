# Realtor partner links (Logan5 wizard)

Each agent gets a **unique co-branded link** without changing code.

## Swap partners by URL only (no JSON file)

Pass agent details in the query string — works for one-off open houses or quick shares:

```
/realtor.html?realtor_name=Jane+Smith&brokerage=Keller+Williams&realtor_phone=9195551234
```

Optional URL params: `realtor_photo`, `realtor_logo`, `realtor_email`, `realtor_url`, `agent_title`

**Slug-only** (name auto-formatted from slug):

```
/realtor.html?agent=jane-smith
```

→ displays as "Jane Smith" even without a JSON file (no photo/logo unless you add params).

## Preferred: one JSON file per agent

1. Copy the template:
   ```bash
   cp partners/example-agent.json partners/jane-smith.json
   ```

2. Fill in `partners/jane-smith.json` (name, brokerage, phone, photo, logo, website).

3. Add images to `assets/partners/`.

4. Share:
   ```
   https://martinimortgagegroup.com/mortgage-calculator/realtor.html?agent=jane-smith
   ```

Apply links automatically include `ref=jane-smith` for tracking.

## Show the copy-link bar for agents

Add `&share=1` to reveal the partner share strip:

```
/realtor.html?agent=tyler-chestnutt&share=1
```

## Compliance (RESPA / NMLS)

- Agent is labeled **not a lender**; Martini Mortgage Group provides estimates only.
- Footer includes TILA/RESPA educational notice + NMLS #3446 / #1591485.
- Co-marketing disclosure states agents do not make credit decisions (see `compliance.js`).

## Lead capture

Buyer emails include the `agent` slug in `.leads.jsonl` for CRM routing.