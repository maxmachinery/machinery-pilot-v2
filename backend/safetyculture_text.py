#!/usr/bin/env python3
"""
safetyculture_text.py — Extract all text from a SafetyCulture inspection PDF.

Reads every page with page.get_text() and concatenates the results with
clear page separators so Claude can navigate the document structure.

Usage:  python3 safetyculture_text.py <pdf_path>
Output: JSON string {"text": "...", "page_count": N} to stdout.
"""
import fitz
import json
import sys


def extract_text(pdf_path):
    doc        = fitz.open(pdf_path)
    page_count = len(doc)
    parts      = []
    for i in range(page_count):
        text = doc[i].get_text()
        parts.append(f"--- PAGE {i + 1} ---\n{text}")
    doc.close()
    return {"text": "\n".join(parts), "page_count": page_count}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 safetyculture_text.py <pdf_path>"}))
        sys.exit(1)

    try:
        result = extract_text(sys.argv[1])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
