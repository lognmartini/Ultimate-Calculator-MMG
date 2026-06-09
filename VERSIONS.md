# Calculator versions

> **Compliance note:** All versions include TILA (Reg Z), RESPA, and NMLS-oriented disclaimers for **educational estimates**. This is not legal advice—have your compliance officer or counsel review before broad marketing use.

## Logan1 (realtor co-marketing)

**Purpose:** Co-branded payment calculator real estate agents share with buyers.

**Files:** `realtor.html` (deploy entry), `versions/Logan1/` (snapshot), `co-market.js`, `styles-co-market.css`, `partners/*.json`

### Set up an agent

1. Add headshot and brokerage logo under `assets/partners/` (e.g. `jane-smith.jpg`, `kw-logo.png`).
2. Create `partners/jane-smith.json`:

```json
{
  "name": "Jane Smith",
  "brokerage": "KW Raleigh",
  "phone": "9195551234",
  "phoneDisplay": "(919) 555-1234",
  "email": "jane@example.com",
  "photo": "assets/partners/jane-smith.jpg",
  "logo": "assets/partners/kw-logo.png"
}
```

3. Share: `https://martinimortgagegroup.com/mortgage-calculator/realtor.html?agent=jane-smith`

**URL overrides (no JSON file):**  
`?realtor_name=Jane+Smith&realtor_photo=assets/partners/jane.jpg&realtor_logo=assets/partners/logo.png&realtor_brokerage=KW`

**Example:** `realtor.html?agent=example-agent`

**Revert snapshot:** `./scripts/revert-to-logan1.sh` (restores Logan1 files to project root)

**Mobile preview:** `mobile-preview-logan1.html`

---

## Logan2 (full calculator — lead-optimized)

**Files:** `index.html`, `styles.css`, `styles-lead.css`

Long-form landing with hero, reviews, FAQ, official quote section.

**Open:** `http://127.0.0.1:8765/` · **Mobile:** `mobile-preview.html`

---

## Logan3 (step-by-step — social, Logan-branded)

**Files:** `go.html`, `styles-steps.css`, `steps-flow.js`

**Open:** `http://127.0.0.1:8765/go.html` · **Mobile:** `mobile-preview-logan3.html`

Logan headshot and personal contact on step 1. Use when the post is explicitly from Logan.

---

## Logan4 (step-by-step — social, team / company)

**Files:** `go4.html`, `styles-steps.css`, `steps-flow.js`, `lead-capture.js`

**Open:** `http://127.0.0.1:8765/go4.html` · **Mobile:** `mobile-preview-logan4.html`

Company-branded clone of Logan3: Martini Mortgage Group team card (no single-advisor headshot). **Share one link** for Kevin and Logan on open houses, Instagram, and Facebook.

**Example listing deep link:**

```
https://martinimortgagegroup.com/mortgage-calculator/go4.html?address=504+Tilden+St+Raleigh+NC+27605&price=1895000&utm_source=instagram&utm_campaign=open-house
```

**Attribution without separate pages:** append `?ref=kevin` or `?ref=logan` to the same URL. Apply buttons route to each LO’s Gold Star portal; leads store `assignedLo` in `.leads.jsonl`.

**CRM webhook (optional):** set `LEAD_WEBHOOK_URL` in `.env` to POST each lead to Zapier/CRM.

**Snapshot:** `versions/Logan4/go4.html`

---

## Compliance (all versions)

| Requirement | Implementation |
|-------------|----------------|
| **TILA Reg Z** | Not a LE/CD/commitment/rate lock; trigger-term disclosure (down, term, payment, APR) updates with inputs near PITI |
| **RESPA** | No required settlement-service provider; co-market separation for realtors |
| **NMLS** | Company #3446 and LO #1591485 in footer + link to nmlsconsumeraccess.org |
| **Equal Housing** | EHL logo in footer |

Shared script: `compliance.js`

---

## Run locally

```bash
cd mortgage-calculator
python3 server.py
```