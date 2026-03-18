# ProShop GraphQL API — Reference Summary

This document is a human- and AI-friendly summary of the ProShop GraphQL schema in `PS-API-Schema.gql`. Use it for quick lookup; use the `.gql` file for full field-level details.

---

## Overview

- **Source schema:** `PS-API-Schema.gql` (~810k chars, 43k+ lines)
- **Definition count:** ~1,474 types (input, type, enum, scalar, union, interface)
- **Root operations:** `Query` (read) and `Mutation` (create/update/delete/overwrite)

**Pagination pattern (list queries):** Most list fields accept:
- `filter` — module-specific filter input
- `query` — module-specific query/sort input
- `pageSize` (default 20)
- `pageStart` (0-based index)

List results are typically `Paginated<Entity>Result!` with a list of items and pagination info.

---

## Query Operations (Read)

| Operation | Args | Returns | Notes |
|-----------|------|---------|--------|
| **Single-record** | | | |
| `approval` | `approvalId: String!` | Approval | |
| `auditReport` | `auditId: String!` | AuditReport | |
| `bill` | `billId: String!` | Bill | |
| `classification` | `classificationId: String!` | Classification | |
| `clockPunch` | — | ClockPunchData | |
| `companyPosition` | `positionName: String!` | CompanyPosition | |
| `contact` | `name: String!` | Contact | |
| `correctiveActionRequest` | `carId: String!` | CorrectiveActionRequest | |
| `cotsItem` | `otsId: String!` | COTS | |
| `customerPO` | `poId: String!` | CustomerPO | |
| `customerSatisfactionSurvey` | `surveyId: String!` | CustomerSatisfactionSurvey | |
| `document` | `documentId: String!` | Document | |
| `editLog` | `editLog: String!` | EditLog | |
| `equipment` | `tool: String!` | Equipment | |
| `estimate` | `estimateId: String!` | Estimate | |
| `estimateArchive` | `uniqueId: String!` | EstimateArchive | |
| `fixture` | `fixtureNumber: String!` | Fixture | |
| `format` | `formatId: String!` | Format | |
| `invoice` | `invoiceId: String!` | Invoice | |
| `merchandise` | `uniqueId: String!` | Merchandise | |
| `message` | `id: String!` | Message | |
| `moduleConfiguration` | `module: ProShopModule!` | ModuleConfiguration | |
| `nonConformanceReport` | `ncrRefNumber: String!` | NonConformanceReport | |
| `packingSlip` | `id: String!` | PackingSlip | |
| `par` | `parId: String!` | RiskAndOpportunity | |
| `part` | `partNumber: String!` | Part | |
| `partArchive` | `uniqueId: String!` | PartArchive | |
| `purchaseOrder` | `id: String!` | PurchaseOrder | |
| `qualityManualSection` | `sectionId: String!` | QualityManualSection | |
| `qualityProcedure` | `docNumber: String!` | QualityProcedure | |
| `quote` | `quoteId: String!` | Quote | |
| `returnMaterialAuthorization` | `rmaId: String!` | ReturnMaterialAuthorization | |
| `rta` | `rtaNumber: String!` | RTA | |
| `session` | — | ProShopSession | |
| `smartTrips` | `uniqueId: String!` | SmartTrips | |
| `standardSection` | `uniqueId: String!` | StandardSection | |
| `systemConfig` | — | ProShopSystemConfig | |
| `task` | `taskId: String!` | Task | |
| `tool` | `toolNumber: String!` | Tool | |
| `training` | `trainingId: String!` | Training | |
| `user` | `id: String!` | User | |
| `workCell` | `potId: String!` | WorkCell | |
| `workOrder` | `workOrderNumber: String!` | WorkOrder | |

