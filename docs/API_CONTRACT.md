# AgentMart Canonical API Contract

All endpoints are served with prefix `/api` (or `/api/v1`).

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

## 2. Authentication & Authorization Endpoints

### 2.1. Register User
* **POST `/auth/register`**
* **Request Body:**
```json
{
  "email": "operator@apexretail.in",
  "password": "SecurePassword123",
  "name": "Kartik - Senior Procurement Officer",
  "role": "BUYER_OFFICER"
}
```
* **Response (201 Created):** `{ "user": { ... }, "token": "jwt..." }`

### 2.2. Login
* **POST `/auth/login`**
* **Request Body:**
```json
{
  "email": "procurement@apexretail.in",
  "password": "AgentMart@2026"
}
```
* **Response (200 OK):** `{ "user": { ... }, "token": "jwt..." }`

### 2.3. Current User Profile
* **GET `/auth/me`** (Headers: `Authorization: Bearer <token>`)

---

## 3. Core Enterprise Endpoints

### 3.1. Health Check
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

### 3.2. Business Profile
* **GET `/business/profile`**
  * Fetches current enterprise profile, budgets, risk tolerances, and business memory.
* **PUT `/business/profile`**
  * Updates editable business parameters (contact, target resale margin, risk tolerance).

### 3.3. Products & Inventory
* **GET `/products`**
  * Query parameters: `?category=Electronics&search=Router&limit=40`
  * Returns list of products with base costs, warehouse inventory, and standard lead times.
* **GET `/products/:id`**
  * Fetches specific SKU details and price floors.
* **PATCH `/products/:id/inventory`**
  * Updates stock, reserved stock, or warehouse location.

### 3.4. Agent Management
* **GET `/agents`**
  * Returns all 4 system agents (Buyer, Seller A, Seller B, Seller C) with their status, trust scores, and current configurations.
* **GET `/agents/:id`**
  * Returns detailed prompt, memory, and history for an individual agent.
* **PATCH `/agents/:id/status`**
  * Request Body: `{ "status": "SUSPENDED" | "ACTIVE", "reason": "Operator audit" }`

### 3.5. Negotiations Engine
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
* **GET `/negotiations/:id/offers`**
  * Returns all submitted offers across rounds for this negotiation.
* **POST `/negotiations/:id/advance-round`**
  * Triggers the next negotiation round where agents formulate counter-offers and the decision engine recalculates utility.

### 3.6. Offers & Comparison
* **GET `/negotiations/:id/comparison`**
  * Returns a side-by-side comparison matrix of Seller A, Seller B, and Seller C offers against buyer constraints.

### 3.7. Transactions & Human Approval
* **GET `/transactions`**
  * Lists transactions categorized by settlement status (`PENDING_APPROVAL`, `SETTLED`, etc.).
* **GET `/transactions/:id`**
  * Detailed settlement view including audit trail, delivery SLA, and pricing breakdown.
* **POST `/transactions/:id/approve`**
  * **MANDATORY HUMAN APPROVAL STEP.**
  * Idempotency protection prevents duplicate settlements.
  * **Request Body:**
  ```json
  {
    "approvedBy": "Kartik - Senior Procurement Director",
    "approvalNotes": "Approved Seller A offer within budget and SLA limits",
    "paymentMethod": "MOCK_UPI",
    "payerVpa": "apexenterprise@hdfcbank"
  }
  ```
* **POST `/transactions/:id/reject`**
  * Rejects recommended deal and returns negotiation to cancellation.

### 3.8. Security & Trust Center
* **GET `/security/alerts`**
  * Returns list of security threats detected (prompt injections, hidden fees, unverified claims).
* **GET `/security/threat-radar`**
  * Provides aggregated metrics on supplier risk profiles, threat frequencies, and trust scores.
* **POST `/security/alerts/:id/resolve`**
  * Resolves an alert with auditor notes.

### 3.9. Audit Logs
* **GET `/audit/logs`**
  * Query parameters: `?entityType=TRANSACTION&limit=50&offset=0`
  * Returns chronological, immutable audit log events with tamper-proof cryptographic hashes.
* **GET `/audit/logs/:id/verify`**
  * Verifies the cryptographic integrity of a specific audit log record.
