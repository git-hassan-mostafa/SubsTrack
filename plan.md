# 📱 Subscription Management Mobile App — Full Specification

## 🎯 Objective

Build a **multi-tenant subscription management mobile application** using:

- **React Native (latest)**
- **Supabase (Auth + PostgreSQL)**
- **Zustand (state management)**

The application must follow:

- Clean architecture
- Separation of concerns
- Scalability (future-proof design)
- Reusable components
- Maintainable and testable code

---

# 🧱 Tech & Architectural Requirements

## Core Stack

- React Native (Expo preferred unless justified otherwise)
- Zustand (global + feature state)
- Supabase JS SDK (latest)
- TypeScript (strict mode)

---

# UI UX

Use a minimal, clean, and professional design with a strong focus on clarity and usability. Avoid decorative or flashy elements, animations, or unnecessary complexity. Prioritize readability, fast interactions, and efficiency, as the application is intended for daily use by professionals.

---

## UI Library

The AI agent should:

- Evaluate and choose a UI library best suited for:
  - Grid layouts
  - Mobile performance
  - Theming

- Examples (not mandatory):
  - React Native Paper
  - Tamagui
  - NativeWind

Decision must prioritize:

- Performance
- Simplicity
- Maintainability

---

# 🏗️ Architecture (MANDATORY)

Follow **layered clean architecture**:

## 1. Presentation Layer

- Screens
- UI Components
- Hooks (UI-specific only)

## 2. State Layer (Zustand)

- Feature-based stores
- No direct API calls in components

## 3. Business Logic Layer (Services / Use Cases)

- Pure logic
- No UI code
- Handles validation, transformations

## 4. Repository Layer (IMPORTANT)

- Implemented as **classes**
- Responsible for:
  - Database calls (Supabase)
  - Mapping data models

## 5. Core Layer

- Types / Interfaces
- Utilities
- Constants

---

## Folder Structure (Example)

```
src/
  core/
  modules/
    auth/
    customers/
    payments/
    plans/
    dashboard/
  shared/
    components/
    hooks/
```

---

# 🧩 Multi-Tenancy Rules

- Every table must include `tenant_id`
- All queries MUST filter by tenant
- No cross-tenant data access

---

# 🗄️ Database Design (Supabase / PostgreSQL)

## Tenants

```
id (uuid, pk)
name
max_nb_users
created_at
```

---

## Users

```
id (uuid, pk)
username
phone_number
role (admin | user)
tenant_id (fk)
created_at
```

---

## Plans

```
id (uuid, pk)
name
price (numeric, nullable)
is_custom_price (boolean)
tenant_id (fk)
created_at
```

---

## Customers

```
id (uuid, pk)
name
phone_number
address
active (boolean)
plan_id (fk)
tenant_id (fk)
start_date (date)
created_at
updated_at
```

---

## Payments

```
id (uuid, pk)
customer_id (fk)
plan_id (fk)
tenant_id (fk)
billing_month (date, first day of month)
amount (numeric)
paid_at (timestamp)
created_at
```

---

## Constraints

- UNIQUE(customer_id, billing_month)
- Index on all `tenant_id`
- Foreign keys with proper ON DELETE rules

---

# 📊 Core System Concept

## Monthly Timeline

- Months are NOT stored in DB
- Generated dynamically in UI
- Payments are the source of truth

---

## Month Status Logic

```
if payment exists → PAID
else if month < current → UNPAID
else → FUTURE
```

---

# 🔐 Authentication

- Use Supabase Auth
- Store tenant_id in user metadata
- Load user context on app start

---

# 🧩 Application Phases & Scenarios

---

# 1. Authentication

## Scenario: Login

- User logs in
- Load:
  - user id
  - role
  - tenant_id

## Edge Cases

- Invalid credentials
- Expired session
- Missing tenant mapping

---

# 2. Plans Management (Admin Only)

## Scenarios

### Fixed Plan

- Has price

### Custom Plan

- No fixed price
- `is_custom_price = true`

## Edge Cases

- Duplicate names per tenant
- Invalid price

---

# 3. Customer Management

## Scenarios

- Create customer
- Assign plan
- Activate / deactivate

## Edge Cases

- Plan change
- Customer without plan
- Future start_date

---

# 4. Monthly View (Core UI)

## Behavior

- Display months for selected year
- Navigation:
  - Previous year
  - Next year

## Visual States

- Green → Paid
- Red → Unpaid
- Gray → Future

---

# 5. Payment Flow

## Trigger

User taps a month

---

## Scenario A: Fixed Plan

- Amount = plan.price
- Input disabled

---

## Scenario B: Optional Custom

- Radio:
  - Plan price
  - Custom price

- Input enabled only if custom

---

## Scenario C: Fully Custom Plan

- Input required
- No default price

---

## Insert Payment

- Store:
  - billing_month
  - amount (SNAPSHOT)
  - plan_id
  - tenant_id

---

## Edge Cases

- Duplicate payment → reject
- Paying future month → allowed
- Invalid amount → reject
- Rapid multiple taps → prevent duplicates

---

# 6. UI/UX Behavior

## Customer List

- Show:
  - unpaid months summary
  - status indicator

---

## Customer Details

- Header:
  - name
  - plan
  - status

- Monthly grid

---

## Interaction

- Tap → open popup
- Paid → show details
- Unpaid → allow payment

---

# 7. Dashboard (Admin)

## Metrics

- Total customers
- Active customers
- Monthly revenue
- Unpaid customers

---

# 8. Data Querying Rules

## MUST

- Always filter by tenant_id
- Use pagination for large datasets
- Avoid N+1 queries

---

## Example

```
SELECT * FROM customers
WHERE tenant_id = ?
```

---

# 9. State Management (Zustand)

## Rules

- One store per feature
- No business logic in components
- Async logic inside store actions or services

---

# 10. Repository Layer

## Rules

- Implement as classes
- Example:

```
class PaymentRepository {
  createPayment()
  getPaymentsByCustomer()
}
```

---

# 11. Business Logic Layer

Handles:

- Payment validation
- Month status calculation
- Amount selection logic

---

# 12. Validation Rules

- amount > 0
- billing_month normalized (YYYY-MM-01)
- plan belongs to tenant
- customer belongs to tenant

---

# 13. Performance Considerations

- Index tenant_id
- Index billing_month
- Cache frequently accessed data
- Use memoization in UI

---

# 14. Future Scalability

Design must support:

- Subscription history
- Partial payments
- Notifications
- Offline mode
- Multi-currency

---

# 15. Critical Rules (NON-NEGOTIABLE)

- NEVER derive amount from plan after payment
- ALWAYS store amount snapshot
- NEVER store months in DB
- ALWAYS enforce tenant isolation

---

# ✅ Final Deliverables Expected from AI Agent

- Full React Native app
- Clean architecture implementation
- Supabase integration
- Scalable database schema
- Reusable UI components
- Proper state management
- Error handling
- Edge case coverage

---

# 🚀 End of Specification