| **Paginated lists** | **Filter / Query** | **Returns** |
|---------------------|--------------------|-------------|
| `approvals` | ApprovalFilter, ApprovalQuery | PaginatedApprovalResult! |
| `auditReports` | AuditReportFilter, AuditReportQuery | PaginatedAuditReportResult! |
| `bills` | BillFilter, BillQuery | PaginatedBillResult! |
| `classifications` | ClassificationFilter, ClassificationQuery | PaginatedClassificationResult! |
| `companyPositions` | CompanyPositionFilter, CompanyPositionQuery | PaginatedCompanyPositionResult! |
| `contacts` | ContactFilter, ContactQuery | PaginatedContactResult! |
| `correctiveActionRequests` | CorrectiveActionRequestFilter, CorrectiveActionRequestQuery | PaginatedCorrectiveActionRequestResult! |
| `cotsItems` | COTSFilter, COTSQuery | PaginatedCOTSResult! |
| `customerPOs` | CustomerPOFilter, CustomerPOQuery | PaginatedCustomerPOResult! |
| `customerSurveys` | CustomerSatisfactionSurveyFilter, CustomerSatisfactionSurveyQuery | PaginatedCustomerSatisfactionSurveyResult! |
| `documents` | DocumentFilter, DocumentQuery | PaginatedDocumentResult! |
| `equipments` | EquipmentFilter, EquipmentQuery | PaginatedEquipmentResult! |
| `estimates` | EstimateFilter, EstimateQuery | PaginatedEstimateResult! |
| `estimatesArchive` | EstimateArchiveFilter, EstimateArchiveQuery | PaginatedEstimateArchiveResult! |
| `fixtures` | FixtureFilter, FixtureQuery | PaginatedFixtureResult! |
| `formats` | FormatFilter, FormatQuery | PaginatedFormatResult! |
| `globalSearches` | ProShopGlobalSearchDefinitionFilter | PaginatedProShopGlobalSearchDefinitionResult! |
| `invoices` | InvoiceFilter, InvoiceQuery | PaginatedInvoiceResult! |
| `localSearches` | ProShopLocalSearchDefinitionFilter, userId: String! | PaginatedProShopLocalSearchDefinitionResult! |
| `messages` | MessageFilter, MessageQuery | PaginatedMessageResult! |
| `nonConformanceReports` | NonConformanceReportFilter, NonConformanceReportQuery | PaginatedNonConformanceReportResult! |
| `packingSlips` | PackingSlipFilter, PackingSlipQuery | PaginatedPackingSlipResult! |
| `pars` | RiskAndOpportunityFilter, RiskAndOpportunityQuery | PaginatedRiskAndOpportunityResult! |
| `parts` | PartFilter, PartQuery | PaginatedPartResult! |
| `partsArchive` | PartArchiveFilter, PartArchiveQuery | PaginatedPartArchiveResult! |
| `purchaseOrders` | PurchaseOrderFilter, PurchaseOrderQuery | PaginatedPurchaseOrderResult! |
| `qualityManual` | QualityManualSectionFilter, QualityManualSectionQuery | PaginatedQualityManualSectionResult! |
| `qualityProcedures` | QualityProcedureFilter, QualityProcedureQuery | PaginatedQualityProcedureResult! |
| `quotes` | QuoteFilter, QuoteQuery | PaginatedQuoteResult! |
| `returnMaterialAuthorizations` | ReturnMaterialAuthorizationFilter, ReturnMaterialAuthorizationQuery | PaginatedReturnMaterialAuthorizationResult! |
| `rtas` | RTAFilter, RTAQuery | PaginatedRTAResult! |
| `standards` | StandardSectionFilter, StandardSectionQuery | PaginatedStandardSectionResult! |
| `systemSearches` | ProShopGlobalSearchDefinitionFilter | PaginatedProShopGlobalSearchDefinitionResult! |
| `tasks` | TaskFilter, TaskQuery | PaginatedTaskResult! |
| `tools` | ToolFilter, ToolQuery | PaginatedToolResult! |
| `trainings` | TrainingFilter, TrainingQuery | PaginatedTrainingResult! |
| `users` | UserFilter, UserQuery | PaginatedUserResult! |
| `workCells` | WorkCellFilter, WorkCellQuery | PaginatedWorkCellResult! |
| `workOrders` | WorkOrderFilter, WorkOrderQuery | PaginatedWorkOrderResult! |
| `writeCheckouts` | WriteCheckoutRecordFilter, module?, userId: String! | PaginatedWriteCheckoutRecordResult! |

**Deprecated:** `riskAndOpportunity` / `risksAndOpportunities` — use `par` / `pars`. `vendorPO` / `vendorPOs` — use `purchaseOrder` / `purchaseOrders`.

---

## Mutation Operations (Write)

### Add (create)

