# Proshop GraphQL API — Human-Readable Schema Guide

This guide explains the Proshop GraphQL API in plain language so you can find the operations and fields you need without reading the raw schema file.

---

## Basics

- **What it is:** A GraphQL API for reading and writing Proshop data (work orders, parts, contacts, purchase orders, etc.).
- **Full schema file:** `PS-API-Schema.gql` (very large; use this doc for orientation, then search the `.gql` file for exact field names).
- **Root operations:** You either **query** (read) or **mutate** (create/update/delete).

**Pagination (lists):** List operations take:

- `filter` — narrow results (e.g. status, customer)
- `query` — sort/search options
- `pageSize` — how many per page (default 20)
- `pageStart` — 0-based index to start from

Responses look like: `{ totalRecords, records: [ ... ] }`.

---

## Authentication

- Obtain a session token (e.g. via `POST /api/beginsession` with username, password, scope).
- Send it on each request: `Authorization: Bearer <token>`.
- Scopes control what you can read/write (e.g. `workorders:r`, `parts:r`, `toolpots:r`).

---

## Work Orders (most used for import)

### Get a list of work orders

**Operation:** `workOrders`

**Arguments:** `pageSize`, `pageStart`, `filter` (WorkOrderFilter), optional `query` (WorkOrderQuery)

**Example:**

```graphql
query GetWorkOrders($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
  workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
    totalRecords
    records {
      workOrderNumber
      status
      dueDate
      notes
      defaultRouting
      type
      class
      part { partNumber }
      customer { name }
      ops(filter: { workCenter: ["ENGINEERING"] }, pageSize: 50) {
        records { operationNumber }
      }
    }
  }
}
```

**WorkOrderFilter (main fields you can filter by):**

| Filter field       | Type     | Use |
|--------------------|----------|-----|
| status             | [String] | e.g. `["Active"]` |
| customer           | [String] | Customer name(s) |
| part               | [String] | Part number(s) |
| defaultRouting     | [String] | Routing code(s) |
| type               | [String] | WO type |
| class              | [String] | WO class |
| workOrderNumber    | [String] | WO number(s) |

There is **no** filter for “work center” or “ops work center” on the work order list. To get “only work orders that have an operation in ENGINEERING,” fetch work orders (e.g. Active only) and include the `ops` field with `filter: { workCenter: ["ENGINEERING"] }`, then keep only those where `ops.records` has at least one item.

### Fields on WorkOrder (commonly used)

| Field              | Type   | Notes |
|--------------------|--------|--------|
| workOrderNumber    | String!| WO number (e.g. 26-0181) |
| status             | String | e.g. Active |
| dueDate            | String | Customer due date |
| notes              | String | WO notes (may contain HTML) |
| defaultRouting     | String | Preferred routing |
| type               | String | WO type |
| class              | String | WO class |
| part               | Part   | Use `part { partNumber }` (description not available on this nested type) |
| customer           | Contact| Use `customer { name }` |
| ops(filter, pageSize, pageStart) | PaginatedWorkOrderOperationResult! | Operations; filter by workCenter here |

**Important:** On the work order’s `part` selection, the API does **not** allow `description`. Use the single-part query (below) to get part description by part number.

### Get one work order by number

**Operation:** `workOrder(workOrderNumber: String!)`

**Returns:** One `WorkOrder` (same fields as in the list above).

---

## Work order operations (ops)

Each work order has an **ops** list (operations). Each operation can have a work center.

**WorkOrderOperationFilter:**

| Field           | Type     | Use |
|-----------------|----------|-----|
| workCenter      | [String] | e.g. `["ENGINEERING"]` to get only ENGINEERING ops |
| operationNumber | [String] | Op number(s) |
| isOpComplete    | Boolean  | Completion flag |
| runTimeSpent    | [String] | |

**WorkOrderOperation (fields we care about):**

| Field               | Type   | Notes |
|---------------------|--------|--------|
| operationNumber     | String | |
| workCenter          | WorkCell | Object (machine/resource) |
| workCenterPlainText | String | Work center name (e.g. ENGINEERING) |

So: to get “Active work orders that have at least one operation in ENGINEERING,” query `workOrders` with `filter: { status: ["Active"] }`, request `ops(filter: { workCenter: ["ENGINEERING"] }, pageSize: 50) { records { operationNumber } }`, and keep only work orders where `ops.records.length > 0`.

---

## Parts

### Get one part by part number

**Operation:** `part(partNumber: String!)`

**Returns:** One `Part`.

**Example:**

```graphql
query GetPart($partNumber: String!) {
  part(partNumber: $partNumber) {
    partNumber
    partDescription
  }
}
```

**Part (commonly used fields):**

| Field           | Type   | Notes |
|-----------------|--------|--------|
| partNumber      | String | |
| partDescription | String | Short description (use this for “part name” in imports). The field `description` is not allowed in this API. |

Use this query when you need part description; it is not available on `workOrder.part`.

### Get a list of parts

**Operation:** `parts` with PartFilter, PartQuery, pageSize, pageStart.

---

## Contacts (customers)

**Single:** `contact(name: String!)` → Contact (e.g. `name`, `companyName`).

**List:** `contacts` with ContactFilter, ContactQuery, pageSize, pageStart.

---

## Mutations (writes)

Mutations follow a pattern:

- **Create:** `add<Entity>` (e.g. `addWorkOrder`, `addPart`) with an input type.
- **Update:** `update<Entity>` with key (e.g. `workOrderNumber`) and update input.
- **Delete:** `delete<Entity>` with key.

Examples:

- `updateWorkOrder(workOrderNumber: String!, …)` — update a work order.
- `updateWorkOrderOperation(woNumber, opNumber, …)` — update an operation.
- `deleteWorkOrder(workOrderNumber: String!)` — delete a work order.

For exact argument and input shapes, search in `PS-API-Schema.gql` for the mutation name and the corresponding `Input` type.

---

## Naming conventions

- **Types:** `WorkOrder`, `Part`, `Contact`, etc.
- **Filters:** `WorkOrderFilter`, `PartFilter`, etc.
- **List results:** `PaginatedWorkOrderResult!` with `records` and `totalRecords`.
- **Inputs for create:** `AddWorkOrderInput`, `AddPartInput`, etc.
- **Inputs for update:** `UpdateWorkOrderInput`, etc.

---

## Quick reference: import-related operations

| Goal | Operation | Key arguments / notes |
|------|------------|------------------------|
| Active work orders | `workOrders` | `filter: { status: ["Active"] }` |
| Only WOs with ENGINEERING op | Same + in each WO request `ops(filter: { workCenter: ["ENGINEERING"] })` and keep WOs where `ops.records` non-empty |
| Part number + description | `part(partNumber: String!)` | Request `partNumber`, `partDescription` (not `description`) |
| Customer name on WO | Inside `workOrders.records` | `customer { name }` |

For full field lists and every filter/input, open `PS-API-Schema.gql` and search for the type or input name (e.g. `type WorkOrder`, `input WorkOrderFilter`).
