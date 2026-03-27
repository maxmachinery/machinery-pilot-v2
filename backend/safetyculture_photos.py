#!/usr/bin/env python3
"""
safetyculture_photos.py — Extract and name inspection photos from a SafetyCulture PDF.

Uses the text layer to map "Photo N" references to flagged items, extracts the
embedded JPEG/PNG images, and saves them as {ItemName}_Photo_{N}.{ext} in
1_Urgent or 2_Next_Service subfolders.

Usage:
  python3 safetyculture_photos.py <pdf_path> <flagged_items_json> <output_dir>

Output: JSON array to stdout:
  [{"photo_number": 5, "item_name": "...", "status": "C-Urgent",
    "subfolder": "1_Urgent", "filename": "...", "path": "..."}]
"""
import fitz
import json
import sys
import os
import re


# Images smaller than this in either dimension are logos/decorations
MIN_DIM = 100
# Width/height ratio above this is a banner (not a square-ish inspection photo)
MAX_RATIO = 2.5


def sanitize(s, maxlen=50):
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", s or "").strip()
    s = re.sub(r"[\s-]+", "_", s)
    return s[:maxlen] or "Item"


def is_photo(w, h):
    """True if dimensions match an inspection photo (not a logo or wide banner)."""
    if min(w, h) < MIN_DIM:
        return False
    return 0.4 <= (w / h) <= MAX_RATIO


def page_photo_nums(text):
    """Extract all integer photo numbers from 'Photo N' patterns in text."""
    return [int(m) for m in re.findall(r'\bPhoto\s+(\d+)\b', text)]


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: safetyculture_photos.py <pdf_path> <flagged_items_json> <output_dir>"}))
        sys.exit(1)

    pdf_path      = sys.argv[1]
    flagged_items = json.loads(sys.argv[2])
    output_dir    = sys.argv[3]

    doc = fitz.open(pdf_path)

    # ── Build photo_number → item lookup ─────────────────────────────────────
    photo_to_item = {}
    for item in flagged_items:
        for pn in item.get("photo_numbers", []):
            photo_to_item[int(pn)] = {
                "item_name": item["item_name"],
                "status":    item.get("status", "C-Urgent"),
            }

    # ── Walk pages: pair "Photo N" text refs with embedded images ────────────
    # Both lists are built in document order; they must stay aligned.
    # Track seen xrefs so media-summary pages don't re-emit duplicates.
    ordered_photo_nums = []
    ordered_images     = []
    seen_xrefs         = set()

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()

        nums = page_photo_nums(text)
        imgs = []
        for img_tuple in page.get_images(full=True):
            xref = img_tuple[0]
            if xref in seen_xrefs:
                continue
            info = doc.extract_image(xref)
            if is_photo(info["width"], info["height"]):
                seen_xrefs.add(xref)
                imgs.append((xref, info))

        if not nums and not imgs:
            continue

        if len(nums) == len(imgs):
            # Perfect match — pair them directly
            for pn, img_pair in zip(nums, imgs):
                ordered_photo_nums.append(pn)
                ordered_images.append(img_pair)

        elif nums and not imgs:
            print(f"[WARN] Page {page_num+1}: {len(nums)} Photo refs but no images", file=sys.stderr)

        elif imgs and not nums:
            # Images present but no Photo N text (e.g. cover graphics) — skip
            print(f"[INFO] Page {page_num+1}: {len(imgs)} image(s) without Photo refs — skipped", file=sys.stderr)

        else:
            # Mismatch — more images than Photo refs, take the last N
            # (leading images are typically decorative headers)
            count = len(nums)
            tail  = imgs[-count:]
            print(f"[WARN] Page {page_num+1}: {len(nums)} refs vs {len(imgs)} images — using last {count}", file=sys.stderr)
            for pn, img_pair in zip(nums, tail):
                ordered_photo_nums.append(pn)
                ordered_images.append(img_pair)

    print(f"[INFO] Resolved {len(ordered_photo_nums)} photos: {ordered_photo_nums}", file=sys.stderr)

    # ── Save flagged-item photos ──────────────────────────────────────────────
    os.makedirs(output_dir, exist_ok=True)
    results = []

    for pn, (xref, info) in zip(ordered_photo_nums, ordered_images):
        item_info = photo_to_item.get(pn)
        if item_info is None:
            print(f"[SKIP] Photo {pn} — not linked to a flagged item", file=sys.stderr)
            continue

        item_name = item_info["item_name"]
        status    = item_info["status"]
        subfolder = "1_Urgent" if status == "C-Urgent" else "2_Next_Service"
        filename  = f"{sanitize(item_name, 40)}_Photo_{pn}.{info['ext']}"
        out_dir   = os.path.join(output_dir, subfolder)
        os.makedirs(out_dir, exist_ok=True)
        out_path  = os.path.join(out_dir, filename)

        with open(out_path, "wb") as f:
            f.write(info["image"])

        print(f"[OK] {subfolder}/{filename}  ({info['width']}x{info['height']}  {len(info['image'])//1024}KB)", file=sys.stderr)
        results.append({
            "photo_number": pn,
            "item_name":    item_name,
            "status":       status,
            "subfolder":    subfolder,
            "filename":     filename,
            "path":         out_path,
        })

    doc.close()
    print(json.dumps(results))


if __name__ == "__main__":
    main()
