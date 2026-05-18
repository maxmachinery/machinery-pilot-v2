export function redactPII(text) {
  if (!text || typeof text !== 'string') return text;
  let redacted = text;

  // "Engineer\n[Name]" or "Engineer Name\n[Name]" or "Technician\n[Name]"
  redacted = redacted.replace(
    /(Engineer(?:\s+Name)?|Technician|Mechanic|Service\s+Engineer)\s*[:\n\r]+\s*([^\n\r]+)/gi,
    (match, label) => `${label}\n[REDACTED]`,
  );

  // "Engineer: [Name]" inline
  redacted = redacted.replace(
    /(Engineer(?:\s+Name)?|Technician|Mechanic):\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?)/g,
    '$1: [REDACTED]',
  );

  // "Reported by [Name]" etc
  redacted = redacted.replace(
    /(Reported|Signed\s+off|Inspected|Repaired|Completed|Attended)\s+by:?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?)/gi,
    '$1 by [REDACTED]',
  );

  return redacted;
}