| Mutation | Input | Returns |
|----------|--------|---------|
| addBill | AddBillInput | Bill |
| addClassification | AddClassificationInput | Classification |
| addCompanyPosition | AddCompanyPositionInput | CompanyPosition |
| addContact | AddContactInput | Contact |
| addCorrectiveActionRequest | AddCorrectiveActionRequestInput | CorrectiveActionRequest |
| addCOTS | AddCOTSInput | COTS |
| addCustomerPo | AddCustomerPoInput! | CustomerPO |
| addCustomLink | CustomLinkDefinitionInput, module: ProShopModule | Boolean |
| addDocument | AddDocumentInput | Document |
| addEquipment | AddEquipmentInput | Equipment |
| addEstimate | AddEstimateInput! | Estimate |
| addEstimateOpComponents | estimateId!, opNumber!, opComponents | Boolean |
| addFixture | addFixtureInput | Fixture |
| addInvoice | AddInvoiceInput | Invoice |
| addNCR | AddNCRInput | NonConformanceReport |
| addPackingSlip | AddPackingSlipInput | PackingSlip |
| addPart | AddPartInput | Part |
| addPartOpComponents | partNumber!, opNumber!, opComponents | Boolean |
| addPreventiveActionRequest | AddPreventiveActionRequestInput | RiskAndOpportunity |
| addPurchaseOrder | AddPurchaseOrderInput! | PurchaseOrder |
| addQualityManual | AddQualityManualInput | QualityManualSection |
| addQualityProcedure | AddQualityProcedureInput | QualityProcedure |
| addQuote | AddQuoteInput | Quote |
| addRMA | AddRMAInput | ReturnMaterialAuthorization |
| addRTA | AddRTAInput | RTA |
| addSavedSearch | AddSavedSearchInput!, module!, searchScope! | ProShopSearchDefinition |
| addStandard | AddStandardInput | StandardSection |
| addTask | AddTaskInput | Task |
| addTimeClockPunch | AddTimeClockPunchDataInput?, operator? | ClockPunch |
| addTool | AddToolInput | Tool |
| addTraining | AddTrainingInput | Training |
| addUser | AddUserInput | User |
| addWorkCell | AddWorkCellInput | WorkCell |
| addWorkOrder | AddWorkOrderInput | WorkOrder |

### Update (patch)

| Mutation | Key args | Input | Returns |
|----------|-----------|--------|---------|
| updateBill | billId! | UpdateBillInput | Bill |
| updateClassification | classificationId! | UpdateClassificationInput | Classification |
| updateCompanyPosition | positionName! | UpdateCompanyPositionInput! | CompanyPosition |
| updateContact | name! | UpdateContactInput | Contact |
| updateCorrectiveActionRequest | carId! | UpdateCorrectiveActionRequestInput | CorrectiveActionRequest |
| updateCOTS | otsId! | UpdateCOTSInput! | COTS |
| updateCustomerPo | poId? | UpdateCustomerPoInput | CustomerPO |
| updateCustomLink | — | linkDefinition?, module? | Boolean |
| updateDocument | documentId! | UpdateDocumentInput | Document |
| updateEffectivenessNumbers | userId!, dateInRange! | — | UpdateEffectivenessNumbersResponse |
| updateEquipment | tool! | UpdateEquipmentInput! | Equipment |
| updateEstimate | estimateId! | UpdateEstimateInput | Estimate |
| updateFixture | fixtureNumber? | updateFixtureInput | Fixture |
| updateInvoice | invoiceId? | UpdateInvoiceInput | Invoice |
| updateNCR | ncrRefNumber? | UpdateNCRInput | NonConformanceReport |
| updatePackingSlip | id! | UpdatePackingSlipInput | PackingSlip |
| updatePart | partNumber! | UpdatePartInput | Part |
| updatePartOperation | partNumber?, opNumber? | updatePartOperationInput | Boolean |
| updatePreventiveActionRequest | parId? | UpdatePreventiveActionRequestInput | RiskAndOpportunity |
| updatePurchaseOrder | id! | UpdatePurchaseOrderInput | PurchaseOrder |
| updateQualityManual | sectionId! | UpdateQualityManualInput! | QualityManualSection |
| updateQualityProcedure | docNumber! | UpdateQualityProcedureInput | QualityProcedure |
| updateQuote | quoteId! | UpdateQuoteInput | Quote |
| updateRMA | rmaid! | UpdateRMAInput | ReturnMaterialAuthorization |
| updateRTA | rtaNumber! | UpdateRTAInput | RTA |
| updateSavedSearch | module!, searchScope!, queryId?, userId? | UpdateSavedSearchInput! | ProShopSearchDefinition |
| updateStandard | uniqueId! | UpdateStandardInput | StandardSection |
| updateSystemSettings | — | UpdateSystemSettingsInput | OtherSettings |
| updateTask | taskId! | UpdateTaskInput | Task |
| updateTimeClockPunch | clockPunchId!, operator?, year? | UpdateTimeClockPunchDataInput | ClockPunch |
| updateTimeTracking | id!, userId? | updateTimeTrackingInput! | TimeTrackingEntry |
| updateTool | toolNumber! | UpdateToolInput | Tool |
| updateTraining | trainingId! | UpdateTrainingInput | Training |
| updateUser | id! | UpdateUserInput | User |
| updateUserDisplayPrefs | id! | UpdateUserDisplayPrefsInput | User |
| updateUserPrefs | id! | UpdateUserPrefsInput | User |
| updateUserQuickJumpPrefs | id! | UpdateUserQuickJumpPrefsInput | User |
| updateWorkCell | potId! | UpdateWorkCellInput! | WorkCell |
| updateWorkCellPocket | potId! | pockets: [WorkCellPocketRow!] | WorkCell |
| updateWorkOrder | workOrderNumber! | UpdateWorkOrderInput | WorkOrder |
| updateWorkOrderIPC | workOrderNumber!, data!, flOverwriteData? | [UpdateWorkOrderIPCInput!]! | WorkOrder |
| updateWorkOrderOperation | woNumber?, opNumber? | updateWorkOrderOperationInput | Boolean |

