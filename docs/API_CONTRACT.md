# AgentMart Canonical API Contract

All endpoints are served with prefix `/api/v1` (with `/api/health` available at root level).

Base URL: `http://localhost:5000/api`

---

## 1. Response Envelope Standards

All responses conform to the standard AgentMart JSON envelope:

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource retrieved successfully",
  "data": { ... },
  "timestamp": "2026-10-31T12:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "error": "ValidationError",
  "message": "Total price exceeds max budget constraint of ₹50,000",
  "details": [
    {
      "field": "totalPrice",
      "issue": "Expected number <= 50000, received 54000"
    }
  ],
  "timestamp": "2026-10-31T12:00:00.000Z"
}
```

---

## 2. Core Endpoints

### 2.1. Health Check
* **GET `/health`**
* **Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "agentmart-backend",
  "version": "1.0.0",
  "timestamp": "2026-10-31T12:00:00.000Z",
  "database": "connected",
  "aiEngine": "ready"
}
```

---

### 2.2. Business Profile
* **GET `/business/profile`**
  * Fetches current enterprise profile, budgets, risk tolerances, and business memory.
* **PUT `/business/profile`**
  * Updates editable business parameters (contact, target resale margin, risk tolerance). Note: Hard budget ceiling adjustments require explicit confirmation.

---

### 2.3. Products & SKUs
* **GET `/products`**
  * Query parameters: `?category=Electronics&search=Router&limit=40`
  * Returns list of products with base costs, stock, and standard lead times.
* **GET `/products/:id`**
  * Fetches specific SKU details and price floors.

---

### 2.4. Agent Management
* **GET `/agents`**
  * Returns all 4 system agents (Buyer, Seller A, Seller B, Seller C) with their status, trust scores, and current configurations.
* **GET `/agents/:id`**
  * Returns detailed prompt, memory, and history for an individual agent.
* **PATCH `/agents/:id/status`**
  * Request Body: `{ "status": "SUSPENDED" | "ACTIVE" }`
  * Allows manual pause or intervention on rogue agents.

---

### 2.5. Negotiations Engine
* **GET `/negotiations`**
  * Lists active and completed procurement negotiations.
* **POST `/negotiations`**
  * Initiates a new procurement negotiation session across the 3 seller agents.
  * **Request Body:**
  ```json
  {
    "targetProductId": "prod-uuid",
    "targetQuantity": 12,
    "maxBudget": 50000.00,
    "maxDeliveryHours": 48,
    "targetResaleMargin": 25.00
  }
  ```
* **GET `/negotiations/:id`**
  * Returns negotiation state, participating agents, rounds, and recommended deal.
* **POST `/negotiations/:id/advance-round`**
  * Triggers the next negotiation round where agents formulate counter-offers and the decision engine recalculates utility.

---

### 2.6. Offers & Comparison
* **GET `/negotiations/:id/offers`**
  * Fetches all offers generated across rounds with computed utility scores and margin breakdowns.
* **GET `/negotiations/:id/comparison`**
  * Returns a side-by-side comparison matrix of Seller A, Seller B, and Seller C offers against buyer constraints.

---

### 2.7. Transactions & Human Approval
* **GET `/transactions`**
  * Lists transactions categorized by settlement status (`PENDING_APPROVAL`, `SETTLED`, etc.).
* **GET `/transactions/:id`**
  * Detailed settlement view including audit trail, delivery SLA, and pricing breakdown.
* **POST `/transactions/:id/approve`**
  * **MANDATORY HUMAN APPROVAL STEP.**
  * **Request Body:**
  ```json
  {
    "approvedBy": "Kartik - Senior Procurement Director",
    "approvalNotes": "Approved Seller A offer within budget and SLA limits",
    "paymentMethod": "MOCK_UPI",
    "payerVpa": "apexenterprise@hdfcbank"
  }
  ```
  * **Response (200 OK):** Settles transaction via Mock UPI, generates mock reference, and logs tamper-proof audit record.
* **POST `/transactions/:id/reject`**
  * Rejects recommended deal and returns negotiation to renegotiation or cancellation.

---

### 2.8. Security & Trust Center
* **GET `/security/alerts`**
  * Returns list of security threats detected (prompt injections, hidden fees, unverified claims).
* **GET `/security/threat-radar`**
  * Provides aggregated metrics on supplier risk profiles, threat frequencies, and trust scores.
* **POST `/security/alerts/:id/resolve`**
  * Resolves or dismisses an alert with auditor notes.

---

### 2.9. Audit Logs
* **GET `/audit/logs`**
  * Query parameters: `?entityType=TRANSACTION&limit=50&offset=0`
  * Returns chronological, immutable audit log events with tamper-proof cryptographic hashes.

