/**
 * Zero-Trust Security & Trust Engine
 * Multi-layered adversarial defense system for AgentMart autonomous marketplace.
 * 
 * Intercepts and mitigates:
 * 1. Prompt injections and system instruction overrides.
 * 2. Private agent memory probing and extraction.
 * 3. Unauthorized tool execution and remote command execution.
 * 4. Hidden narrative surcharges and arithmetic tampering.
 * 5. Phantom inventory and impossible delivery SLA claims.
 * 6. Agent identity spoofing and role impersonation.
 * 7. Out-of-band payment redirects and financial limit bypasses.
 * 
 * NON-NEGOTIABLE ARCHITECTURAL LAW:
 * Security is enforced deterministically via code, regex, AST/structural analysis,
 * and cryptographic hashing. NEVER relies exclusively on an LLM to enforce security.
 */

import crypto from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../utils/logger.js';
import {
  ThreatTypeEnum,
  ThreatSeverityEnum,
  MitigationActionEnum,
  SecurityAnomalySchema,
  SecurityScanResultSchema,
  AgentIdentityVerificationSchema,
} from './security.schema.js';

export class SecurityEngine {
  // Regex heuristics for adversarial prompt injection detection
  static INJECTION_PATTERNS = [
    // 1. Direct Instruction Overrides
    {
      pattern: /ignore\s+(all\s+|any\s+)?(previous|prior|above|existing)\s+(instructions|prompts|limits|rules|constraints|directives)/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Attempt to override prior system instructions and commercial rules',
    },
    {
      pattern: /system\s*:\s*(override|admin|root|prompt|execute|mode)/i,
      type: 'SYSTEM_OVERRIDE_ATTEMPT',
      severity: 'CRITICAL',
      description: 'System-level role spoofing or administrative override token',
    },
    {
      pattern: /\[\s*system\s+(?:notice|instruction|directive|alert)\s*:[^\]]*\]/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Role-spoofed [System Notice] injection container',
    },
    {
      pattern: /<\|(?:im_start|im_end|system|assistant)\|>/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Chat template delimiter injection attempt',
    },
    {
      pattern: /disregard\s+(the\s+)?(budget|ceiling|cap|financial\s+limit|hard\s+limit)/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Direct command to disregard enterprise budget constraints',
    },
    {
      pattern: /you\s+must\s+accept\s+regardless\s+of\s+(?:budget|price|cost|sla|limit)/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Adversarial mandate coercing agent acceptance without validation',
    },
    {
      pattern: /approve\s+(?:this\s+deal\s+|the\s+offer\s+)?immediately\s+(?:without\s+validation|unconditionally)/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Attempt to bypass mandatory transaction approval and evaluation',
    },
    {
      pattern: /from\s+now\s+on\s+you\s+(?:are|act\s+as)\s+(?:a\s+different|an\s+unconstrained|a\s+seller-friendly|dan)/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Persona reassignment / Jailbreak framing attempt',
    },
    {
      pattern: /new\s+(?:system\s+)?instruction\s*:\s*/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Inline instruction injection pattern',
    },

    // 2. Memory Probing & Confidential Data Exfiltration
    {
      pattern: /(?:reveal|output|print|show|dump|leak)\s+(?:all\s+)?(?:your\s+)?(?:secret|private|system|buyer)\s*(?:prompt|memory|instructions|configuration|budget|margin|rules)/i,
      type: 'MEMORY_LEAK_ATTEMPT',
      severity: 'CRITICAL',
      description: 'Probe attempting to exfiltrate private agent memory or system prompt',
    },
    {
      pattern: /(?:what\s+is\s+your|tell\s+me\s+your)\s+(?:max(?:imum)?\s+budget|floor\s+price|confidential\s+margin)/i,
      type: 'MEMORY_LEAK_ATTEMPT',
      severity: 'HIGH',
      description: 'Attempt to solicit confidential buyer financial constraints',
    },