### Delete

Each entity has a matching `delete<Entity>` mutation; key argument is the entity’s ID (e.g. `billId`, `name`, `partNumber`, `workOrderNumber`). Examples:

- deleteBill(billId!), deleteContact(name!), deletePart(partNumber!), deleteWorkOrder(workOrderNumber!), deleteTimeClockPunch(clockPunchId!, operator?, year?), deleteWriteCheckout(uniqueId!, userId!).

### Overwrite (replace whole record)

| Mutation | Key args | Input | Returns |
|----------|-----------|--------|---------|
| overwriteBill | billId! | OverwriteBillInput | Bill |
| overwriteCompanyPosition | positionName! | OverwriteCompanyPositionInput! | CompanyPosition |
| overwriteContact | name! | OverwriteContactInput | Contact |
| overwriteCorrectiveActionRequest | carId! | OverwriteCorrectiveActionRequestInput | CorrectiveActionRequest |
| overwriteCOTS | otsId! | OverwriteCOTSInput | COTS |
| overwriteCustomerPo | poId? | OverwriteCustomerPoInput | CustomerPO |
| overwriteFixture | fixtureNumber? | overwriteFixtureInput | Fixture |
| overwriteInvoice | invoiceId? | OverwriteInvoiceInput | Invoice |
| overwritePurchaseOrder | id! | OverwritePurchaseOrderInput! | PurchaseOrder |
| overwriteRTA | rtaNumber! | OverwriteRTAInput | RTA |
| overwriteUser | id! | OverwriteUserInput | User |
| overwriteWorkCell | potId! | OverwriteWorkCellInput! | WorkCell |

### Time & session

| Mutation | Args | Returns |
|----------|------|---------|
| timeClockPunchIn | — | ClockPunch |
| timeClockPunchOut | — | ClockPunch |
| timeTrackingLogin | TimeTrackingLoginInput | TimeTrackingEntry |
| timeTrackingLogout | id!, timeOut?, userId? | Boolean |
| timeTrackingPause | id!, timeOut?, userId? | Boolean |
| timeTrackingUnpause | id!, userId? | Boolean |

### Other

- **finalizeWorkOrder** — `routing?`, `workOrderNumber!` → Boolean  
- **deleteWriteCheckout** — `uniqueId!`, `userId!` → Boolean  

---

## Main Entity ↔ Input Naming

- **Single record:** type name matches domain (e.g. `Bill`, `Contact`, `Part`, `WorkOrder`).
- **Add:** `Add<Entity>Input` (e.g. AddBillInput, AddContactInput).
- **Update:** `Update<Entity>Input` (e.g. UpdateBillInput, UpdateContactInput).
- **Overwrite:** `Overwrite<Entity>Input` where supported (see table above).
- **Filters/lists:** `<Entity>Filter`, `<Entity>Query`, `Paginated<Entity>Result!`.

For field-level definitions (including all scalars and enums), search in `PS-API-Schema.gql` for the type name (e.g. `type Bill`, `input AddBillInput`).

---

## Quick entity list (by domain)

- **Finance / orders:** Bill, Invoice, CustomerPO, PurchaseOrder, Quote, PackingSlip, RMA, RTA  
- **Quality / compliance:** Approval, AuditReport, CorrectiveActionRequest, NonConformanceReport, RiskAndOpportunity (PAR), CustomerSatisfactionSurvey, QualityManualSection, QualityProcedure, StandardSection  
- **Manufacturing / shop:** Part, PartArchive, WorkOrder, Estimate, EstimateArchive, COTS, Tool, Equipment, Fixture, WorkCell  
- **People / org:** Contact, User, CompanyPosition, Training, ClockPunch, TimeTrackingEntry  
- **Documents / content:** Document, Format, Message, EditLog  
- **Config / system:** ProShopSession, ProShopSystemConfig, ModuleConfiguration, ProShopModule, Saved searches (global/local/system), WriteCheckouts  

Use this file for quick lookup; use `PS-API-Schema.gql` for exact types and fields.
