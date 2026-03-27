#!/usr/bin/env python3
"""
safetyculture_summary_pdf.py — Extract pages 2–7 from a SafetyCulture PDF.

Usage:
  python3 safetyculture_summary_pdf.py <input_pdf> <output_pdf>

Extracts 0-indexed pages 2–7 (pages 3–8 in 1-indexed), which contain
the flagged-items summary section of a SafetyCulture inspection report.

Output: JSON to stdout: {"ok": true, "pages": N, "output": "<path>"}
"""
import fitz
import sys
import json


SUMMARY_PAGES = range(2, 8)   # 0-indexed 2–7 = pages 3–8 (1-indexed)


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: safetyculture_summary_pdf.py <input_pdf> <output_pdf>"}))
        sys.exit(1)

    input_pdf  = sys.argv[1]
    output_pdf = sys.argv[2]

    doc   = fitz.open(input_pdf)
    total = len(doc)

    pages = [i for i in SUMMARY_PAGES if i < total]
    if not pages:
        print(json.dumps({"error": "PDF has fewer than 3 pages — no summary pages to extract"}))
        sys.exit(1)

    out = fitz.open()
    out.insert_pdf(doc, from_page=pages[0], to_page=pages[-1])
    out.save(output_pdf)
    out.close()
    doc.close()

    print(json.dumps({"ok": True, "pages": len(pages), "output": output_pdf}))


if __name__ == "__main__":
    main()
