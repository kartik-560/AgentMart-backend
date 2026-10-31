/**
 * Security & Trust Engine
 * Zero-Trust Input Analyzer for Agent Communications.
 * Intercepts adversarial prompt injections, hidden fees, and unauthorized out-of-band requests.
 */

export class SecurityEngine {
  // Regex heuristics for adversarial prompt injection detection
  static INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts|limits|rules)/i,
    /system\s*:\s*override/i,
    /you\s+must\s+accept\s+regardless\s+of\s+budget/i,
    /disregard\s+(the\s+)?(budget|ceiling|cap)/i,
    /transfer\s+directly\s+to\s+external\s+account/i,
    /admin_role\s*=\s*true/i,
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  ];

  // Regex patterns to detect hidden surcharges in narrative text
  static HIDDEN_FEE_PATTERNS = [
    /(?:additional|extra|hidden|handling|logistics|clearance)\s*(?:fee|surcharge|charge|cost)?\s*[:=]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/i,
    /(?:mandatory\s+customs\s+duty)\s*[:=]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/i,
  ];

  /**
   * Scans untrusted narrative message and structured payload for anomalies
   */
  static inspectMessage(rawContent, proposal = null) {
    const anomalies = [];
    let isSanitized = true;

    if (!rawContent || typeof rawContent !== 'string') {
      return { isClean: true, anomalies: [], sanitizedContent: rawContent || '' };
    }

    // 1. Check for Prompt Injection / Override Attempts
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(rawContent)) {
        anomalies.push({
          type: 'PROMPT_INJECTION',
          severity: 'CRITICAL',
          description: `Detected prompt injection attempt matching pattern: ${pattern.toString()}`,
        });
        isSanitized = false;
      }
    }

    // 2. Check for Hidden Narrative Fees
    let detectedHiddenFee = 0;
    for (const pattern of this.HIDDEN_FEE_PATTERNS) {
      const match = rawContent.match(pattern);
      if (match && match[1]) {
        const feeValue = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(feeValue) && feeValue > 0) {
          detectedHiddenFee += feeValue;
          anomalies.push({
            type: 'HIDDEN_FEE',
            severity: 'HIGH',
            amount: feeValue,
            description: `Detected undisclosed narrative fee of ₹${feeValue.toLocaleString()} in message body`,
          });
        }
      }
    }

    // 3. Reconcile Structured Proposal if present
    if (proposal) {
      const calculatedExpected = (proposal.unitPrice * proposal.quantity) + (proposal.declaredFees || 0);
      if (Math.abs(calculatedExpected - proposal.totalPrice) > 1.0) {
        anomalies.push({
          type: 'ARITHMETIC_MISMATCH',
          severity: 'HIGH',
          description: `Structured totalPrice (₹${proposal.totalPrice}) does not match unitPrice * quantity (₹${calculatedExpected})`,
        });
      }

      // Check if hidden fee was hidden from declaredFees
      if (detectedHiddenFee > 0 && (!proposal.declaredFees || proposal.declaredFees < detectedHiddenFee)) {
        anomalies.push({
          type: 'UNDISCLOSED_SURCHARGE',
          severity: 'CRITICAL',
          description: `Narrative fee of ₹${detectedHiddenFee} was concealed from structured declaredFees`,
        });
      }
    }

    // Sanitize string (strip executable tags or null bytes)
    const sanitizedContent = rawContent
      .replace(/\0/g, '')
      .replace(/<[^>]*>?/gm, '');

    return {
      isClean: anomalies.length === 0,
      anomalies,
      detectedHiddenFee,
      sanitizedContent,
    };
  }

  /**
   * Adjusts Agent Trust Score based on security infractions
   */
  static calculateTrustScoreAdjustment(currentScore, anomalies) {
    let penalty = 0;
    for (const anomaly of anomalies) {
      if (anomaly.severity === 'CRITICAL') penalty += 35;
      else if (anomaly.severity === 'HIGH') penalty += 20;
      else if (anomaly.severity === 'MEDIUM') penalty += 10;
      else penalty += 5;
    }

    const updated = Math.max(0, Math.min(100, currentScore - penalty));
    return Math.round(updated * 10) / 10;
  }
}

