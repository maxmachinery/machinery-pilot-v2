#!/usr/bin/env python3
"""
safetyculture_extract_photos.py — Extract all inspection photos from a SafetyCulture PDF.

Walks pages in order, pairs "Photo N" text references with embedded images (deduped
by xref), and saves each as {photo_number}.{ext} in the output directory.

Usage:
  python3 safetyculture_extract_photos.py <pdf_path> <output_dir>

Output: JSON array to stdout:
  [{"photo_number": 5, "filename": "5.jpeg", "path": "...", "ext": "jpeg",
    "width": 493, "height": 370}]
"""
import fitz
import json
import sys
import os
import re


MIN_DIM   = 100    # px — below this is a logo/decoration
MAX_RATIO = 2.5    # w/h ratio above this is a wide banner, not a photo


def is_photo(w, h):
    if min(w, h) < MIN_DIM:
        return False
    return 0.4 <= (w / h) <= MAX_RATIO


def page_photo_nums(text):
    return [int(m) for m in re.findall(r'\bPhoto\s+(\d+)\b', text)]


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: safetyculture_extract_photos.py <pdf_path> <output_dir>"}))
        sys.exit(1)

    pdf_path   = sys.argv[1]
    output_dir = sys.argv[2]
    os.makedirs(output_dir, exist_ok=True)

    doc        = fitz.open(pdf_path)
    seen_xrefs = set()
    results    = []

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
        if nums and not imgs:
            print(f"[WARN] Page {page_num+1}: {len(nums)} Photo refs but no images", file=sys.stderr)
            continue
        if imgs and not nums:
            print(f"[INFO] Page {page_num+1}: {len(imgs)} image(s) without Photo refs — skipped", file=sys.stderr)
            continue

        if len(nums) == len(imgs):
            pairs = list(zip(nums, imgs))
        else:
            # More images than refs — skip leading decorative images, take last N
            count = len(nums)
            pairs = list(zip(nums, imgs[-count:]))
            print(f"[WARN] Page {page_num+1}: {len(nums)} refs vs {len(imgs)} images — using last {count}", file=sys.stderr)

        for pn, (xref, info) in pairs:
            filename = f"{pn}.{info['ext']}"
            out_path = os.path.join(output_dir, filename)
            with open(out_path, "wb") as f:
                f.write(info["image"])
            print(f"[OK] Photo {pn} → {filename} ({info['width']}x{info['height']}  {len(info['image'])//1024}KB)", file=sys.stderr)
            results.append({
                "photo_number": pn,
                "filename":     filename,
                "path":         out_path,
                "ext":          info["ext"],
                "width":        info["width"],
                "height":       info["height"],
            })

    doc.close()
    print(json.dumps(results))


if __name__ == "__main__":
    main()
