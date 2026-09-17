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
        // Green when the calculated tax matches the user-entered tax amount,
        // red only when there is an actual mismatch (bTaxMismatch is the
        // same flag used to show the tax mismatch MessageStrip).
        taxAmountState: function (sTaxAmount, bTaxMismatch) {
            if (!(parseFloat(sTaxAmount) > 0)) {
                return "None";
            }
            return bTaxMismatch ? "Error" : "Success";
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