    // 3. Tool / Remote Execution Injections
    {
      pattern: /(?:execute|call|run)\s+(?:tool|function|eval|exec|command)\s*[:(]/i,
      type: 'TOOL_INJECTION',
      severity: 'CRITICAL',
      description: 'Unauthorized tool invocation attempt',
    },
    {
      pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      type: 'TOOL_INJECTION',
      severity: 'CRITICAL',
      description: 'Malicious HTML <script> injection detected',
    },
    {
      pattern: /(?:DROP\s+TABLE|SELECT\s+\*\s+FROM|UNION\s+SELECT|DELETE\s+FROM\s+businesses)/i,
      type: 'TOOL_INJECTION',
      severity: 'CRITICAL',
      description: 'SQL injection string in negotiation narrative',
    },
    {
      pattern: /(?:child_process|process\.env|fs\.readfile|__proto__|constructor\["prototype"\])/i,
      type: 'TOOL_INJECTION',
      severity: 'CRITICAL',
      description: 'Node.js runtime sandbox escape probe',
    },

    // 4. Out-of-Band Payment & Financial Redirects
    {
      pattern: /transfer\s+directly\s+to\s+external\s+account/i,
      type: 'UNAUTHORIZED_PAYMENT_METHOD',
      severity: 'CRITICAL',
      description: 'Attempt to bypass platform UPI/Escrow for external wire transfer',
    },
    {
      pattern: /(?:direct\s+wire\s+transfer|wire\s+directly\s+to|pay\s+via\s+crypto|send\s+(?:btc|usdt|eth)\s+to)/i,
      type: 'UNAUTHORIZED_PAYMENT_METHOD',
      severity: 'CRITICAL',
      description: 'Prohibited off-platform payment redirection',
    },
    {
      pattern: /admin_role\s*=\s*true/i,
      type: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      description: 'Privilege escalation payload attempt',
    },
  ];

