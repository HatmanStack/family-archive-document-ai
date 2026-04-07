# Ancestry Tree Exporter

Chrome extension that exports person data from Ancestry.com family trees directly to clean JSON files.

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select this directory
4. Log into Ancestry.com in your browser

## Usage

1. Click the extension icon → "Open Exporter in New Tab"
2. Either:
   - **Load a GEDCOM file**: Select a `.ged` exported from Ancestry to auto-populate Tree ID and Person IDs
   - **Manual entry**: Enter Tree ID and comma-separated Person IDs
3. Set delay between pages (5-30 seconds recommended to avoid rate limiting)
4. Click "Start Export"

## How It Works

For each person, the extension:

1. **Facts page** → Extracts person metadata, timeline events, and family relationships
2. **Story page** → Extracts narrative summary and detailed event descriptions
3. **Gallery page** → Extracts media metadata (image URLs, titles)

Data is parsed inline from the DOM - no intermediate HTML files are saved.

## Output

Creates `ancestry_export/{personId}.json` for each person (~2KB each):

```json
{
  "id": "302295951925",
  "treeId": "176147288",
  "name": {
    "given": "Sarah Ann",
    "surname": "Goode",
    "full": "Sarah Ann Goode"
  },
  "gender": "Female",
  "living": false,
  "relationship": "11th great-grandmother",
  "birth": { "date": "1625", "place": "Salem,Essex,Massachusetts,USA" },
  "death": { "date": "1679", "place": "Salem, Essex, Massachusetts, United States" },
  "summary": "Sarah Ann Goode was born in 1625 in Salem, Massachusetts. She had one daughter with Richard Lambert in 1646. She died in 1679 in her hometown at the age of 54.",
  "events": [
    {
      "eventId": "905430647520",
      "type": "Birth",
      "narrative": "Sarah Ann Goode was born in 1625 in Salem, Massachusetts.",
      "dateLine": "1625 • Salem,Essex,Massachusetts,USA",
      "linkedPerson": null
    },
    {
      "type": "Birth of daughter",
      "narrative": "Her daughter Elizabeth was born in 1646 in Salem, Massachusetts.",
      "dateLine": "1646 • Salem, Essex, Massachusetts, United States",
      "linkedPerson": { "id": "302295951888", "name": "Elizabeth Lambert", "lifespan": "1646–1711" }
    }
  ],
  "family": {
    "parents": [],
    "spouses": [{ "id": "302295951916", "name": "Richard Lambert", "lifespan": "1612–1657" }],
    "children": [{ "id": "302295951888", "name": "Elizabeth Lambert", "lifespan": "1646–1711" }]
  },
  "media": [
    {
      "id": "b1d7aaf2-627c-406f-a746-fe74c4199b71",
      "title": "MASS FLAG",
      "thumbnailUrl": "https://www.ancestry.com/api/media/...",
      "downloadUrl": "https://www.ancestry.com/api/media/..."
    }
  ],
  "primaryImage": {
    "id": "b1d7aaf2-627c-406f-a746-fe74c4199b71",
    "url": "https://www.ancestry.com/api/media/..."
  }
}
```

## Download Images

Use the included script to download images after export:

```bash
node download-images.cjs [export-dir] [output-dir] [cookies-file]
node download-images.cjs ./ancestry_export ./images ./cookies.json
```

**Cookies file**: Export your Ancestry cookies as JSON to authenticate downloads:

```json
[
  { "name": "authentication", "value": "...", "domain": ".ancestry.com" }
]
```

Use a browser extension like "EditThisCookie" or "Cookie-Editor" to export cookies.

## Finding Your Tree ID

Your Tree ID is in the URL when viewing your tree:

```text
https://www.ancestry.com/family-tree/tree/176147288/family
                                         ^^^^^^^^^ Tree ID
```

Or load your GEDCOM file - the Tree ID is extracted automatically.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome extension manifest (MV3) |
| `popup.html/js` | Extension popup - opens exporter |
| `exporter.html/js` | Main UI and scraping/parsing logic |
| `download-images.cjs` | Node.js script to download images |
