sap.ui.define([], function () {
    "use strict";

    return Object.freeze({

        // ── Transaction type → sap.ui.core.ValueState ───────────────────────
        transactionTypeState: function (sTxType) {
            if (sTxType === "AR") return "Success";
            if (sTxType === "AP") return "Error";
            return "Warning";
        },

        // ── Balance boolean → state / text / icon ────────────────────────────
        balancedState: function (bIsBalanced) {
            return bIsBalanced ? "Success" : "Error";
        },

        balancedText: function (bIsBalanced) {
            return bIsBalanced ? "Balanced ✓" : "Unbalanced ✗";
        },

        balancedIcon: function (bIsBalanced) {
            return bIsBalanced ? "sap-icon://accept" : "sap-icon://decline";
        },

        // ── Tax amount → sap.ui.core.ValueState ─────────────────────────────
        // Moves parseFloat() out of XML expression binding — now independently testable.
        taxAmountState: function (sTaxAmount) {
            return parseFloat(sTaxAmount) > 0 ? "Error" : "None";
        },

        // ── Fiscal period display — composite binding (period, year) ─────────
        fiscalPeriodText: function (sPeriod, sYear) {
            return (sPeriod && sYear) ? (sPeriod + " / " + sYear) : "— enter posting date";
        },

        // ── Amount + currency display — composite binding ─────────────────────
        amountWithCurrency: function (sAmount, sCurrency) {
            return (sAmount || "0.00") + " " + (sCurrency || "");
        },

        // ── Company code + name combined label ────────────────────────────────
        companyCodeDisplay: function (sCC, sCCName) {
            if (!sCC) return "—";
            return sCCName ? (sCC + "  (" + sCCName + ")") : sCC;
        },

        // ── Null coalescing: display placeholder for optional model fields ─────
        nullable: function (sValue) {
            return sValue || "—";
        }

    });
});