  // Regex patterns to detect hidden surcharges in narrative text
  static HIDDEN_FEE_PATTERNS = [
    /(?:additional|extra|hidden|handling|logistics|clearance|docking|fuel|processing|mandatory\s+customs\s+duty|convenience|insurance)\s*(?:fee|surcharge|charge|cost)?\s*[:=]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{2})?)/i,
    /(?:mandatory\s+customs\s+duty)\s*[:=]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{2})?)/i,
    /(?:requires\s+additional\s+payment\s+of)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  /**
   * Comprehensive Zero-Trust Inspection of untrusted seller messages and proposal payloads.
   *
   * @param {string} rawContent - Untrusted narrative text from external seller agent
   * @param {Object} [proposal=null] - Structured proposal extracted from response
   * @param {Object} [catalogContext=null] - Verified product catalog information
   * @param {Object} [agentContext=null] - Identity metadata of sender
   * @returns {Object} Deterministic security scan result
   */
  static inspectMessage(rawContent, proposal = null, catalogContext = null, agentContext = null) {
    const anomalies = [];
    let detectedHiddenFee = 0;

    const contentStr = typeof rawContent === 'string' ? rawContent : '';

    // Step 1: Obfuscation & Character Normalization
    const { normalizedText, detectedObfuscation } = this.detectAndNormalizeObfuscation(contentStr);
    if (detectedObfuscation) {
      anomalies.push({
        type: 'PROMPT_INJECTION',
        severity: 'HIGH',
        description: `Detected obfuscated payload trick: ${detectedObfuscation}`,
      });
    }

    // Step 2: Prompt Injection & Instruction Override Scanning
    const injectionMatches = this.analyzePromptInjection(normalizedText);
    for (const match of injectionMatches) {
      anomalies.push({
        type: match.type,
        severity: match.severity,
        description: match.description,
        evidence: match.evidence,
      });
    }

    // Step 3: Hidden Surcharge Detection in Narrative Text
    const hiddenFeeScan = this.detectHiddenCharges(normalizedText, proposal);
    detectedHiddenFee = hiddenFeeScan.detectedHiddenFee;
    for (const anomaly of hiddenFeeScan.anomalies) {
      anomalies.push(anomaly);
    }

    // Step 4: Offer Manipulation (Phantom Inventory & SLA Falsification)
    if (proposal && catalogContext) {
      const manipulationCheck = this.detectOfferManipulation(proposal, catalogContext);
      for (const anomaly of manipulationCheck.anomalies) {
        anomalies.push(anomaly);
      }
    }

    // Step 5: Agent Identity & Role Validation
    if (agentContext) {
      const identityCheck = this.validateAgentIdentity(agentContext);
      if (!identityCheck.isValid) {
        anomalies.push({
          type: 'IDENTITY_SPOOFING',
          severity: 'CRITICAL',
          description: identityCheck.reason,
        });
      }
    }

    // Step 6: Determine Severity, Risk Score, and Mitigation Action
    const isClean = anomalies.length === 0;
    const severity = this.determineMaxSeverity(anomalies);
    const riskScore = this.calculateRiskScore(anomalies);
    const trustScoreAdjustment = this.calculateTrustScoreAdjustment(100, anomalies) - 100;

    let mitigationAction = 'PASSED';
    if (!isClean) {
      if (severity === 'CRITICAL') {
        mitigationAction = 'REJECTED';
      } else if (severity === 'HIGH') {
        mitigationAction = 'FLAGGED';
      } else {
        mitigationAction = 'FLAGGED';
      }
    }

    // Step 7: Content Sanitization and Untrusted Message Isolation
    const sanitizedContent = this.sanitizeContent(contentStr);
    const isolatedPayload = this.isolateUntrustedMessage(sanitizedContent, agentContext?.agentId);

    const result = {
      isClean,
      sanitizedContent,
      isolatedPayload,
      anomalies,
      detectedHiddenFee,
      riskScore,
      severity,
      mitigationAction,
      trustScoreAdjustment,
    };

    // Step 8: Security Event Logging (Tamper-evident audit trail)
    if (!isClean) {
      this.logSecurityEvent(result, agentContext, proposal).catch(err => {
        logger.debug(`Background security event logging notice: ${err.message}`);
      });
    }

    return result;
  }

  /**
   * Scans text for prompt injection, jailbreak attempts, and system override patterns
   */
  static analyzePromptInjection(content) {
    const matches = [];
    if (!content || typeof content !== 'string') return matches;

    for (const item of this.INJECTION_PATTERNS) {
      const match = content.match(item.pattern);
      if (match) {
        matches.push({
          type: item.type,
          severity: item.severity,
          description: item.description,
          evidence: match[0].substring(0, 100),
        });
      }
    }

    return matches;
  }

  /**
   * Detects hidden narrative charges and reconciles structured arithmetic
   */
  static detectHiddenCharges(content, proposal = null) {
    const anomalies = [];
    let detectedHiddenFee = 0;

    if (content && typeof content === 'string') {
      for (const pattern of this.HIDDEN_FEE_PATTERNS) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const feeValue = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(feeValue) && feeValue > 0) {
            detectedHiddenFee += feeValue;
            anomalies.push({
              type: 'HIDDEN_FEE',
              severity: 'HIGH',
              amount: feeValue,
              description: `Detected undisclosed narrative surcharge of ₹${feeValue.toLocaleString()} in message body`,
              evidence: match[0],
            });
          }
        }
      }
    }

    // Arithmetic Reconciliation
    if (proposal && typeof proposal === 'object') {
      const unit = Number(proposal.unitPrice || 0);
      const qty = Number(proposal.quantity || 0);
      const declared = Number(proposal.declaredFees || 0);
      const total = Number(proposal.totalPrice || 0);

      const calculatedExpected = Math.round(((unit * qty) + declared) * 100) / 100;
      if (Math.abs(calculatedExpected - total) > 1.0) {
        anomalies.push({
          type: 'ARITHMETIC_MISMATCH',
          severity: 'HIGH',
          description: `Structured totalPrice (₹${total}) does not match unitPrice * quantity + declaredFees (₹${calculatedExpected})`,
        });
      }

      // Check if narrative fee was concealed from declared fees
      if (detectedHiddenFee > 0 && (!declared || declared < detectedHiddenFee)) {
        anomalies.push({
          type: 'UNDISCLOSED_SURCHARGE',
          severity: 'CRITICAL',
          amount: detectedHiddenFee - declared,
          description: `Narrative fee of ₹${detectedHiddenFee.toLocaleString()} was concealed from structured declaredFees (declared: ₹${declared.toLocaleString()})`,
        });
      }
    }

    return {
      detectedHiddenFee,
      anomalies,
    };
  }

  /**
   * Detects offer manipulation: phantom inventory claims and impossible SLA commitments
   */
  static detectOfferManipulation(proposal, catalogContext) {
    const anomalies = [];
    if (!proposal || !catalogContext) return { anomalies };

    // Phantom Inventory Check
    if (catalogContext.stockQuantity !== undefined && proposal.quantity !== undefined) {
      if (Number(proposal.quantity) > Number(catalogContext.stockQuantity)) {
        anomalies.push({
          type: 'PHANTOM_INVENTORY',
          severity: 'HIGH',
          description: `Seller claimed ability to supply ${proposal.quantity} units, exceeding verified catalog stock of ${catalogContext.stockQuantity}`,
        });
      }
    }

    // SLA Falsification Check
    if (catalogContext.typicalLeadTimeHours !== undefined && proposal.deliveryHours !== undefined) {
      const minPlausibleHours = Math.max(4, Math.floor(catalogContext.typicalLeadTimeHours * 0.4));
      if (Number(proposal.deliveryHours) < minPlausibleHours) {
        anomalies.push({
          type: 'UNREALISTIC_SLA_FALSIFICATION',
          severity: 'HIGH',
          description: `Promised delivery in ${proposal.deliveryHours} hours is unachievable for product with standard ${catalogContext.typicalLeadTimeHours}-hour lead time`,
        });
      }
    }

    return { anomalies };
  }

  /**
   * Validates the cryptographic or session identity of the communicating agent
   */
  static validateAgentIdentity(agentContext) {
    if (!agentContext || typeof agentContext !== 'object') {
      return { isValid: false, reason: 'Missing agent context metadata' };
    }

    const { agentId, businessId, role, expectedAgentType } = agentContext;
    if (!agentId || !businessId) {
      return { isValid: false, reason: 'Agent ID and Business ID are mandatory for verification' };
    }

    // Role Impersonation Defense: A seller agent cannot emit messages with role BUYER
    if (role === 'BUYER' && expectedAgentType && expectedAgentType.startsWith('SELLER')) {
      return { isValid: false, reason: `Seller agent [${agentId}] attempted role impersonation as [BUYER]` };
    }

    return { isValid: true };
  }

  /**
   * Sanitizes untrusted text by stripping dangerous tags, control characters, and null bytes
   */
  static sanitizeContent(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/\0/g, '') // Null byte
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width characters
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Executable script
      .replace(/<[^>]*>?/gm, ''); // HTML tags
  }

  /**
   * Isolates untrusted seller content inside strict envelope delimiters.
   * LLMs are instructed that everything inside this envelope is passive untrusted data.
   */
  static isolateUntrustedMessage(content, agentId = 'unknown') {
    const timestamp = new Date().toISOString();
    const hash = crypto.createHash('sha256').update(content || '').digest('hex').substring(0, 16);
    return `<untrusted_seller_content agentId="${agentId}" hash="${hash}" timestamp="${timestamp}">\n${content}\n</untrusted_seller_content>`;
  }

  /**
   * Detects hidden encoding tricks (Base64, Hex, Zero-width character flood)
   */
  static detectAndNormalizeObfuscation(text) {
    let normalized = text;
    let detected = null;

    // Check for base64 encoded strings
    const base64Matches = text.match(/[A-Za-z0-9+/=]{24,}/g);
    if (base64Matches) {
      for (const match of base64Matches) {
        try {
          const decoded = Buffer.from(match, 'base64').toString('utf-8');
          // Check if decoded contains injection phrases
          if (/ignore|system|override|budget|admin/i.test(decoded)) {
            normalized += `\n[DECODED_BASE64: ${decoded}]`;
            detected = 'Base64 obfuscated instruction payload';
          }
        } catch {
          // Not valid base64
        }
      }
    }

    // Check for zero-width character flood
    const zeroWidthCount = (text.match(/[\u200B-\u200D\uFEFF]/g) || []).length;
    if (zeroWidthCount > 5) {
      detected = `Zero-width invisible character injection (${zeroWidthCount} hidden chars)`;
      normalized = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    }

    return { normalizedText: normalized, detectedObfuscation: detected };
  }

  /**
   * Calculates dynamic security risk score (0 to 100)
   */
  static calculateRiskScore(anomalies) {
    if (!anomalies || anomalies.length === 0) return 0;

    let score = 0;
    for (const a of anomalies) {
      if (a.severity === 'CRITICAL') score += 45;
      else if (a.severity === 'HIGH') score += 25;
      else if (a.severity === 'MEDIUM') score += 15;
      else score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Determines maximum severity across detected anomalies
   */
  static determineMaxSeverity(anomalies) {
    if (!anomalies || anomalies.length === 0) return 'LOW';
    if (anomalies.some(a => a.severity === 'CRITICAL')) return 'CRITICAL';
    if (anomalies.some(a => a.severity === 'HIGH')) return 'HIGH';
    if (anomalies.some(a => a.severity === 'MEDIUM')) return 'MEDIUM';
    return 'LOW';
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

  /**
   * Logs security event to database with tamper-evident cryptographic hash
   */
  static async logSecurityEvent(scanResult, agentContext = null, proposal = null) {
    const timestamp = new Date().toISOString();
    const eventPayload = {
      scanResult,
      agentContext,
      proposal,
      timestamp,
    };

    const tamperProofHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(eventPayload))
      .digest('hex');

    logger.warn(`SecurityEngine: Security event logged [${scanResult.severity}]`, {
      threat: scanResult.anomalies[0]?.type,
      riskScore: scanResult.riskScore,
      action: scanResult.mitigationAction,
      hash: tamperProofHash,
    });

    try {
      if (process.env.DATABASE_URL && prisma && prisma.securityAlert && scanResult.anomalies.length > 0) {
        await prisma.securityAlert.create({
          data: {
            offendingAgentId: agentContext?.agentId || null,
            threatType: scanResult.anomalies[0].type,
            severity: scanResult.severity,
            description: scanResult.anomalies.map(a => a.description).join(' | '),
            rawPayload: scanResult.sanitizedContent.substring(0, 1000),
            mitigationAction: scanResult.mitigationAction,
            resolved: false,
          },
        });
      }

      if (process.env.DATABASE_URL && prisma && prisma.auditLog) {
        await prisma.auditLog.create({
          data: {
            entityType: 'SECURITY',
            entityId: agentContext?.agentId || 'ANONYMOUS',
            action: 'THREAT_INTERCEPTED',
            actorType: 'SYSTEM',
            actorId: 'SECURITY_ENGINE',
            newState: {
              severity: scanResult.severity,
              anomaliesCount: scanResult.anomalies.length,
              mitigationAction: scanResult.mitigationAction,
            },
            tamperProofHash,
          },
        });
      }
    } catch (err) {
      // In-memory / Mock fallback if database table not yet connected
      logger.debug(`Database logging skipped (running in offline/mock mode): ${err.message}`);
    }

    return {
      logged: true,
      tamperProofHash,
      timestamp,
    };
  }
}
