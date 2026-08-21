sap.ui.define([], function () {
    "use strict";

    return Object.freeze({

        // ── Transaction type identifiers ─────────────────────────────────────────
        // Used in RadioButtonGroup selection, model comparisons, and service calls.
        TRANSACTION_TYPE: Object.freeze({
            AR:      "AR",
            AP:      "AP",
            ACCRUAL: "Accrual"
        }),

        // ── SAP document type codes ──────────────────────────────────────────────
        // Codes only. Display labels live in i18n as "documentType.IC" / "documentType.IA".
        DOCUMENT_TYPE: Object.freeze({
            IC: "IC",
            IA: "IA"
        }),

        // ── SAP posting direction indicators ────────────────────────────────────
        // German accounting convention: Soll (S) = Debit, Haben (H) = Credit.
        DC_INDICATOR: Object.freeze({
            DEBIT:  "S",
            CREDIT: "H"
        }),

        // ── Workflow status codes ────────────────────────────────────────────────
        WORKFLOW_STATUS: Object.freeze({
            DRAFT:     "DRAFT",
            SUBMITTED: "SUBMITTED"
        }),

        // ── SAP ABAP message type codes ──────────────────────────────────────────
        MSG_TYPE: Object.freeze({
            ERROR:   "E",
            WARNING: "W",
            SUCCESS: "S"
        }),

        // ── SAP ABAP message class identifiers ───────────────────────────────────
        // ZFI = custom Interco message class; F5 = standard FI message class.
        // Not environment-specific — these are fixed by the ABAP system design.
        MSG_CLASS: Object.freeze({
            ZFI: "ZFI",
            F5:  "F5"
        }),

        // ── Application-level defaults ───────────────────────────────────────────
        // Used only in _initModel as seed values before user interaction or
        // FLP user-parameter lookup overrides them.
        DEFAULT: Object.freeze({
            INITIATOR_CC:  "1110",
            CURRENCY:      "USD",
            IC_TX_TYPE:    "Gross",
            VAT_TREATMENT: "Exempt"
        }),

        // ── Balance tolerance ────────────────────────────────────────────────────
        // Maximum absolute Dr/Cr difference to be considered balanced.
        // Accounts for floating-point rounding on tax-inclusive amounts.
        BALANCE_TOLERANCE: 0.005

    });
});
