# PetPooja – Revenue Intelligence Engine

A fully local, browser-based restaurant revenue analytics dashboard built with React.

## Quick Start

### Prerequisites
- Node.js 16+ (https://nodejs.org)
- npm 8+

### Setup & Run

```bash
# 1. Extract this zip
unzip petpooja-intelligence.zip
cd petpooja-intelligence

# 2. Install dependencies (one time)
npm install

# 3. Start the app
npm start
```

The app opens automatically at **http://localhost:3000**

---

## How to Use

1. Click **"Run Revenue Analysis"** after uploading both CSV files
2. Drag & drop or browse for your files:
   - `menu_items.csv` — your menu with pricing & cost data
   - `transactions.csv` — your POS transaction history

### Required CSV columns

**menu_items.csv**
```
item_id, item_name, category, subcategory, selling_price, food_cost,
contribution_margin, margin_pct, status
```
> Only rows where `status = Active` are analysed.

**transactions.csv**
```
order_id, transaction_date, item_id, item_name, category, subcategory,
quantity, unit_price, line_revenue, line_contribution_margin
```

---

## Dashboard Sections

| Tab | Description |
|-----|-------------|
| **Overview** | KPIs, Revenue by Category bar chart, Margin % spider chart, Top 10 items by profit |
| **Menu Matrix** | Stars / Hidden Gems / Watch List / Laggards classification |
| **Combos** | Cuisine-matched combo opportunities with lift, confidence & bundle pricing. Filter by Strong / Moderate / Weak |
| **Upsell** | Top items with 3 cuisine-compatible upsell suggestions each |
| **Pricing** | Price optimization cards with uplift potential. Filter by High / Medium / Low priority |
| **Hidden Gems** | High-margin low-volume items with promotion strategy |
| **Watch List** | High-volume low-margin items with pricing/cost recommendations |

---

## Subcategory Pairing Rules

Combos and upsells are only suggested between **cuisine-compatible** subcategories:

| Cuisine | Compatible with |
|---------|----------------|
| Italian | Italian, Western beverages |
| Mexican | Mexican, Western beverages |
| Fast Food | Fast Food, Western beverages |
| Asian | Asian, Indian beverages |
| North Indian | North Indian, Indian beverages |
| South Indian | South Indian, Indian beverages |

---

## Build for Production

```bash
npm run build
```
Outputs a static site to `build/` that can be hosted anywhere (Netlify, Vercel, S3, etc.)

---

*All data processing happens 100% in the browser — no server, no API calls, no data leaves your machine.*
