# AgentMart Database Documentation

## 1. Overview & Data Philosophy

The AgentMart persistence layer is built on PostgreSQL via Prisma ORM. It operates under three non-negotiable principles:
1. **Financial Precision:** Currency and prices utilize `Decimal(12, 2)` to eliminate floating-point inaccuracies.
2. **Audit Immutability:** Audit records (`audit_logs`) are append-only and cannot be altered or deleted. State transitions include SHA-256 hashes.
3. **Decoupled Agent Identity & Human Authority:** AI Agents belong to registered `Business` entities. Offers and transactions record both the agent actor and the legal business principal, and settlements require explicit `User` approval.

---

## 2. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    USER ||--o| BUSINESS : belongs_to
    USER ||--o{ TRANSACTION : approves

    BUSINESS ||--|| BUSINESS_PROFILE : defines
    BUSINESS ||--o{ AGENT : owns
    BUSINESS ||--o{ PRODUCT : manufactures_or_distributes
    BUSINESS ||--o{ NEGOTIATION : initiates_as_buyer
    BUSINESS ||--o{ OFFER : quotes_as_seller
    BUSINESS ||--o{ TRANSACTION : party_to
    BUSINESS ||--|| BUSINESS_MEMORY : retains

    PRODUCT ||--|| INVENTORY : tracks_stock
    PRODUCT ||--o{ NEGOTIATION : target_sku
    PRODUCT ||--o{ OFFER : item_quoted

    AGENT ||--o{ AGENT_MESSAGE : transmits
    AGENT ||--o{ OFFER : formulates
    AGENT ||--o{ SECURITY_EVENT : flagged_for

    NEGOTIATION ||--o{ AGENT_MESSAGE : exchanges
    NEGOTIATION ||--o{ OFFER : receives
    NEGOTIATION ||--o{ SECURITY_EVENT : intercepts
    NEGOTIATION ||--o{ TRANSACTION : results_in

    OFFER ||--o| TRANSACTION : settles
```

---

## 3. Core Database Models

### 3.1. `users`
* `id` (UUID, Primary Key)
* `email` (VarChar, Unique)
* `passwordHash` (VarChar, bcrypt)
* `name` (VarChar)
* `role` (Enum: `ADMIN`, `OPERATOR`, `BUYER_OFFICER`, `SUPPLIER_REP`)
* `businessId` (Foreign Key -> businesses.id)
* `createdAt`, `updatedAt`

### 3.2. `businesses`
* `id` (UUID, Primary Key)
* `name` (VarChar, Legal Name)
* `registrationNumber` (VarChar, Unique CIN/Tax ID)
* `businessType` (Enum: `RETAIL_ENTERPRISE`, `DISTRIBUTOR`, `MANUFACTURER`, `ECOMMERCE_OPERATOR`)
* `contactEmail` (VarChar, Unique)
* `contactPhone` (VarChar)
* `createdAt`, `updatedAt`

### 3.3. `business_profiles`
* `id` (UUID, Primary Key)
* `businessId` (Foreign Key -> businesses.id, Unique)
* `budgetLimit` (Decimal 12,2, default 50000.00)
* `targetResaleMargin` (Decimal 5,2, default 25.00%)
* `minAcceptableMargin` (Decimal 5,2, default 18.00%)
* `maxDeliveryHours` (Int, default 48)
* `qualityTierRequirement` (VarChar, default "Enterprise")
* `riskTolerance` (VarChar: CONSERVATIVE, BALANCED, AGGRESSIVE)
* `paymentPreferences` (Text Array: MOCK_UPI, ESCROW)

### 3.4. `products`
* `id` (UUID, Primary Key)
* `businessId` (Foreign Key -> businesses.id)
* `sku` (VarChar, Unique SKU code)
* `name` (VarChar)
* `category` (VarChar: Electronics, Warehouse, Safety, Office, Retail-POS)
* `unit` (VarChar, default "Unit")
* `baseCostPrice` (Decimal 12,2)
* `minSellingPrice` (Decimal 12,2, Floor price)
* `targetSellingPrice` (Decimal 12,2)
* `qualityGrade` (VarChar)
* `typicalLeadTimeHours` (Int)
* `isActive` (Boolean, default true)

### 3.5. `inventories`
* `id` (UUID, Primary Key)
* `productId` (Foreign Key -> products.id, Unique)
* `stockQuantity` (Int, Available warehouse units)
* `reservedQuantity` (Int, Units locked in active negotiations)
* `warehouseLocation` (VarChar)
* `minThreshold` (Int, default 10)
* `restockLeadDays` (Int, default 7)
* `lastRestockedAt` (DateTime)

### 3.6. `agents`
* `id` (UUID, Primary Key)
* `businessId` (Foreign Key -> businesses.id)
* `name` (VarChar)
* `agentType` (Enum: `BUYER`, `SELLER_A_PRICE`, `SELLER_B_SPEED_QUALITY`, `SELLER_C_MALICIOUS`)
* `status` (Enum: `IDLE`, `ACTIVE`, `NEGOTIATING`, `SUSPENDED`, `OFFLINE`)
* `modelProvider` (Default "Google-Gemini")
* `modelName` (Default "gemini-2.0-flash")
* `trustScore` (Float, 0.0 to 100.0)
* `configuration` (JSONB)
* `systemPrompt` (Text)

### 3.7. `negotiations`
* `id` (UUID, Primary Key)
* `title` (VarChar)
* `targetProductId` (Foreign Key -> products.id)
* `buyerBusinessId` (Foreign Key -> businesses.id)
* `buyerAgentId` (Foreign Key -> agents.id)
* `status` (Enum: `INITIATED`, `IN_PROGRESS`, `DEAL_RECOMMENDED`, `PENDING_HUMAN_APPROVAL`, `APPROVED`, `REJECTED`, `FAILED`, `FLAGGED_SECURITY`)
* `maxBudget` (Decimal 12,2, Hard constraint: ₹50,000 max)
* `maxDeliveryHours` (Int, Hard constraint: 48h SLA)
* `targetQuantity` (Int, default 12)
* `currentRound` (Int, default 1)
* `recommendedOfferId` (UUID, Unique)

### 3.8. `offers`
* `id` (UUID, Primary Key)
* `negotiationId` (Foreign Key -> negotiations.id)
* `sellerBusinessId` (Foreign Key -> businesses.id)
* `sellerAgentId` (Foreign Key -> agents.id)
* `productId` (Foreign Key -> products.id)
* `roundNumber` (Int)
* `unitPrice` (Decimal 12,2)
* `quantity` (Int)
* `totalPrice` (Decimal 12,2)
* `deliveryHours` (Int)
* `qualityGrade` (VarChar)
* `paymentTerms` (VarChar, default "MOCK_UPI")
* `resaleMarginProjected` (Decimal 5,2)
* `utilityScore` (Float, 0 to 100)
* `status` (Enum: `PENDING`, `COUNTERED`, `ACCEPTED`, `REJECTED`, `FLAGGED`)
* `hiddenFeeDetected` (Boolean)
* `isRecommended` (Boolean)

### 3.9. `agent_messages`
* `id` (UUID, Primary Key)
* `negotiationId` (Foreign Key -> negotiations.id)
* `agentId` (Foreign Key -> agents.id)
* `roundNumber` (Int)
* `senderRole` (VarChar)
* `content` (Text)
* `structuredProposal` (JSONB)
* `llmReasoning` (Text)
* `securityStatus` (VarChar: VERIFIED, SUSPICIOUS, BLOCKED)

### 3.10. `security_events`
* `id` (UUID, Primary Key)
* `negotiationId` (Foreign Key)
* `offendingAgentId` (Foreign Key)
* `threatType` (VarChar: PROMPT_INJECTION, PRICE_GOUGING, HIDDEN_FEE, PHANTOM_INVENTORY, REPLAY_ATTACK)
* `severity` (Enum: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
* `description` (Text)
* `rawPayload` (Text)
* `mitigationAction` (VarChar)
* `resolved` (Boolean)
* `resolutionNotes` (VarChar)

### 3.11. `transactions`
* `id` (UUID, Primary Key)
* `negotiationId` (Foreign Key -> negotiations.id)
* `offerId` (Foreign Key -> offers.id, Unique)
* `buyerBusinessId` (Foreign Key -> businesses.id)
* `sellerBusinessId` (Foreign Key -> businesses.id)
* `settlementAmount` (Decimal 12,2)
* `paymentMethod` (VarChar, "MOCK_UPI")
* `settlementStatus` (Enum: `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `SETTLED`)
* `humanApprovalRequired` (Boolean, default true)
* `approvedById` (Foreign Key -> users.id)
* `approverSignature` (VarChar, Human Name/Signature)
* `approvedAt` (DateTime)
* `mockUpiReference` (VarChar, Unique index prevents duplicate settlement)
* `settledAt` (DateTime)
* `tamperProofHash` (VarChar, SHA-256)

### 3.12. `audit_logs`
* `id` (UUID, Primary Key)
* `entityType` (VarChar)
* `entityId` (UUID)
* `action` (VarChar)
* `actorType` (Enum: `HUMAN`, `AGENT`, `SYSTEM`)
* `actorId` (VarChar)
* `previousState` (JSONB)
* `newState` (JSONB)
* `tamperProofHash` (VarChar, SHA-256)
* `timestamp` (DateTime)

### 3.13. `business_memories`
* `id` (UUID, Primary Key)
* `businessId` (Foreign Key -> businesses.id, Unique)
* `totalTransactions` (Int)
* `successfulDeals` (Int)
* `supplierReliability` (JSONB)
* `negotiationTactics` (JSONB)
* `recommendedPolicies` (JSONB)
