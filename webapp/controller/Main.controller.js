sap.ui.define([
    "ZFI_INTERCO/controller/BaseController",
    "ZFI_INTERCO/service/MasterDataService",
    "ZFI_INTERCO/util/Constants",
    "ZFI_INTERCO/util/Helper",
    "ZFI_INTERCO/util/Formatter",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "ZFI_INTERCO/util/InitiatorGLTemplate",
    "ZFI_INTERCO/util/RecipientGLTemplate"
], function (BaseController, MasterDataService, Constants, Helper, Formatter, JSONModel, Filter, FilterOperator, MessageBox, MessageToast, Fragment, InitiatorGLTemplate, RecipientGLTemplate) {
    "use strict";

    // ─── GL row counter ────────────────────────────────────────────────────────
    var _rowCounter = 1;

    return BaseController.extend("ZFI_INTERCO.controller.Main", {

        formatter: Formatter,

        // ─────────────────────────────────────────────────────────────────────
        // Lifecycle
        // ─────────────────────────────────────────────────────────────────────

        onInit: function () {
            _rowCounter = 1;
            this._pCCDialog = null;
            this._sCCPicklistMode = "";
            this._pDocTypeDialog = null;
            this._pBPDialog = null;
            this._initModel();
            this._loadReferenceData();
            // Load all IC records on startup
           this._loadJournalEntries();
        },


        _fetchAllPages: function (sInitialUrl) {
            var sServiceRoot =
                "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
            var aAllResults = [];

            function fetchPage(sUrl) {
                return fetch(sUrl, {
                    method: "GET",
                    headers: { "Accept": "application/json" }
                })
                .then(function (oResponse) {
                    if (!oResponse.ok) {
                        throw new Error(
                            "HTTP " + oResponse.status + " " + oResponse.statusText
                        );
                    }
                    return oResponse.json();
                })
                .then(function (oData) {
                    aAllResults = aAllResults.concat(oData.value || []);
                    var sNextLink = oData["@odata.nextLink"];
                    if (sNextLink) {
                        var sNextUrl =
                            (sNextLink.indexOf("http") === 0 || sNextLink.indexOf("/") === 0)
                                ? sNextLink
                                : sServiceRoot + sNextLink;
                        return fetchPage(sNextUrl);
                    }
                    return aAllResults;
                });
            }

            return fetchPage(sInitialUrl);
        },

    _loadJournalEntries: function (oFilters) {

    var oModel = this.getView().getModel();

    var sUrl =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/" +
        "ZC_INTERCO_JE_HEADER";

    var aParams = [];

    aParams.push(
        "$select=" +
        [
            "accountingdocument_temp",
            "in_companycode",
            "rec_companycode",
            "in_accountingdocument",
            "rec_accountingdocument",
            "documentreferenceid",
            "documentdate",
            "postingdate",
            "amount",
            "currencycode",
            "createdbyuser"
        ].join(",")
    );

    if (oFilters) {

        var aFilterParts = [];

        if (oFilters.in_companycode) {
            aFilterParts.push(
                "in_companycode eq '" +
                encodeURIComponent(oFilters.in_companycode).replace(/%20/g, " ") +
                "'"
            );
        }

        if (oFilters.rec_companycode) {
            aFilterParts.push(
                "rec_companycode eq '" +
                encodeURIComponent(oFilters.rec_companycode).replace(/%20/g, " ") +
                "'"
            );
        }

        if (aFilterParts.length > 0) {
            aParams.push(
                "$filter=" + aFilterParts.join(" and ")
            );
        }
    }

    var sRequestUrl = sUrl + "?" + aParams.join("&");

    console.log("Journal Entries URL:", sRequestUrl);

    this._fetchAllPages(sRequestUrl)
    .then(function (aResults) {

        var mInitiator = {};
        var mRecipient = {};
        var aInitiatorOptions = [];
        var aRecipientOptions = [];

        aResults.forEach(function (oRow) {
            if (oRow.in_companycode && !mInitiator[oRow.in_companycode]) {
                mInitiator[oRow.in_companycode] = true;
                aInitiatorOptions.push({ companyCode: oRow.in_companycode });
            }
            if (oRow.rec_companycode && !mRecipient[oRow.rec_companycode]) {
                mRecipient[oRow.rec_companycode] = true;
                aRecipientOptions.push({ companyCode: oRow.rec_companycode });
            }
        });

        oModel.setProperty("/referenceData/searchInitiatorCCOptions", aInitiatorOptions);
        oModel.setProperty("/referenceData/searchRecipientCCOptions", aRecipientOptions);

        console.log("Journal Entries loaded:", aResults.length, "total records");

        oModel.setProperty("/allSearchResults", aResults);
        oModel.setProperty("/searchResults", aResults);
        oModel.setProperty("/searchResultCount", aResults.length);

    })
    .catch(function (oError) {

        console.error("Error loading Journal Entries:", oError);

        oModel.setProperty("/allSearchResults", []);
        oModel.setProperty("/searchResults", []);
        oModel.setProperty("/searchResultCount", 0);

        sap.m.MessageToast.show("Unable to load Journal Entries.");
    });
},

        _loadReferenceData: function () {
            var oModel = this.getView().getModel();
            var that = this;
            // Fetch details for the default initiator CC on startup (targeted single-CC call)
            var sDefaultCC = oModel.getProperty("/headerData/initiatorCC") || Constants.DEFAULT.INITIATOR_CC;
            MasterDataService.getCompanyCodeDetails(sDefaultCC).then(function (oCC) {
                if (oCC) {
                    oModel.setProperty("/headerData/initiatorCCName",  oCC.name);
                    oModel.setProperty("/headerData/initiatorCountry", oCC.country);
                    if (oCC.country) {
                        MasterDataService.getTaxCodesByCountry(oCC.country).then(function (aCodes) {

                               var aInitiatorCodes = aCodes.filter(function (oCode) {
                                  return oCode.taxType === "A";
                                });
                            oModel.setProperty("/referenceData/initiatorTaxCodes", aInitiatorCodes);
                        });
                    }
                }
                that._loadUserDefaultCC();
            }).catch(function () {
                that._loadUserDefaultCC();
            });
            MasterDataService.getClosedPeriods().then(function (aPeriods) {
                oModel.setProperty("/referenceData/closedPeriods", aPeriods);
            });

            // Populate Document Type dropdown from service; fall back to known types if API is empty
            var aFallbackTypes = [
                { documentType: Constants.DOCUMENT_TYPE.IC, description: "" },
                { documentType: Constants.DOCUMENT_TYPE.IA, description: "" }
            ];
            MasterDataService.getDocumentTypes().then(function (aTypes) {
                oModel.setProperty("/referenceData/documentTypes",
                    (aTypes && aTypes.length) ? aTypes : aFallbackTypes);
            }).catch(function () {
                oModel.setProperty("/referenceData/documentTypes", aFallbackTypes);
            });
        },


        _initModel: function () {

            
            _rowCounter = 1;

            var oData = {

                  search: {
                            in_companycode: "",
                            rec_companycode: "",
                         accountingDocumentTemp: "",
                         inAccountingDocument: "",
                             recAccountingDocument: ""
    },
                headerData: {
                    transactionType: Constants.TRANSACTION_TYPE.AR,
                    transactionTypeIndex: 0,
                    documentType: Constants.DOCUMENT_TYPE.IC,
                    documentTypeCode: Constants.DOCUMENT_TYPE.IC,
                    taxInvoiceRequired: false,
                    taxInvoiceNumber: "",
                    taxInvoiceDate: "",
                    taxInvoiceDescription: "",
                    taxVATTreatment: Constants.DEFAULT.VAT_TREATMENT,

                    initiatorCC: Constants.DEFAULT.INITIATOR_CC,
                    initiatorCCName: "",
                    initiatorBP: "",
                    recipientBP: "",
                    recipientBPName: "",
                    reconciliationAccount: "",
                    recipientReconciliationAccount: "",
                    recipientCC: "",
                    recipientCCName: "",
                    partyValidationVisible: false,
                    partyValidationState: "None",
                    partyValidationText: "",

                    documentDate: "",
                    postingDate: "",
                    fiscalPeriod: "",
                    fiscalYear: "",
                    periodStatusState: "None",
                    periodStatusText: "— enter posting date",
                    periodStatusIcon: "sap-icon://question-mark",
                    reference: "",
                    headerText: "",
                    currency: Constants.DEFAULT.CURRENCY,

                    // New Intercompany Amount Fields
                    netAmount: "0.00",
                    taxAmount: "0.00",
                    totalIntercoAmount: "0.00",

                    initiatorTaxCode: "",
                    initiatorTaxAmount: "0.00",
                    initiatorCountry: "",
                    initiatorTaxCodeState: "None",
                    recipientTaxCode: "",
                    recipientTaxAmount: "0.00",
                    recipientCountry: "— (derived from Recipient CC)",
                    recipientTaxCodeState: "None",
                    taxCodeVisible: false,

                    // Field-level validation states (set by _validateRequiredFields, cleared on change)
                    initiatorCCState:  "None",
                    recipientBPState:  "None",
                    recipientCCState:  "None",
                    documentDateState: "None",
                    postingDateState:  "None",
                    referenceState:    "None",
                    headerTextState:   "None",
                    netAmountState:    "None",
                    taxCalcVisible: false,
                    taxCalcRows: [],
                    initiatorTaxMismatchVisible: false,
                    initiatorTaxMismatchText: "",
                    recipientTaxMismatchVisible: false,
                    recipientTaxMismatchText: ""

                    // comments: "",
                    // attachments: [
                    //     { fileName: "Recharge_Calculation_Apr26.xlsx", fileType: "XLSX", fileSize: "48 KB", uploader: "S.Wayland", uploadDate: "16.04.2026", isSystem: false }
                    // ]
                },

       

                initiatorLines: [
                    {
                        rowNum: 1,
                        isSystemLine: true,
                        debitCredit: Constants.DC_INDICATOR.DEBIT,
                        glAccount: "—",
                        businessPartner: "—",
                        amountDC: "0.00",
                        taxCode: "",
                        tradingPartner: "—",
                        partnerPrCtr: "",
                        wbsElement: "",
                        costCenter: "",
                        profitCenter: "",
                        internalOrder: "",
                        personnel: "",
                        contract: "",
                        contractType: "",
                        assignment: "",
                        itemText: "",
                        lineRef1: "",
                        lineRef2: "",
                        lineRef3: ""
                    }
                ],

                initiatorBalance: {
                    totalDebits: "0.00",
                    totalCredits: "0.00",
                    netAmount: "0.00",
                    isBalanced: false
                },

                initiatorValidation: {
                    visible: false,
                    state: "None",
                    text: "Not yet validated."
                },

                recipientLines: [
                    {
                        rowNum: 1,
                        isSystemLine: true,
                        debitCredit: Constants.DC_INDICATOR.CREDIT,
                        glAccount: "—",
                        businessPartner: "—",
                        amountDC: "0.00",
                        taxCode: "",
                        tradingPartner: "—",
                        partnerPrCtr: "",
                        wbsElement: "",
                        costCenter: "",
                        profitCenter: "",
                        internalOrder: "",
                        personnel: "",
                        contract: "",
                        contractType: "",
                        assignment: "",
                        itemText: "",
                        lineRef1: "",
                        lineRef2: "",
                        lineRef3: ""
                    }
                ],

                recipientBalance: {
                    totalDebits: "0.00",
                    totalCredits: "0.00",
                    netAmount: "0.00",
                    isBalanced: false
                },

                recipientValidation: {
                    visible: false,
                    state: "None",
                    text: "Not yet validated."
                },

                workflow: {
                    status: Constants.WORKFLOW_STATUS.DRAFT,
                    statusState: "Warning",
                    intercoRef: "[NEW — assigned on save]",
                    initiatorLineCount: 0
                },

                appState: {
                    isBusy: false,
                    isEditMode: false,
                    isHeaderEditable: false,
                    isRecipientEditable: false
                },

                referenceData: {
                    companyCodes:      [],
                    taxCodes:          [],
                    allTaxCodes:       [],
                    initiatorTaxCodes: [],
                    recipientTaxCodes: [],
                    closedPeriods:     [],
                    documentTypes:     [],
                     glAccounts: [],
                     profitCenters: [],
                     costCenters: [],
                        searchInitiatorCCOptions: [],
                    searchRecipientCCOptions: [],
                    initiatorCCVHData: [],
                    recipientCCVHData: []
                }
            };

            var oModel = new JSONModel(oData);
            oModel.setSizeLimit(500);
            this.getView().setModel(oModel);
        },

        // ─────────────────────────────────────────────────────────────────────
        // Transaction Control
        // ─────────────────────────────────────────────────────────────────────

        onTransactionTypeChange: function (oEvent) {
            var oModel  = this.getView().getModel();
            var iIdx    = oEvent.getParameter("selectedIndex");
          
            // index 0 -> AR (IC Invoice), index 1 -> ACCRUAL (IC Accrual Journal)
            var sTxType = [
                Constants.TRANSACTION_TYPE.AR,
                Constants.TRANSACTION_TYPE.ACCRUAL
            ][iIdx];

            oModel.setProperty("/headerData/transactionType", sTxType);
            oModel.setProperty("/headerData/transactionTypeIndex", iIdx);

            this._deriveDocumentType(iIdx);
            this._syncBPClearingLine();
            this._syncRecipientBPClearingLine();
        },

        _deriveDocumentType: function (iIdx) {
            var oModel = this.getView().getModel();
            
            // Set document code automatically: IC for Invoice, IA for Accrual
            var sCode = (iIdx === 0) ? Constants.DOCUMENT_TYPE.IC : Constants.DOCUMENT_TYPE.IA;
            
            oModel.setProperty("/headerData/documentTypeCode", sCode);
            oModel.setProperty("/headerData/documentType", this.getI18nText("documentType." + sCode));
        },

        onTaxInvoiceCheck: function () {
            // Visibility is expression-bound; no extra logic needed here.
        },

        // ─────────────────────────────────────────────────────────────────────
        // User Default Company Code
        // ─────────────────────────────────────────────────────────────────────

        _loadUserDefaultCC: function () {
            var oModel = this.getView().getModel();

            if (!sap.ushell || !sap.ushell.Container) {
                return;
            }

            var sUserId = sap.ushell.Container.getService("UserInfo").getId();
            if (!sUserId) { return; }

            jQuery.ajax({
                url: "/sap/opu/odata/sap/CA_USRAPIV2_SRV/PersonalSettingCollection" +
                     "?$filter=Id eq 'BUK'&$format=json",
                method: "GET",
                success: function (oData) {
                    var aResults = oData && oData.d && oData.d.results;
                    var sCC = aResults && aResults[0] && aResults[0].Value;
                    if (!sCC) { return; }

                    sCC = sCC.trim().toUpperCase();
                    oModel.setProperty("/headerData/initiatorCC", sCC);
                    MasterDataService.getCompanyCodeDetails(sCC).then(function (oCC) {
                        oModel.setProperty("/headerData/initiatorCCName",
                            oCC ? oCC.name : "— Unknown company code");
                        oModel.setProperty("/headerData/initiatorCountry",
                            oCC ? oCC.country : "—");
                        if (oCC && oCC.country) {
                            MasterDataService.getTaxCodesByCountry(oCC.country).then(function (aCodes) {
                                var aInitiatorCodes = aCodes.filter(function (oCode) {
                                    return oCode.taxType === "A";
                                });
                                oModel.setProperty("/referenceData/initiatorTaxCodes", aInitiatorCodes);
                            });
                        }
                    }).catch(function () {
                        oModel.setProperty("/headerData/initiatorCCName",  "— Unknown company code");
                        oModel.setProperty("/headerData/initiatorCountry", "—");
                    });
                }.bind(this)
            });
        },

        // ─────────────────────────────────────────────────────────────────────
        // Party Details
        // ─────────────────────────────────────────────────────────────────────

        onInitiatorCCChange: function () {
            var oModel = this.getView().getModel();
            var that   = this;
            var sCC = (oModel.getProperty("/headerData/initiatorCC") || "").trim().toUpperCase();
            oModel.setProperty("/headerData/initiatorCC",      sCC);
            oModel.setProperty("/headerData/initiatorCCName",  sCC ? "..." : "");
            oModel.setProperty("/headerData/initiatorCountry", "");
            oModel.setProperty("/headerData/initiatorTaxCode", "");
            oModel.setProperty("/referenceData/initiatorTaxCodes", []);
            oModel.setProperty("/headerData/initiatorBP",       "");
            oModel.setProperty("/headerData/recipientBP",       "");
            oModel.setProperty("/headerData/recipientBPName",   "");
            oModel.setProperty("/headerData/partyValidationVisible", false);
            if (sCC) { oModel.setProperty("/headerData/initiatorCCState", "None"); }

            this._propagateTradingPartner();
            this._propagateRecipientTradingPartner();
            this._syncBPClearingLine();
            this._syncRecipientBPClearingLine();
            this._validateParties();

            if (!sCC) { return; }

            MasterDataService.getCompanyCodeDetails(sCC).then(function (oCC) {
                oModel.setProperty("/headerData/initiatorCCName",  oCC ? oCC.name    : "— Unknown company code");
                oModel.setProperty("/headerData/initiatorCountry", oCC ? oCC.country : "—");

                if (oCC && oCC.country) {
                    MasterDataService.getTaxCodesByCountry(oCC.country).then(function (aCodes) {
                        var aInitiatorCodes = aCodes.filter(function (oCode) {
                        return oCode.taxType === "A";
                        });
                        oModel.setProperty("/referenceData/initiatorTaxCodes", aInitiatorCodes);
                    });

                }

                var sRecCC = (oModel.getProperty("/headerData/recipientCC") || "").trim().toUpperCase();
                if (sRecCC) { that._autoDeriveBPs(sRecCC, sCC); }
            }).catch(function () {
                oModel.setProperty("/headerData/initiatorCCName",  "— Unknown company code");
                oModel.setProperty("/headerData/initiatorCountry", "—");
            });
        },

        onRecipientCCChange: function () {
            var oModel = this.getView().getModel();
            var that   = this;
            var sCC = (oModel.getProperty("/headerData/recipientCC") || "").trim().toUpperCase();
            oModel.setProperty("/headerData/recipientCC",      sCC);
            oModel.setProperty("/headerData/recipientCCName",  sCC ? "..." : "");
            oModel.setProperty("/headerData/recipientCountry", "");
            oModel.setProperty("/headerData/recipientTaxCode", "");
            oModel.setProperty("/referenceData/recipientTaxCodes", []);
            oModel.setProperty("/headerData/recipientBP",      "");
            oModel.setProperty("/headerData/recipientBPName",  "");
            oModel.setProperty("/headerData/initiatorBP",      "");
            this._propagateTradingPartner();
            this._validateParties();

            if (!sCC) { return; }

            MasterDataService.getCompanyCodeDetails(sCC).then(function (oCC) {
                oModel.setProperty("/headerData/recipientCCName",  oCC ? oCC.name    : "— Unknown company code");
                oModel.setProperty("/headerData/recipientCountry", oCC ? oCC.country : "—");

                if (oCC && oCC.country) {
                    MasterDataService.getTaxCodesByCountry(oCC.country).then(function (aCodes) {
                        var aRecipientCodes = aCodes.filter(function (oCode) {
                            return oCode.taxType === "V";
                        });
                        oModel.setProperty("/referenceData/recipientTaxCodes", aRecipientCodes);
                    });
                }

                var sIniCC = (oModel.getProperty("/headerData/initiatorCC") || "").trim().toUpperCase();
                if (sIniCC) { that._autoDeriveBPs(sCC, sIniCC); }
            }).catch(function () {
                oModel.setProperty("/headerData/recipientCCName",  "— Unknown company code");
                oModel.setProperty("/headerData/recipientCountry", "—");
            });
        },

        // ── Recipient: BP entered → derive CC from YY1_ICT001U ───────────────
        onRecipientBPChange: function () {
            var oModel = this.getView().getModel();
            var sBP = (oModel.getProperty("/headerData/recipientBP") || "").trim();
            oModel.setProperty("/headerData/recipientBP", sBP);

            if (sBP) {
                oModel.setProperty("/headerData/recipientBPState", "None");
                oModel.setProperty("/headerData/recipientCCState", "None");
            }

            if (!sBP) {
                oModel.setProperty("/headerData/recipientCC", "");
                oModel.setProperty("/headerData/recipientCCName", "");
                oModel.setProperty("/headerData/recipientCountry", "— (derived from Recipient BP)");
                this._syncBPClearingLine();
                this._syncRecipientBPClearingLine();
                return;
            }

            var that = this;
            oModel.setProperty("/appState/isBusy", true);

            MasterDataService.getICT001URelationship({ bpDebit: sBP })
                .then(function (aResults) {
                    oModel.setProperty("/appState/isBusy", false);
                    if (!aResults.length) {
                        MessageToast.show("No intercompany relationship found for Business Partner: " + sBP);
                        return;
                    }
                    var oRel   = aResults[0];
                    var sRecCC = oRel.receiverCC;

                    oModel.setProperty("/headerData/recipientCC",      sRecCC);
                    oModel.setProperty("/headerData/recipientCCName",  sRecCC);
                    oModel.setProperty("/headerData/recipientCountry", "");
                    oModel.setProperty("/headerData/recipientTaxCode", "");
                    oModel.setProperty("/referenceData/recipientTaxCodes", []);

                    // Fetch CC name and country for the derived recipient CC
                    MasterDataService.getCompanyCodeDetails(sRecCC).then(function (oCC) {
                        oModel.setProperty("/headerData/recipientCCName",  oCC ? oCC.name    : sRecCC);
                        oModel.setProperty("/headerData/recipientCountry", oCC ? oCC.country : "—");
                        if (oCC && oCC.country) {
                            MasterDataService.getTaxCodesByCountry(oCC.country).then(function (aCodes) {
                                var aRecipientCodes = aCodes.filter(function (oCode) {
                                    return oCode.taxType === "V";
                                });
                                oModel.setProperty("/referenceData/recipientTaxCodes", aRecipientCodes);
                            });
                        }
                    }).catch(function () {
                        oModel.setProperty("/headerData/recipientCCName",  sRecCC);
                        oModel.setProperty("/headerData/recipientCountry", "—");
                    });

                    var sIniCC = (oModel.getProperty("/headerData/initiatorCC") || "").trim();
                    if (sIniCC && sRecCC) {
                        that._autoDeriveBPs(sRecCC, sIniCC);
                    } else {
                        that._syncBPClearingLine();
                        that._syncRecipientBPClearingLine();
                        that._validateParties();
                    }
                })
                .catch(function () {
                    oModel.setProperty("/appState/isBusy", false);
                    MessageToast.show("Failed to look up Business Partner: " + sBP);
                });
        },

        // ─── Recipient BP Value Help ───────────────────────────────────────────

        onRecipientBPValueHelp: function () {
            var oModel = this.getView().getModel();
            var sIniCC = (oModel.getProperty("/headerData/initiatorCC") || "").trim();
            var oView  = this.getView();
            var that   = this;

            oModel.setProperty("/appState/isBusy", true);

            var oParams = sIniCC ? { senderCC: sIniCC } : {};

            MasterDataService.getICT001URelationship(oParams)
                .then(function (aResults) {
                    oModel.setProperty("/appState/isBusy", false);

                    if (!aResults.length) {
                        MessageToast.show("No intercompany business partners found" +
                            (sIniCC ? " for initiator " + sIniCC : "") + ".");
                        return;
                    }

                    // Use CC code as the info column (name fetched when CC is confirmed)
                    aResults.forEach(function (oRel) {
                        oRel.receiverCCName = oRel.receiverCC;
                    });
                    oModel.setProperty("/referenceData/bpRelationships", aResults);

                    if (!that._pBPDialog) {
                        that._pBPDialog = Fragment.load({
                            id:         oView.getId() + "--bp",
                            name:       "ZFI_INTERCO.fragment.BPPicklist",
                            controller: that
                        }).then(function (oDialog) {
                            oView.addDependent(oDialog);
                            return oDialog;
                        });
                    }
                    that._pBPDialog.then(function (oDialog) {
                        oDialog.getBinding("items").filter([]);
                        oDialog.open();
                    });
                })
                .catch(function () {
                    oModel.setProperty("/appState/isBusy", false);
                    MessageToast.show("Failed to load Business Partners.");
                });
        },

        onBPPicklistSearch: function (oEvent) {
            var sQuery   = oEvent.getParameter("value");
            var oBinding = oEvent.getParameter("itemsBinding");
            if (!sQuery) {
                oBinding.filter([]);
                return;
            }
            oBinding.filter([new Filter({
                filters: [
                    new Filter("bpForDebit",  FilterOperator.Contains, sQuery),
                    new Filter("senderCC",    FilterOperator.Contains, sQuery),
                    new Filter("receiverCC",  FilterOperator.Contains, sQuery),
                    new Filter("receiverCCName", FilterOperator.Contains, sQuery)
                ],
                and: false
            })]);
        },

        onBPPicklistConfirm: function (oEvent) {
            var oSelected = oEvent.getParameter("selectedItem");
            if (!oSelected) { return; }
            var oRel  = oSelected.getBindingContext().getObject();
            var oModel = this.getView().getModel();
            oModel.setProperty("/headerData/recipientBP", oRel.bpForDebit);
            this.onRecipientBPChange();
        },

        onBPPicklistCancel: function () {
            // SelectDialog self-closes
        },

        _autoDeriveBPs: function (sRecCC, sIniCC) {
            var oModel = this.getView().getModel();
            var that = this;

            oModel.setProperty("/appState/isBusy", true);

            // Fetch forward (IniCC→RecCC) and reverse (RecCC→IniCC) from live API in parallel.
            Promise.all([
                MasterDataService.getICT001URelationship({ senderCC: sIniCC, receiverCC: sRecCC }),
                MasterDataService.getICT001URelationship({ senderCC: sRecCC, receiverCC: sIniCC })
            ]).then(function (aResults) {
                var aForward = aResults[0]; // IniCC as sender → BPforDebit = recipientBP
                var aReverse = aResults[1]; // RecCC as sender → BPforDebit = initiatorBP

                if (!aForward.length) {
                    oModel.setProperty("/appState/isBusy", false);
                    MessageToast.show("No intercompany relationship found between " + sIniCC + " and " + sRecCC + ".");
                    return;
                }

                var sRecipientBP  = aForward[0].bpForDebit || aForward[0].bpForCredit;
                var sInitiatorBP  = aReverse.length ? (aReverse[0].bpForDebit || aReverse[0].bpForCredit) : "—";

                oModel.setProperty("/headerData/recipientBP",   sRecipientBP);
                oModel.setProperty("/headerData/initiatorBP",   sInitiatorBP);

                var fnFinalize = function () {
                    oModel.setProperty("/appState/isBusy", false);
                    that._validateParties();
                    that._syncBPClearingLine();
                    that._propagateTradingPartner();
                    that._syncRecipientBPClearingLine();
                    that._propagateRecipientTradingPartner();
                };

                var pSupplier = MasterDataService.getReconciliationAccount(sRecCC, sRecipientBP)
                    .catch(function () { return null; });
                var pCustomer = MasterDataService.getReconciliationAccountCustomer(sIniCC, sInitiatorBP)
                    .catch(function () { return null; });

                Promise.all([pSupplier, pCustomer]).then(function (aReconResults) {
                    oModel.setProperty("/headerData/reconciliationAccount",
                        aReconResults[0] ? aReconResults[0].reconciliationAccount : sRecipientBP);
                    oModel.setProperty("/headerData/recipientReconciliationAccount",
                        aReconResults[1] ? aReconResults[1].reconciliationAccount : sInitiatorBP);
                    fnFinalize();
                });

            }).catch(function () {
                oModel.setProperty("/appState/isBusy", false);
                MessageToast.show("Failed to derive intercompany business partners.");
            });
        },



        // ─── Search Screen Company Code Value Help ─────────────────────

        _fetchCCVHData: function (sTarget) {
            var oModel = this.getView().getModel();
            var sBaseUrl =
                "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/" +
                "ZC_INTERCO_JE_HEADER";

            var aSelect = sTarget === "initiator"
                ? ["accountingdocument_temp", "in_companycode", "in_accountingdocument"]
                : ["accountingdocument_temp", "rec_companycode", "rec_accountingdocument"];

            var sUrl = sBaseUrl + "?$select=" + aSelect.join(",");

            var that = this;
            return that._fetchAllPages(sUrl)
            .then(function (aResults) {
                var sPath = sTarget === "initiator"
                    ? "/referenceData/initiatorCCVHData"
                    : "/referenceData/recipientCCVHData";
                oModel.setProperty(sPath, aResults);
            })
            .catch(function (oError) {
                console.error("CC VH data fetch error:", oError);
                sap.m.MessageToast.show("Failed to load value help data.");
            });
        },

onSearchInitiatorCCValueHelp: function () {
    var oView = this.getView();
    var that = this;

    if (!this._pSearchInitiatorCCDialog) {
        this._pSearchInitiatorCCDialog = Fragment.load({
            id: oView.getId() + "--searchInitiatorCC",
            name: "ZFI_INTERCO.fragment.SearchInitiatorCompanyCode",
            controller: that
        }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
        });
    }

    this._fetchCCVHData("initiator");

    this._pSearchInitiatorCCDialog.then(function (oDialog) {
        oDialog.open();
    });
},

onSearchRecipientCCValueHelp: function () {
    var oView = this.getView();
    var that = this;

    if (!this._pSearchRecipientCCDialog) {
        this._pSearchRecipientCCDialog = Fragment.load({
            id: oView.getId() + "--searchRecipientCC",
            name: "ZFI_INTERCO.fragment.SearchRecipientCompanyCode",
            controller: that
        }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
        });
    }

    this._fetchCCVHData("recipient");

    this._pSearchRecipientCCDialog.then(function (oDialog) {
        oDialog.open();
    });
},

        // ─── Search Initiator CC Dialog Events ────────────────────────────────

        onSearchInitiatorCCFilter: function (oEvent) {
            var sQuery = (
                oEvent.getParameter("query") ||
                oEvent.getParameter("newValue") ||
                ""
            ).trim();

            var oTable = Fragment.byId(
                this.getView().getId() + "--searchInitiatorCC",
                "searchInitiatorCCTable"
            );
            if (!oTable) { return; }

            var oBinding = oTable.getBinding("items");
            if (sQuery) {
                oBinding.filter([
                    new Filter({
                        filters: [
                            new Filter("accountingdocument_temp", FilterOperator.Contains, sQuery),
                            new Filter("in_companycode",           FilterOperator.Contains, sQuery),
                            new Filter("in_accountingdocument",    FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ]);
            } else {
                oBinding.filter([]);
            }
        },

        onSearchInitiatorCCSelect: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sCC = oContext.getProperty("in_companycode");

            this.getView().getModel().setProperty("/search/in_companycode", sCC);

            var oTable = Fragment.byId(
                this.getView().getId() + "--searchInitiatorCC",
                "searchInitiatorCCTable"
            );
            if (oTable) { oTable.getBinding("items").filter([]); }

            this._pSearchInitiatorCCDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        onSearchInitiatorCCCancel: function () {
            this._pSearchInitiatorCCDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        // ─── Search Recipient CC Dialog Events ────────────────────────────────

        onSearchRecipientCCFilter: function (oEvent) {
            var sQuery = (
                oEvent.getParameter("query") ||
                oEvent.getParameter("newValue") ||
                ""
            ).trim();

            var oTable = Fragment.byId(
                this.getView().getId() + "--searchRecipientCC",
                "searchRecipientCCTable"
            );
            if (!oTable) { return; }

            var oBinding = oTable.getBinding("items");
            if (sQuery) {
                oBinding.filter([
                    new Filter({
                        filters: [
                            new Filter("accountingdocument_temp", FilterOperator.Contains, sQuery),
                            new Filter("rec_companycode",          FilterOperator.Contains, sQuery),
                            new Filter("rec_accountingdocument",   FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ]);
            } else {
                oBinding.filter([]);
            }
        },

        onSearchRecipientCCSelect: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sCC = oContext.getProperty("rec_companycode");

            this.getView().getModel().setProperty("/search/rec_companycode", sCC);

            var oTable = Fragment.byId(
                this.getView().getId() + "--searchRecipientCC",
                "searchRecipientCCTable"
            );
            if (oTable) { oTable.getBinding("items").filter([]); }

            this._pSearchRecipientCCDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        onSearchRecipientCCCancel: function () {
            this._pSearchRecipientCCDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        // ─── Company Code Value Help ───────────────────────────────────────────

        onInitiatorCCValueHelp: function () {
            this._sCCPicklistMode = "initiator";
            var oModel = this.getView().getModel();
            var that   = this;

            oModel.setProperty("/appState/isBusy", true);

            MasterDataService.getICT001URelationship({}).then(function (aRels) {
                var mSeen    = {};
                var aOptions = [];
                aRels.forEach(function (r) {
                    if (!mSeen[r.senderCC]) {
                        mSeen[r.senderCC] = true;
                        aOptions.push({ companyCode: r.senderCC, name: r.senderCC, country: "" });
                    }
                });
                oModel.setProperty("/referenceData/initiatorCCOptions", aOptions);
                oModel.setProperty("/appState/isBusy", false);
                that._openCCPicklist();
            }).catch(function (oErr) {
                oModel.setProperty("/appState/isBusy", false);
                MessageBox.error("Could not load company codes: " + (oErr && oErr.message ? oErr.message : String(oErr)));
            });
        },

        onRecipientCCValueHelp: function () {
            this._sCCPicklistMode = "recipient";
            this._openCCPicklist();
        },

        _openCCPicklist: function () {
            var oView = this.getView();
            if (!this._pCCDialog) {
                this._pCCDialog = Fragment.load({
                    id: oView.getId() + "--cc",
                    name: "ZFI_INTERCO.fragment.CCPicklist",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }
            this._pCCDialog.then(function (oDialog) { oDialog.open(); });
        },

        onCCPicklistSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("value");
            var oBinding = oEvent.getParameter("itemsBinding");
            if (!sQuery) {
                oBinding.filter([]);
                return;
            }
            oBinding.filter([new Filter([
                new Filter("companyCode", FilterOperator.Contains, sQuery),
                new Filter("name", FilterOperator.Contains, sQuery),
                new Filter("country", FilterOperator.Contains, sQuery)
            ], false)]);
        },

        onCCPicklistConfirm: function (oEvent) {

    var oSelected = oEvent.getParameter("selectedItem");

    if (!oSelected) {
        return;
    }

    var oCC = oSelected.getBindingContext().getObject();
    var oModel = this.getView().getModel();
    var sCompanyCode = oCC.companyCode;

    // =========================================================
    // SEARCH SCREEN - INITIATOR COMPANY CODE
    // =========================================================
    if (this._sCCPicklistMode === "searchInitiator") {

        oModel.setProperty(
            "/search/in_companycode",
            sCompanyCode
        );

        return;
    }

    // =========================================================
    // SEARCH SCREEN - RECIPIENT COMPANY CODE
    // =========================================================
    if (this._sCCPicklistMode === "searchRecipient") {

        oModel.setProperty(
            "/search/rec_companycode",
            sCompanyCode
        );

        return;
    }

    // =========================================================
    // EXISTING IC FORM - INITIATOR
    // =========================================================
    if (this._sCCPicklistMode === "initiator") {

        oModel.setProperty(
            "/headerData/initiatorCC",
            sCompanyCode
        );

        this.onInitiatorCCChange();

        return;
    }

    // =========================================================
    // EXISTING IC FORM - RECIPIENT
    // =========================================================
    if (this._sCCPicklistMode === "recipient") {

        oModel.setProperty(
            "/headerData/recipientCC",
            sCompanyCode
        );

        this.onRecipientCCChange();

        return;
    }
},

        onCCPicklistCancel: function () {
            // SelectDialog self-closes
        },

        // ─── Document Type Value Help ──────────────────────────────────────────

        onDocTypeValueHelp: function () {
            this._openDocTypePicklist();
        },

        _openDocTypePicklist: function () {
            var oView = this.getView();
            var oModel = oView.getModel();

            if (!this._pDocTypeDialog) {
                this._pDocTypeDialog = Fragment.load({
                    id: oView.getId() + "--docType",
                    name: "ZFI_INTERCO.fragment.DocTypePicklist",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pDocTypeDialog.then(function (oDialog) {
                oDialog.open();

                if ((oModel.getProperty("/referenceData/documentTypes") || []).length > 0) {
                    return;
                }

                oDialog.setBusy(true);
                MasterDataService.getDocumentTypes()
                    .then(function (aTypes) {
                        oDialog.setBusy(false);
                        if (!aTypes.length) {
                            MessageToast.show("No document types returned from the service.");
                            return;
                        }
                        oModel.setProperty("/referenceData/documentTypes", aTypes);
                    })
                    .catch(function () {
                        oDialog.setBusy(false);
                        MessageToast.show("Failed to load document types. Check the service connection.");
                    });
            });
        },

       // ─── GL Account Value Help — Initiator ─────────────────────────────────
onInitiatorGLAccountVH: function (oEvent) {

    var oModel = this.getView().getModel();
    var oView = this.getView();
    var that = this;

    var sCompanyCode =
        // (oModel.getProperty("/headerData/initiatorCC") || "").trim();
             (oModel.getProperty("/headerData/recipientCC") || "").trim();

    if (!sCompanyCode) {
        MessageToast.show("Please select Initiator Company Code first.");
        return;
    }

    // Remember the exact GL line on which the value help was clicked.
    // Example: /initiatorLines/1
    var oInput = oEvent.getSource();
    var oContext = oInput.getBindingContext();

    if (!oContext) {
        MessageToast.show("Unable to determine the selected GL line.");
        return;
    }

    this._sGLAccountRowPath = oContext.getPath();

    oModel.setProperty("/appState/isBusy", true);

    MasterDataService.getGLAccounts(sCompanyCode)
        .then(function (aGLAccounts) {

            oModel.setProperty("/appState/isBusy", false);

            if (!aGLAccounts || !aGLAccounts.length) {
                MessageToast.show(
                    "No GL Accounts found for Company Code " + sCompanyCode + "."
                );
                return;
            }

            // Store the API result for the SelectDialog.
            oModel.setProperty(
                "/referenceData/glAccounts",
                aGLAccounts
            );

            // Create dialog only once.
            if (!that._pGLAccountDialog) {

                that._pGLAccountDialog = Fragment.load({
                    id: oView.getId() + "--glAccount",
                    name: "ZFI_INTERCO.fragment.GLAccountValueHelp",
                    controller: that
                }).then(function (oDialog) {

                    oView.addDependent(oDialog);

                    return oDialog;
                });
            }

            that._pGLAccountDialog.then(function (oDialog) {

                // Clear any previous search filter.
                var oBinding = oDialog.getBinding("items");

                if (oBinding) {
                    oBinding.filter([]);
                }

                oDialog.open();
            });

        })
        .catch(function (oError) {

            oModel.setProperty("/appState/isBusy", false);

            MessageBox.error(
                "Failed to load GL Accounts: " +
                (oError && oError.message
                    ? oError.message
                    : String(oError))
            );
        });
},

// ─── GL Account Picklist ────────────────────────────────────────────────

// onGLAccountPicklistSearch: function (oEvent) {
//     var sQuery = oEvent.getParameter("value");
//     var oBinding = oEvent.getParameter("itemsBinding");

//     if (!oBinding) {
//         return;
//     }

//     if (!sQuery) {
//         oBinding.filter([]);
//         return;
//     }

//     oBinding.filter([
//         new Filter({
//             filters: [
//                 new Filter("GLAccount", FilterOperator.Contains, sQuery),
//                 new Filter("GLAccountName", FilterOperator.Contains, sQuery),
//                 new Filter("CompanyCode", FilterOperator.Contains, sQuery)
//             ],
//             and: false
//         })
//     ]);
// },


onGLAccountPicklistSearch: function (oEvent) {

    var sQuery = (
        oEvent.getParameter("value") || ""
    ).trim();

    var oModel = this.getView().getModel();

    var sCompanyCode =
        (oModel.getProperty("/headerData/recipientCC") || "").trim();

    if (!sCompanyCode) {
        MessageToast.show(
            "Please select Initiator Company Code first."
        );
        return;
    }

    if (!sQuery) {
        return;
    }

    oModel.setProperty(
        "/appState/isBusy",
        true
    );

    MasterDataService.searchGLAccounts(
        sCompanyCode,
        sQuery
    )
    .then(function (aResults) {

        console.log(
            "Initiator GL Search Results:",
            aResults
        );

        oModel.setProperty(
            "/referenceData/glAccounts",
            aResults || []
        );
    })
    .catch(function (oError) {

        console.error(
            "Initiator GL Account search failed:",
            oError
        );

        oModel.setProperty(
            "/referenceData/glAccounts",
            []
        );

        MessageToast.show(
            "Failed to search GL Account."
        );
    })
    .then(function () {

        oModel.setProperty(
            "/appState/isBusy",
            false
        );
    });
},

onGLAccountPicklistConfirm: function (oEvent) {
    var oSelectedItem = oEvent.getParameter("selectedItem");

    if (!oSelectedItem) {
        return;
    }

    var oContext = oSelectedItem.getBindingContext();

    if (!oContext) {
        MessageToast.show("Unable to determine the selected GL Account.");
        return;
    }

    var oGLAccount = oContext.getObject();

    var sGLAccount = oGLAccount.GLAccount || "";

    if (!sGLAccount) {
        MessageToast.show("Selected GL Account is empty.");
        return;
    }

    var oModel = this.getView().getModel();

    // Use the exact GL row from which the value help was opened.
    var sRowPath = this._sGLAccountRowPath;

    if (!sRowPath) {
        MessageToast.show("Unable to determine the GL coding line.");
        return;
    }

    // Set selected GL Account into that exact row.
    oModel.setProperty(sRowPath + "/glAccount", sGLAccount);

    // Refresh balance/validation after the GL Account change.
    this._recalculateBalance();

    // Clear stored row path after successful selection.
    this._sGLAccountRowPath = "";

    MessageToast.show("GL Account " + sGLAccount + " selected.");
},

onGLAccountPicklistCancel: function () {
    // SelectDialog closes automatically.
    this._sGLAccountRowPath = "";
},

// ─── GL Account Value Help — Recipient ─────────────────────────────────

onRecipientGLAccountVH: function (oEvent) {

    var oModel = this.getView().getModel();
    var oView = this.getView();
    var that = this;

    var sCompanyCode =
     (oModel.getProperty("/headerData/initiatorCC") || "").trim();
        // (oModel.getProperty("/headerData/recipientCC") || "").trim();

    if (!sCompanyCode) {
        MessageToast.show(
            "Please select Recipient Company Code first."
        );
        return;
    }

    // Remember the exact Recipient GL row
    var oInput = oEvent.getSource();
    var oContext = oInput.getBindingContext();

    if (!oContext) {
        MessageToast.show(
            "Unable to determine the selected Recipient GL line."
        );
        return;
    }

    this._sRecipientGLAccountRowPath = oContext.getPath();

    oModel.setProperty("/appState/isBusy", true);

    MasterDataService.getGLAccounts(sCompanyCode)
        .then(function (aGLAccounts) {

            oModel.setProperty("/appState/isBusy", false);

            if (!aGLAccounts || !aGLAccounts.length) {
                MessageToast.show(
                    "No GL Accounts found for Company Code " +
                    sCompanyCode + "."
                );
                return;
            }

            oModel.setProperty(
                "/referenceData/glAccounts",
                aGLAccounts
            );

            if (!that._pRecipientGLAccountDialog) {

                that._pRecipientGLAccountDialog = Fragment.load({
                    id: oView.getId() + "--recipientGLAccount",
                    name: "ZFI_INTERCO.fragment.RecipientGLAccountValueHelp",
                    controller: that
                }).then(function (oDialog) {

                    oView.addDependent(oDialog);

                    return oDialog;
                });
            }

            that._pRecipientGLAccountDialog.then(function (oDialog) {

                var oBinding = oDialog.getBinding("items");

                if (oBinding) {
                    oBinding.filter([]);
                }

                oDialog.open();
            });

        })
        .catch(function (oError) {

            oModel.setProperty("/appState/isBusy", false);

            MessageBox.error(
                "Failed to load Recipient GL Accounts: " +
                (oError && oError.message
                    ? oError.message
                    : String(oError))
            );
        });
},
// onRecipientGLAccountPicklistSearch: function (oEvent) {

//     var sQuery = oEvent.getParameter("value");
//     var oBinding = oEvent.getParameter("itemsBinding");

//     if (!oBinding) {
//         return;
//     }

//     if (!sQuery) {
//         oBinding.filter([]);
//         return;
//     }

//     oBinding.filter([
//         new Filter({
//             filters: [
//                 new Filter(
//                     "GLAccount",
//                     FilterOperator.Contains,
//                     sQuery
//                 ),
//                 new Filter(
//                     "GLAccountName",
//                     FilterOperator.Contains,
//                     sQuery
//                 ),
//                 new Filter(
//                     "CompanyCode",
//                     FilterOperator.Contains,
//                     sQuery
//                 )
//             ],
//             and: false
//         })
//     ]);
// },


onRecipientGLAccountPicklistSearch: function (oEvent) {

    var sQuery = (
        oEvent.getParameter("value") || ""
    ).trim();

    var oModel = this.getView().getModel();

    var sCompanyCode =
        (oModel.getProperty("/headerData/initiatorCC") || "").trim();

    if (!sCompanyCode) {
        MessageToast.show(
            "Please select Recipient Company Code first."
        );
        return;
    }

    if (!sQuery) {
        return;
    }

    oModel.setProperty(
        "/appState/isBusy",
        true
    );

    MasterDataService.searchGLAccounts(
        sCompanyCode,
        sQuery
    )
    .then(function (aResults) {

        console.log(
            "Recipient GL Search Results:",
            aResults
        );

        oModel.setProperty(
            "/referenceData/glAccounts",
            aResults || []
        );
    })
    .catch(function (oError) {

        console.error(
            "Recipient GL Account search failed:",
            oError
        );

        oModel.setProperty(
            "/referenceData/glAccounts",
            []
        );

        MessageToast.show(
            "Failed to search Recipient GL Account."
        );
    })
    .then(function () {

        oModel.setProperty(
            "/appState/isBusy",
            false
        );
    });
},


onRecipientGLAccountPicklistConfirm: function (oEvent) {

    var oSelectedItem = oEvent.getParameter("selectedItem");

    if (!oSelectedItem) {
        return;
    }

    var oContext = oSelectedItem.getBindingContext();

    if (!oContext) {
        MessageToast.show(
            "Unable to determine the selected GL Account."
        );
        return;
    }

    var oGLAccount = oContext.getObject();

    var sGLAccount = oGLAccount.GLAccount || "";

    if (!sGLAccount) {
        MessageToast.show(
            "Selected GL Account is empty."
        );
        return;
    }

    var oModel = this.getView().getModel();

    var sRowPath = this._sRecipientGLAccountRowPath;

    if (!sRowPath) {
        MessageToast.show(
            "Unable to determine the Recipient GL coding line."
        );
        return;
    }

    // IMPORTANT:
    // Write to recipientLines, not initiatorLines.
    oModel.setProperty(
        sRowPath + "/glAccount",
        sGLAccount
    );

    this._recalculateRecipientBalance();

    this._sRecipientGLAccountRowPath = "";

    MessageToast.show(
        "GL Account " + sGLAccount + " selected."
    );
},


onRecipientGLAccountPicklistCancel: function () {

    this._sRecipientGLAccountRowPath = "";

},
// ─── Profit Center Value Help — Initiator ────────────────────────────────

onInitiatorProfitCenterValueHelp: function (oEvent) {

    var oModel = this.getView().getModel();
    var oView = this.getView();
    var that = this;

    // Get Initiator Company Code
    var sCompanyCode =
        (oModel.getProperty("/headerData/initiatorCC") || "").trim();

    if (!sCompanyCode) {
        MessageToast.show(
            "Please select Initiator Company Code first."
        );
        return;
    }

    // Remember the exact Initiator GL line
    // Example: /initiatorLines/1
    var oInput = oEvent.getSource();
    var oContext = oInput.getBindingContext();

    if (!oContext) {
        MessageToast.show(
            "Unable to determine the selected Profit Center line."
        );
        return;
    }

    this._sProfitCenterRowPath = oContext.getPath();

    oModel.setProperty("/appState/isBusy", true);

    // Fetch Profit Centers based on Initiator Company Code
    MasterDataService.getProfitCenters(sCompanyCode)
        .then(function (aProfitCenters) {

            oModel.setProperty("/appState/isBusy", false);

            if (!aProfitCenters || !aProfitCenters.length) {

                MessageToast.show(
                    "No Profit Centers found for Company Code " +
                    sCompanyCode + "."
                );

                return;
            }

            // Store API result for SelectDialog
            oModel.setProperty(
                "/referenceData/profitCenters",
                aProfitCenters
            );

            // Create dialog only once
            if (!that._pProfitCenterDialog) {

                that._pProfitCenterDialog = Fragment.load({
                    id: oView.getId() + "--profitCenter",
                    name: "ZFI_INTERCO.fragment.ProfitCenterPicklist",
                    controller: that
                }).then(function (oDialog) {

                    oView.addDependent(oDialog);

                    return oDialog;
                });
            }

            that._pProfitCenterDialog.then(function (oDialog) {

                // Clear previous search filter
                var oBinding = oDialog.getBinding("items");

                if (oBinding) {
                    oBinding.filter([]);
                }

                oDialog.open();
            });

        })
        .catch(function (oError) {

            oModel.setProperty("/appState/isBusy", false);

            MessageBox.error(
                "Failed to load Profit Centers: " +
                (oError && oError.message
                    ? oError.message
                    : String(oError))
            );
        });
},
onProfitCenterPicklistSearch: function (oEvent) {

    var sQuery = oEvent.getParameter("value");
    var oBinding = oEvent.getParameter("itemsBinding");

    if (!oBinding) {
        return;
    }

    if (!sQuery) {
        oBinding.filter([]);
        return;
    }

    oBinding.filter([
        new Filter({
            filters: [
                new Filter(
                    "profitCenter",
                    FilterOperator.Contains,
                    sQuery
                ),
                new Filter(
                    "description",
                    FilterOperator.Contains,
                    sQuery
                ),
                new Filter(
                    "companyCode",
                    FilterOperator.Contains,
                    sQuery
                )
            ],
            and: false
        })
    ]);
},
onProfitCenterPicklistConfirm: function (oEvent) {

    var oSelectedItem = oEvent.getParameter("selectedItem");

    if (!oSelectedItem) {
        return;
    }

    var oContext = oSelectedItem.getBindingContext();

    if (!oContext) {
        MessageToast.show(
            "Unable to determine the selected Profit Center."
        );
        return;
    }

    var oProfitCenter = oContext.getObject();

    var sProfitCenter =
        oProfitCenter.profitCenter || "";

    if (!sProfitCenter) {
        MessageToast.show(
            "Selected Profit Center is empty."
        );
        return;
    }

    var oModel = this.getView().getModel();

    // Get the exact line from which the value help was opened
    var sRowPath = this._sProfitCenterRowPath;

    if (!sRowPath) {
        MessageToast.show(
            "Unable to determine the Initiator GL coding line."
        );
        return;
    }

    // Set selected Profit Center
    oModel.setProperty(
        sRowPath + "/profitCenter",
        sProfitCenter
    );

    // Clear stored row path
    this._sProfitCenterRowPath = "";

    MessageToast.show(
        "Profit Center " + sProfitCenter + " selected."
    );
},
onProfitCenterPicklistCancel: function () {

    this._sProfitCenterRowPath = "";

},

// ─── Profit Center Value Help — Recipient ───────────────────────────────

onRecipientProfitCenterValueHelp: function (oEvent) {

    var oModel = this.getView().getModel();
    var oView = this.getView();
    var that = this;

    var sCompanyCode =
        (oModel.getProperty("/headerData/recipientCC") || "").trim();

    if (!sCompanyCode) {
        MessageToast.show(
            "Please select Recipient Company Code first."
        );
        return;
    }

    var oInput = oEvent.getSource();
    var oContext = oInput.getBindingContext();

    if (!oContext) {
        MessageToast.show(
            "Unable to determine the selected Recipient Profit Center line."
        );
        return;
    }

    this._sRecipientProfitCenterRowPath = oContext.getPath();

    oModel.setProperty("/appState/isBusy", true);

    MasterDataService.getProfitCenters(sCompanyCode)
        .then(function (aProfitCenters) {

            oModel.setProperty("/appState/isBusy", false);

            if (!aProfitCenters || !aProfitCenters.length) {

                MessageToast.show(
                    "No Profit Centers found for Company Code " +
                    sCompanyCode + "."
                );

                return;
            }

            oModel.setProperty(
                "/referenceData/profitCenters",
                aProfitCenters
            );

            if (!that._pRecipientProfitCenterDialog) {

                that._pRecipientProfitCenterDialog = Fragment.load({
                    id: oView.getId() + "--recipientProfitCenter",
                    name: "ZFI_INTERCO.fragment.RecipientProfitCenterPicklist",
                    controller: that
                }).then(function (oDialog) {

                    oView.addDependent(oDialog);

                    return oDialog;
                });
            }

            that._pRecipientProfitCenterDialog.then(function (oDialog) {

                var oBinding = oDialog.getBinding("items");

                if (oBinding) {
                    oBinding.filter([]);
                }

                oDialog.open();
            });

        })
        .catch(function (oError) {

            oModel.setProperty("/appState/isBusy", false);

            MessageBox.error(
                "Failed to load Recipient Profit Centers: " +
                (oError && oError.message
                    ? oError.message
                    : String(oError))
            );
        });
},
onRecipientProfitCenterPicklistSearch: function (oEvent) {

    var sQuery = oEvent.getParameter("value");
    var oBinding = oEvent.getParameter("itemsBinding");

    if (!oBinding) {
        return;
    }

    if (!sQuery) {
        oBinding.filter([]);
        return;
    }

    oBinding.filter([
        new Filter({
            filters: [
                new Filter(
                    "profitCenter",
                    FilterOperator.Contains,
                    sQuery
                ),
                new Filter(
                    "description",
                    FilterOperator.Contains,
                    sQuery
                ),
                new Filter(
                    "companyCode",
                    FilterOperator.Contains,
                    sQuery
                )
            ],
            and: false
        })
    ]);
},


onRecipientProfitCenterPicklistConfirm: function (oEvent) {

    var oSelectedItem = oEvent.getParameter("selectedItem");

    if (!oSelectedItem) {
        return;
    }

    var oContext = oSelectedItem.getBindingContext();

    if (!oContext) {
        MessageToast.show(
            "Unable to determine the selected Recipient Profit Center."
        );
        return;
    }

    var oProfitCenter = oContext.getObject();

    var sProfitCenter =
        oProfitCenter.profitCenter || "";

    if (!sProfitCenter) {
        MessageToast.show(
            "Selected Profit Center is empty."
        );
        return;
    }

    var oModel = this.getView().getModel();

    var sRowPath =
        this._sRecipientProfitCenterRowPath;

    if (!sRowPath) {
        MessageToast.show(
            "Unable to determine the Recipient GL coding line."
        );
        return;
    }

    oModel.setProperty(
        sRowPath + "/profitCenter",
        sProfitCenter
    );

    this._sRecipientProfitCenterRowPath = "";

    MessageToast.show(
        "Profit Center " + sProfitCenter + " selected."
    );
},


onRecipientProfitCenterPicklistCancel: function () {

    this._sRecipientProfitCenterRowPath = "";

},


onInitiatorCostCenterVH: function (oEvent) {

    this._oCostCenterInput = oEvent.getSource();

    var oModel = this.getView().getModel();

    var sCompanyCode =

        (oModel.getProperty("/headerData/recipientCC") || "")
            .trim()
            .toUpperCase();

    if (!sCompanyCode) {
        sap.m.MessageToast.show(
            "Please select Initiator Company Code first."
        );
        return;
    }

    MasterDataService.getCostCenters(sCompanyCode)
        .then(function (aCostCenters) {

            oModel.setProperty(
                "/referenceData/costCenters",
                aCostCenters
            );

            if (!aCostCenters || !aCostCenters.length) {
                sap.m.MessageToast.show(
                    "No Cost Centers found for Company Code " +
                    sCompanyCode + "."
                );
                return;
            }

            if (!this._oCostCenterDialog) {

                this._oCostCenterDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "ZFI_INTERCO.fragment.CostCenterValueHelp",
                    this
                );

                this.getView().addDependent(
                    this._oCostCenterDialog
                );
            }

            this._oCostCenterDialog.setModel(oModel);
            this._oCostCenterDialog.open();

        }.bind(this))

        .catch(function (oError) {

            console.error(
                "[CostCenter VH] Error:",
                oError
            );

            sap.m.MessageToast.show(
                "Failed to load Cost Centers."
            );

        });
},

onCostCenterPicklistSearch: function (oEvent) {

    var sValue = oEvent.getParameter("value");

    var oFilter = new sap.ui.model.Filter({
        filters: [
            new sap.ui.model.Filter(
                "CostCenter",
                sap.ui.model.FilterOperator.Contains,
                sValue
            ),
            new sap.ui.model.Filter(
                "CostCenter_Text",
                sap.ui.model.FilterOperator.Contains,
                sValue
            )
        ],
        and: false
    });

    oEvent.getSource().getBinding("items").filter(
        sValue ? [oFilter] : []
    );
},
onCostCenterPicklistConfirm: function (oEvent) {

    var oSelectedItem = oEvent.getParameter("selectedItem");

    if (!oSelectedItem || !this._oCostCenterInput) {
        return;
    }

    var oContext = oSelectedItem.getBindingContext();

    if (!oContext) {
        return;
    }

    var oCostCenter = oContext.getObject();

    this._oCostCenterInput.setValue(
        oCostCenter.CostCenter
    );

    this._oCostCenterInput
        .getBindingContext()
        .getModel()
        .setProperty(
            this._oCostCenterInput
                .getBindingContext()
                .getPath() + "/costCenter",
            oCostCenter.CostCenter
        );

    this._oCostCenterDialog.close();
},
onCostCenterPicklistCancel: function () {

    if (this._oCostCenterDialog) {
        this._oCostCenterDialog.close();
    }

},

// ─── Cost Center Value Help — Recipient ─────────────────────────────────

onRecipientCostCenterVH: function (oEvent) {

    this._oRecipientCostCenterInput = oEvent.getSource();

    var oModel = this.getView().getModel();

    var sCompanyCode =
        (oModel.getProperty("/headerData/initiatorCC") || "")
            .trim()
            .toUpperCase();

    if (!sCompanyCode) {

        MessageToast.show(
            "Please select Recipient Company Code first."
        );

        return;
    }

    MasterDataService.getCostCenters(sCompanyCode)
        .then(function (aCostCenters) {

            oModel.setProperty(
                "/referenceData/costCenters",
                aCostCenters
            );

            if (!aCostCenters || !aCostCenters.length) {

                MessageToast.show(
                    "No Cost Centers found for Company Code " +
                    sCompanyCode + "."
                );

                return;
            }

            if (!this._oRecipientCostCenterDialog) {

                this._oRecipientCostCenterDialog =
                    sap.ui.xmlfragment(
                        this.getView().getId(),
                        "ZFI_INTERCO.fragment.RecipientCostCenterValueHelp",
                        this
                    );

                this.getView().addDependent(
                    this._oRecipientCostCenterDialog
                );
            }

            this._oRecipientCostCenterDialog.setModel(oModel);

            this._oRecipientCostCenterDialog.open();

        }.bind(this))
        .catch(function (oError) {

            console.error(
                "[Recipient CostCenter VH] Error:",
                oError
            );

            MessageToast.show(
                "Failed to load Recipient Cost Centers."
            );

        });
},

onRecipientCostCenterPicklistSearch: function (oEvent) {

    var sValue = oEvent.getParameter("value");

    var oFilter = new sap.ui.model.Filter({
        filters: [
            new sap.ui.model.Filter(
                "CostCenter",
                sap.ui.model.FilterOperator.Contains,
                sValue
            ),
            new sap.ui.model.Filter(
                "CostCenter_Text",
                sap.ui.model.FilterOperator.Contains,
                sValue
            )
        ],
        and: false
    });

    oEvent.getSource()
        .getBinding("items")
        .filter(
            sValue ? [oFilter] : []
        );
},


onRecipientCostCenterPicklistConfirm: function (oEvent) {

    var oSelectedItem =
        oEvent.getParameter("selectedItem");

    if (!oSelectedItem ||
        !this._oRecipientCostCenterInput) {
        return;
    }

    var oContext =
        oSelectedItem.getBindingContext();

    if (!oContext) {
        return;
    }

    var oCostCenter =
        oContext.getObject();

    this._oRecipientCostCenterInput.setValue(
        oCostCenter.CostCenter
    );

    this._oRecipientCostCenterInput
        .getBindingContext()
        .getModel()
        .setProperty(
            this._oRecipientCostCenterInput
                .getBindingContext()
                .getPath() + "/costCenter",
            oCostCenter.CostCenter
        );

    this._oRecipientCostCenterDialog.close();
},


onRecipientCostCenterPicklistCancel: function () {

    if (this._oRecipientCostCenterDialog) {
        this._oRecipientCostCenterDialog.close();
    }

},

        onDocTypePicklistSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("value");
            var oBinding = oEvent.getParameter("itemsBinding");
            if (!sQuery) {
                oBinding.filter([]);
                return;
            }
            oBinding.filter([new Filter("documentType", FilterOperator.Contains, sQuery)]);
        },

        onDocTypePicklistConfirm: function (oEvent) {
            var oSelected = oEvent.getParameter("selectedItem");
            if (!oSelected) { return; }
            var sType = oSelected.getBindingContext().getObject().documentType;
            this.getView().getModel().setProperty("/headerData/documentTypeCode", sType);
        },

        onDocTypePicklistCancel: function () {
            // SelectDialog self-closes
        },

        _validateParties: function () {
            var oModel = this.getView().getModel();
            var sIniCC = oModel.getProperty("/headerData/initiatorCC");
            var sRecCC = oModel.getProperty("/headerData/recipientCC");
            var sRecBP = oModel.getProperty("/headerData/recipientBP");

            if (sIniCC && sRecCC && sRecBP) {
                oModel.setProperty("/headerData/partyValidationVisible", true);
                oModel.setProperty("/headerData/partyValidationState", "Success");
                oModel.setProperty("/headerData/partyValidationText",
                    "T001U relationship confirmed. Initiator " + sIniCC + " ↔ Recipient " + sRecCC +
                    ". Interco clearing accounts derived from YY1_ICT001U.");
            } else {
                oModel.setProperty("/headerData/partyValidationVisible", false);
            }
        },

        // ─────────────────────────────────────────────────────────────────────
        // Document Details & Amount Calculations
        // ─────────────────────────────────────────────────────────────────────

        onDocumentDateChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oModel = this.getView().getModel();
            oModel.setProperty("/headerData/documentDate", sValue);
            if (sValue) { oModel.setProperty("/headerData/documentDateState", "None"); }
        },

        onPostingDateChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oModel = this.getView().getModel();
            oModel.setProperty("/headerData/postingDate", sValue);
            if (sValue) { oModel.setProperty("/headerData/postingDateState", "None"); }

            if (sValue) {
                var oParsed = Helper.parseDate(sValue);
                if (oParsed) {
                    var sPeriod = String(oParsed.month).padStart(2, "0");
                    var sYear = String(oParsed.year);
                    oModel.setProperty("/headerData/fiscalPeriod", sPeriod);
                    oModel.setProperty("/headerData/fiscalYear", sYear);
                    this._checkPeriodStatus(sPeriod, sYear);
                }
            }
        },

        _checkPeriodStatus: function (sPeriod, sYear) {
            var oModel = this.getView().getModel();
            var sKey = sPeriod + "/" + sYear;
            var aClosedPeriods = oModel.getProperty("/referenceData/closedPeriods") || [];
            var bClosed = aClosedPeriods.indexOf(sKey) > -1;
            oModel.setProperty("/headerData/periodStatusState", bClosed ? "Error" : "Success");
            oModel.setProperty("/headerData/periodStatusText",
                "Period " + sPeriod + "/" + sYear + (bClosed ? " — CLOSED, posting blocked" : " — Open"));
            oModel.setProperty("/headerData/periodStatusIcon",
                bClosed ? "sap-icon://decline" : "sap-icon://accept");
        },

        onReferenceChange: function () {
            var oModel = this.getView().getModel();
            if ((oModel.getProperty("/headerData/reference") || "").trim()) {
                oModel.setProperty("/headerData/referenceState", "None");
            }
        },

        onHeaderTextChange: function () {
            var oModel = this.getView().getModel();
            if ((oModel.getProperty("/headerData/headerText") || "").trim()) {
                oModel.setProperty("/headerData/headerTextState", "None");
            }
        },

        onIntercoAmountChange: function () {
            var oModel = this.getView().getModel();

            var fNet = parseFloat(oModel.getProperty("/headerData/netAmount")) || 0;
            var fTax = parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;

            oModel.setProperty("/headerData/totalIntercoAmount", (fNet + fTax).toFixed(2));
            if (fNet > 0) { oModel.setProperty("/headerData/netAmountState", "None"); }

            // Show Tax Code dropdowns only when a tax amount has been entered
            var bTaxVisible = fTax > 0;
            oModel.setProperty("/headerData/taxCodeVisible", bTaxVisible);

            if (!bTaxVisible) {
                // Tax removed — clear tax code selections, computed amounts, and any mismatch warning
                oModel.setProperty("/headerData/initiatorTaxCode",   "");
                oModel.setProperty("/headerData/recipientTaxCode",   "");
                oModel.setProperty("/headerData/initiatorTaxAmount", "0.00");
                oModel.setProperty("/headerData/recipientTaxAmount", "0.00");
                oModel.setProperty("/headerData/taxCalcRows",                    []);
                oModel.setProperty("/headerData/taxCalcVisible",                 false);
                oModel.setProperty("/headerData/initiatorTaxMismatchVisible",    false);
                oModel.setProperty("/headerData/initiatorTaxMismatchText",       "");
                oModel.setProperty("/headerData/recipientTaxMismatchVisible",    false);
                oModel.setProperty("/headerData/recipientTaxMismatchText",       "");
            }

            this._recalculateTax();
            this._syncBPClearingLine();
            this._syncRecipientBPClearingLine();
            this._recalculateBalance();
            this._validateTaxCodeState();
        },

        // ─────────────────────────────────────────────────────────────────────
        // Tax Details
        // ─────────────────────────────────────────────────────────────────────

        onInitiatorTaxCodeChange: function () {
            var oModel = this.getView().getModel();
            var sCode  = oModel.getProperty("/headerData/initiatorTaxCode") || "";
            // Propagate selected Tax / VAT Code to every initiator GL line
            var aLines = oModel.getProperty("/initiatorLines") || [];
            aLines.forEach(function (oLine) { oLine.taxCode = sCode; });
            oModel.setProperty("/initiatorLines", aLines);

            this._recalculateTax();
            this._syncBPClearingLine();
            this._recalculateBalance();
            this._syncRecipientBPClearingLine();
            this._validateTaxCodeState();
        },

        onRecipientTaxCodeChange: function () {
            var oModel = this.getView().getModel();
            var sCode  = oModel.getProperty("/headerData/recipientTaxCode") || "";
            // Propagate selected Tax / VAT Code to every recipient GL line
            var aLines = oModel.getProperty("/recipientLines") || [];
            aLines.forEach(function (oLine) { oLine.taxCode = sCode; });
            oModel.setProperty("/recipientLines", aLines);

            this._recalculateTax();
            this._syncRecipientBPClearingLine();
            this._validateTaxCodeState();
        },

        _validateTaxCodeState: function () {
            var oModel = this.getView().getModel();
            var fTax = parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;
            var sIni = oModel.getProperty("/headerData/initiatorTaxCode") || "";
            var sRec = oModel.getProperty("/headerData/recipientTaxCode") || "";
            oModel.setProperty("/headerData/initiatorTaxCodeState", (fTax > 0 && !sIni) ? "Error" : "None");
            oModel.setProperty("/headerData/recipientTaxCodeState",  (fTax > 0 && !sRec) ? "Error" : "None");
        },

        _recalculateTax: function () {
            var oModel      = this.getView().getModel();
            // Req 2/3: base is IC Net Amount — user-entered /headerData/taxAmount is NEVER modified here
            var fNet        = parseFloat(oModel.getProperty("/headerData/netAmount")) || 0;
            var sIniCode    = oModel.getProperty("/headerData/initiatorTaxCode") || "";
            var sRecCode    = oModel.getProperty("/headerData/recipientTaxCode") || "";
            var sIniCountry = oModel.getProperty("/headerData/initiatorCountry") || "";
            var sRecCountry = oModel.getProperty("/headerData/recipientCountry") || "";

            if (!fNet || (!sIniCode && !sRecCode)) {
                oModel.setProperty("/headerData/initiatorTaxAmount", "0.00");
                oModel.setProperty("/headerData/recipientTaxAmount", "0.00");
                oModel.setProperty("/headerData/taxCalcRows",                    []);
                oModel.setProperty("/headerData/taxCalcVisible",                 false);
                oModel.setProperty("/headerData/initiatorTaxMismatchVisible",    false);
                oModel.setProperty("/headerData/initiatorTaxMismatchText",       "");
                oModel.setProperty("/headerData/recipientTaxMismatchVisible",    false);
                oModel.setProperty("/headerData/recipientTaxMismatchText",       "");
                return;
            }

            var fIniTax = 0;
            var fRecTax = 0;
            var pChain  = Promise.resolve();

            if (sIniCode) {
                pChain = pChain.then(function () {
                    return MasterDataService.getTaxCodeRate(sIniCode, sIniCountry);
                }).then(function (fRate) {
                    // Req 2: Calculated Tax = IC Net Amount × CONDITIONRATERATIO / 100
                    fIniTax = fNet * fRate / 100;
                    oModel.setProperty("/headerData/initiatorTaxAmount", fIniTax.toFixed(2));
                });
            }

            if (sRecCode) {
                pChain = pChain.then(function () {
                    return MasterDataService.getTaxCodeRate(sRecCode, sRecCountry);
                }).then(function (fRate) {
                    // Req 3: Same formula for recipient
                    fRecTax = fNet * fRate / 100;
                    oModel.setProperty("/headerData/recipientTaxAmount", fRecTax.toFixed(2));
                });
            }

            pChain.then(function () {
                var sCcy   = oModel.getProperty("/headerData/currency") || Constants.DEFAULT.CURRENCY;
                var sIniCC = (oModel.getProperty("/headerData/initiatorCC") || "").trim().toUpperCase();
                var sRecCC = (oModel.getProperty("/headerData/recipientCC") || "").trim().toUpperCase();
                var aRows  = [];

                if (fNet > 0 && sIniCode) {
                    aRows.push({
                        entity:    "Initiator" + (sIniCC ? " (" + sIniCC + ")" : ""),
                        taxCode:   sIniCode,
                        rate:      (fNet > 0 ? ((fIniTax / fNet) * 100).toFixed(2) : "0.00") + "%",
                        gross:     fNet.toFixed(2),
                        taxAmount: fIniTax.toFixed(2),
                        netAmount: (fNet - fIniTax).toFixed(2),
                        currency:  sCcy
                    });
                }
                if (fNet > 0 && sRecCode) {
                    aRows.push({
                        entity:    "Recipient" + (sRecCC ? " (" + sRecCC + ")" : ""),
                        taxCode:   sRecCode,
                        rate:      (fNet > 0 ? ((fRecTax / fNet) * 100).toFixed(2) : "0.00") + "%",
                        gross:     fNet.toFixed(2),
                        taxAmount: fRecTax.toFixed(2),
                        netAmount: (fNet - fRecTax).toFixed(2),
                        currency:  sCcy
                    });
                }
                oModel.setProperty("/headerData/taxCalcRows",    aRows);
                oModel.setProperty("/headerData/taxCalcVisible", aRows.length > 0);

                // Req 4: Compare user-entered taxAmount vs total calculated — warning only, never overwrite
                var fUserTax = parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;

                // Initiator mismatch: compare user tax vs initiator calculated tax only
                if (fUserTax > 0 && sIniCode && Math.abs(fUserTax - fIniTax) > 0.01) {
                    oModel.setProperty("/headerData/initiatorTaxMismatchVisible", true);
                    oModel.setProperty("/headerData/initiatorTaxMismatchText",
                        "Warning: The entered Tax Amount (" + fUserTax.toFixed(2) + " " + sCcy +
                        ") does not match the calculated Tax Amount (" + fIniTax.toFixed(2) + " " + sCcy +
                        ") based on the selected Tax Code. Please review the entered value.");
                } else {
                    oModel.setProperty("/headerData/initiatorTaxMismatchVisible", false);
                    oModel.setProperty("/headerData/initiatorTaxMismatchText",    "");
                }

                // Recipient mismatch: compare user tax vs recipient calculated tax only
                if (fUserTax > 0 && sRecCode && Math.abs(fUserTax - fRecTax) > 0.01) {
                    oModel.setProperty("/headerData/recipientTaxMismatchVisible", true);
                    oModel.setProperty("/headerData/recipientTaxMismatchText",
                        "Warning: The entered Tax Amount (" + fUserTax.toFixed(2) + " " + sCcy +
                        ") does not match the calculated Tax Amount (" + fRecTax.toFixed(2) + " " + sCcy +
                        ") based on the selected Tax Code. Please review the entered value.");
                } else {
                    oModel.setProperty("/headerData/recipientTaxMismatchVisible", false);
                    oModel.setProperty("/headerData/recipientTaxMismatchText",    "");
                }
            });
        },

        // ─────────────────────────────────────────────────────────────────────
        // Attachments
        // ─────────────────────────────────────────────────────────────────────

        onAttachmentAdd: function (oEvent) {
            var oFileUploader = oEvent.getSource();
            var aFiles = oEvent.getParameter("files");
            if (!aFiles || !aFiles.length) return;

            var oModel = this.getView().getModel();
            var aAttachments = oModel.getProperty("/headerData/attachments") || [];

            for (var i = 0; i < aFiles.length; i++) {
                var oFile = aFiles[i];
                aAttachments.push({
                    fileName: oFile.name,
                    fileType: (oFile.name.split(".").pop() || "").toUpperCase(),
                    fileSize: Helper.formatFileSize(oFile.size) || "—",
                    uploader: "Current User",
                    uploadDate: new Date().toLocaleDateString("en-GB"),
                    isSystem: false
                });
            }
            oModel.setProperty("/headerData/attachments", aAttachments);
            oFileUploader.clear();
        },

        onAttachmentDelete: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            var sPath = oCtx.getPath();
            var iIndex = parseInt(sPath.split("/").pop(), 10);
            var oModel = this.getView().getModel();
            var aAttachments = oModel.getProperty("/headerData/attachments");
            aAttachments.splice(iIndex, 1);
            oModel.setProperty("/headerData/attachments", aAttachments);
        },

        // ─────────────────────────────────────────────────────────────────────
        // GL Coding — Initiator
        // ─────────────────────────────────────────────────────────────────────

        onAddInitiatorLine: function () {
            _rowCounter++;
            var oModel = this.getView().getModel();
            var aLines = oModel.getProperty("/initiatorLines") || [];
            var sRecCC = oModel.getProperty("/headerData/recipientCC") || "";
            var sIniTaxCode = oModel.getProperty("/headerData/initiatorTaxCode") || "";

            aLines.push({
                rowNum: aLines.length + 1,
                isSystemLine: false,
                debitCredit: Constants.DC_INDICATOR.CREDIT,
                glAccount: "",
                businessPartner: "",
                amountDC: "",
                taxCode: sIniTaxCode,
                taxAmount: "0.00",
                tradingPartner: sRecCC,
                partnerPrCtr: "",
                wbsElement: "",
                costCenter: "",
                profitCenter: "",
                internalOrder: "",
                personnel: "",
                contract: "",
                contractType: "",
                assignment: "",
                itemText: "",
                lineRef1: "",
                lineRef2: "",
                lineRef3: ""
            });

            oModel.setProperty("/initiatorLines", aLines);
            this._recalculateBalance();
        },

        onDeleteInitiatorLine: function (oEvent) {
            var oModel = this.getView().getModel();
            var oCtx = oEvent.getSource().getBindingContext();
            var sPath = oCtx.getPath();
            var iIndex = parseInt(sPath.split("/").pop(), 10);

            var aLines = oModel.getProperty("/initiatorLines");
            if (aLines[iIndex] && aLines[iIndex].isSystemLine) {
                MessageToast.show("BP clearing line cannot be deleted.");
                return;
            }
            aLines.splice(iIndex, 1);
            aLines.forEach(function (oLine, i) { oLine.rowNum = i + 1; });
            oModel.setProperty("/initiatorLines", aLines);
            this._recalculateBalance();
        },

        onGLLineChange: function () {
            this._recalculateBalance();
        },

        _recalculateBalance: function () {
            var oModel = this.getView().getModel();
            var aLines = oModel.getProperty("/initiatorLines") || [];
            var fTotalDr = 0, fTotalCr = 0;

            aLines.forEach(function (oLine) {
                var fAmt = parseFloat(String(oLine.amountDC).replace(/[^0-9.\-]/g, "")) || 0;
                if (oLine.debitCredit === Constants.DC_INDICATOR.DEBIT) {
                    fTotalDr += fAmt;
                } else {
                    fTotalCr += fAmt;
                }
            });

            var fNet = fTotalDr - fTotalCr;
            var bBalanced = Math.abs(fNet) < Constants.BALANCE_TOLERANCE;

            oModel.setProperty("/initiatorBalance", {
                totalDebits: fTotalDr.toFixed(2),
                totalCredits: fTotalCr.toFixed(2),
                netAmount: fNet.toFixed(2),
                isBalanced: bBalanced
            });
        },

        _syncBPClearingLine: function () {
            var oModel = this.getView().getModel();
            var aLines = oModel.getProperty("/initiatorLines");
            if (!aLines || !aLines.length) return;

            var sTxType        = oModel.getProperty("/headerData/transactionType");
            var sInitiatorBP   = oModel.getProperty("/headerData/initiatorBP") || "—";
            var sRecipientBP   = oModel.getProperty("/headerData/recipientBP") || "—";
            var sReconAccount  = oModel.getProperty("/headerData/reconciliationAccount") || sRecipientBP;
            var fGross         = parseFloat(oModel.getProperty("/headerData/totalIntercoAmount")) || 0;
            var fIniTaxAmt     = parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;
            var sIniTaxCode    = oModel.getProperty("/headerData/initiatorTaxCode") || "";

            // GL Account = ReconciliationAccount from I_SupplierCompany(recipientCC, recipientBP).
            // Business Partner = Recipient BP (how the recipient appears as a supplier in initiator's books).
            // Trading Partner  = Recipient Company Code (the intercompany counterpart).
            aLines[0].glAccount       = sReconAccount;
            aLines[0].businessPartner = sRecipientBP;
            aLines[0].tradingPartner  = oModel.getProperty("/headerData/recipientCC") || "—";
            aLines[0].amountDC        = fGross.toFixed(2);
            aLines[0].taxCode         = sIniTaxCode;
            aLines[0].taxAmount       = fIniTaxAmt.toFixed(2);
            aLines[0].debitCredit     = sTxType === Constants.TRANSACTION_TYPE.AP
                ? Constants.DC_INDICATOR.CREDIT
                : Constants.DC_INDICATOR.DEBIT;

            oModel.setProperty("/initiatorLines", aLines);
            this._recalculateBalance();
        },

        _propagateTradingPartner: function () {
            var oModel = this.getView().getModel();
            var aLines = oModel.getProperty("/initiatorLines") || [];
            var sRecCC = (oModel.getProperty("/headerData/recipientCC") || "").trim();
            aLines.forEach(function (oLine) {
                oLine.tradingPartner = sRecCC || "—";
            });
            oModel.setProperty("/initiatorLines", aLines);
        },

        // ─────────────────────────────────────────────────────────────────────
        // GL Coding — Recipient
        // ─────────────────────────────────────────────────────────────────────

        onAddRecipientLine: function () {
            var oModel = this.getView().getModel();
            var aLines = oModel.getProperty("/recipientLines") || [];
            var sIniCC = oModel.getProperty("/headerData/initiatorCC") || "";
            var sRecTaxCode = oModel.getProperty("/headerData/recipientTaxCode") || "";

            aLines.push({
                rowNum: aLines.length + 1,
                isSystemLine: false,
                debitCredit: Constants.DC_INDICATOR.DEBIT,
                glAccount: "",
                businessPartner: "",
                amountDC: "",
                taxCode: sRecTaxCode,
                taxAmount: "0.00",
                tradingPartner: sIniCC,
                partnerPrCtr: "",
                wbsElement: "",
                costCenter: "",
                profitCenter: "",
                internalOrder: "",
                personnel: "",
                contract: "",
                contractType: "",
                assignment: "",
                itemText: "",
                lineRef1: "",
                lineRef2: "",
                lineRef3: ""
            });

            oModel.setProperty("/recipientLines", aLines);
            this._recalculateRecipientBalance();
        },

        onDeleteRecipientLine: function (oEvent) {
            var oModel = this.getView().getModel();
            var oCtx = oEvent.getSource().getBindingContext();
            var sPath = oCtx.getPath();
            var iIndex = parseInt(sPath.split("/").pop(), 10);

            var aLines = oModel.getProperty("/recipientLines");
            if (aLines[iIndex] && aLines[iIndex].isSystemLine) {
                MessageToast.show("BP clearing line cannot be deleted.");
                return;
            }
            aLines.splice(iIndex, 1);
            aLines.forEach(function (oLine, i) { oLine.rowNum = i + 1; });
            oModel.setProperty("/recipientLines", aLines);
            this._recalculateRecipientBalance();
        },

        onRecipientGLLineChange: function () {
            this._recalculateRecipientBalance();
        },

        _recalculateRecipientBalance: function () {
            var oModel = this.getView().getModel();
            var aLines = oModel.getProperty("/recipientLines") || [];
            var fTotalDr = 0, fTotalCr = 0;

            aLines.forEach(function (oLine) {
                var fAmt = parseFloat(String(oLine.amountDC).replace(/[^0-9.\-]/g, "")) || 0;
                if (oLine.debitCredit === Constants.DC_INDICATOR.DEBIT) {
                    fTotalDr += fAmt;
                } else {
                    fTotalCr += fAmt;
                }
            });

            var fNet = fTotalDr - fTotalCr;
            var bBalanced = Math.abs(fNet) < Constants.BALANCE_TOLERANCE;

            oModel.setProperty("/recipientBalance", {
                totalDebits: fTotalDr.toFixed(2),
                totalCredits: fTotalCr.toFixed(2),
                netAmount: fNet.toFixed(2),
                isBalanced: bBalanced
            });
        },

        _syncRecipientBPClearingLine: function () {
            var oModel = this.getView().getModel();
            var aLines = oModel.getProperty("/recipientLines");
            if (!aLines || !aLines.length) return;

            var sTxType        = oModel.getProperty("/headerData/transactionType");
            var sInitiatorBP   = oModel.getProperty("/headerData/initiatorBP") || "—";
            var sReconAccount  = oModel.getProperty("/headerData/recipientReconciliationAccount") || sInitiatorBP;
            var fGross         = parseFloat(oModel.getProperty("/headerData/totalIntercoAmount")) || 0;
            var fRecTaxAmt     = parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;
            var sRecTaxCode    = oModel.getProperty("/headerData/recipientTaxCode") || "";

            // GL Account = ReconciliationAccount from I_CustomerCompany(initiatorCC, initiatorBP).
            // Business Partner = Initiator BP (how the initiator appears as a customer in recipient's books).
            // Trading Partner  = Initiator Company Code (the intercompany counterpart).
            aLines[0].glAccount       = sReconAccount;
            aLines[0].businessPartner = sInitiatorBP;
            aLines[0].tradingPartner  = oModel.getProperty("/headerData/initiatorCC") || "—";
            aLines[0].amountDC        = fGross.toFixed(2);
            aLines[0].taxCode         = sRecTaxCode;
            aLines[0].taxAmount       = fRecTaxAmt.toFixed(2);
            aLines[0].debitCredit     = sTxType === Constants.TRANSACTION_TYPE.AP
                ? Constants.DC_INDICATOR.DEBIT
                : Constants.DC_INDICATOR.CREDIT;

            oModel.setProperty("/recipientLines", aLines);
            this._recalculateRecipientBalance();
        },

        _propagateRecipientTradingPartner: function () {
            var oModel = this.getView().getModel();
            var aLines = oModel.getProperty("/recipientLines") || [];
            var sIniCC = (oModel.getProperty("/headerData/initiatorCC") || "").trim();
            aLines.forEach(function (oLine) {
                oLine.tradingPartner = sIniCC || "—";
            });
            oModel.setProperty("/recipientLines", aLines);
        },

        onRecipientValidate: function () {
            var oModel = this.getView().getModel();
            oModel.setProperty("/appState/isBusy", true);

            var that = this;
            setTimeout(function () {
                var aMessages = [];

                function addMsg(type, cls, num, text) {
                    aMessages.push({ type: type, msgClass: cls, msgNum: num, text: text });
                }

                var aLines = oModel.getProperty("/recipientLines") || [];
                var aUserLines = aLines.filter(function (l) { return !l.isSystemLine; });

                var oHeader = oModel.getProperty("/headerData");
                if (!oHeader.initiatorCC) addMsg("E", "ZFI", "001", "Initiator Company Code is required.");
                if (!oHeader.recipientCC) addMsg("E", "ZFI", "002", "Recipient Company Code is required.");
                if (!oHeader.postingDate) addMsg("E", "ZFI", "003", "Posting Date is required.");

                var fTaxAmount = parseFloat(oHeader.taxAmount) || 0;
                if (fTaxAmount > 0 && !oHeader.recipientTaxCode) {
                    oModel.setProperty("/appState/isBusy", false);
                    oModel.setProperty("/recipientValidation", {
                        visible: true,
                        state: "Error",
                        text: "Tax Code is required when a Tax Amount is entered. Please select a Tax / VAT Code."
                    });
                    return;
                }

                if (aUserLines.length === 0) {
                    addMsg("E", "ZFI", "004", "At least one G/L line item must be entered.");
                }

                aUserLines.forEach(function (line, idx) {
                    if (!line.glAccount) {
                        addMsg("E", "ZFI", "005", "Line " + (idx + 2) + ": G/L Account is missing.");
                    }
                    if (!line.amountDC || parseFloat(line.amountDC) === 0) {
                        addMsg("E", "ZFI", "006", "Line " + (idx + 2) + ": Amount must be greater than zero.");
                    }
                });

                var oBalance = oModel.getProperty("/recipientBalance");
                if (!oBalance.isBalanced) {
                    addMsg("E", "ZFI", "007", "Document is not in balance. Net difference: " + oBalance.netAmount);
                }

                oModel.setProperty("/appState/isBusy", false);

                var bHasError = aMessages.some(function (m) { return m.type === "E"; });
                if (bHasError) {
                    oModel.setProperty("/recipientValidation", {
                        visible: true,
                        state: "Error",
                        text: "Validation failed with " + aMessages.length + " error(s)."
                    });
                    MessageBox.error("Validation failed. Please review the highlighted errors.");
                } else {
                    oModel.setProperty("/recipientValidation", {
                        visible: true,
                        state: "Success",
                        text: "All checks passed successfully. Document is ready to post or submit."
                    });
                    MessageToast.show("Validation successful!");
                }
            }, 500);
        },

        // onInitiatorValidate: function () {
        //     var oModel = this.getView().getModel();
        //     oModel.setProperty("/appState/isBusy", true);

        //     var that = this;
        //     setTimeout(function () {
        //         var aMessages = [];

        //         function addMsg(type, cls, num, text) {
        //             aMessages.push({ type: type, msgClass: cls, msgNum: num, text: text });
        //         }

        //         var aLines = oModel.getProperty("/initiatorLines") || [];
        //         var aUserLines = aLines.filter(function (l) { return !l.isSystemLine; });

        //         // Header validation
        //         var oHeader = oModel.getProperty("/headerData");
        //         if (!oHeader.initiatorCC) addMsg("E", "ZFI", "001", "Initiator Company Code is required.");
        //         if (!oHeader.recipientCC) addMsg("E", "ZFI", "002", "Recipient Company Code is required.");
        //         if (!oHeader.postingDate) addMsg("E", "ZFI", "003", "Posting Date is required.");

        //         var fTaxAmount = parseFloat(oHeader.taxAmount) || 0;
        //         var sTaxCode = oHeader.initiatorTaxCode;
        //         if (fTaxAmount > 0 && !sTaxCode) {
        //             oModel.setProperty("/appState/isBusy", false);
        //             oModel.setProperty("/initiatorValidation", {
        //                 visible: true,
        //                 state: "Error",
        //                 text: "Tax Code is required when a Tax Amount is entered. Please select a Tax / VAT Code."
        //             });
        //             return;
        //         }


        //         // Line items check
        //         if (aUserLines.length === 0) {
        //             addMsg("E", "ZFI", "004", "At least one G/L line item must be entered.");
        //         }

        //         aUserLines.forEach(function (line, idx) {
        //             if (!line.glAccount) {
        //                 addMsg("E", "ZFI", "005", "Line " + (idx + 2) + ": G/L Account is missing.");
        //             }
        //             if (!line.amountDC || parseFloat(line.amountDC) === 0) {
        //                 addMsg("E", "ZFI", "006", "Line " + (idx + 2) + ": Amount must be greater than zero.");
        //             }
        //         });

        //         // Balance check
        //         var oBalance = oModel.getProperty("/initiatorBalance");
        //         if (!oBalance.isBalanced) {
        //             addMsg("E", "ZFI", "007", "Document is not in balance. Net difference: " + oBalance.netAmount);
        //         }

        //         oModel.setProperty("/appState/isBusy", false);

        //         var bHasError = aMessages.some(function (m) { return m.type === "E"; });
        //         if (bHasError) {
        //             oModel.setProperty("/initiatorValidation", {
        //                 visible: true,
        //                 state: "Error",
        //                 text: "Validation failed with " + aMessages.length + " error(s)."
        //             });
        //             MessageBox.error("Validation failed. Please review the highlighted errors.");
        //         } else {
        //             oModel.setProperty("/initiatorValidation", {
        //                 visible: true,
        //                 state: "Success",
        //                 text: "All checks passed successfully. Document is ready to post or submit."
        //             });
        //             MessageToast.show("Validation successful!");
        //         }
        //     }, 500);
        // },

        onInitiatorValidate: function () {

    var oModel = this.getView().getModel();

    // ---------------------------------------------------------
    // 1. Run existing UI validation first
    // ---------------------------------------------------------
    var oHeader = oModel.getProperty("/headerData") || {};
    var aInitiatorLines =
        oModel.getProperty("/initiatorLines") || [];

    var aUserLines = aInitiatorLines.filter(function (oLine) {
        return !oLine.isSystemLine;
    });

    // Header checks
    if (!oHeader.initiatorCC) {
        MessageBox.error("Initiator Company Code is required.");
        return;
    }

    if (!oHeader.recipientCC) {
        MessageBox.error("Recipient Company Code is required.");
        return;
    }

    if (!oHeader.postingDate) {
        MessageBox.error("Posting Date is required.");
        return;
    }

    // Tax validation
    var fTaxAmount =
        parseFloat(oHeader.taxAmount) || 0;

    if (
        fTaxAmount > 0 &&
        !oHeader.initiatorTaxCode
    ) {
        MessageBox.error(
            "Tax Code is required when a Tax Amount is entered."
        );
        return;
    }

    // At least one user line
    if (aUserLines.length === 0) {
        MessageBox.error(
            "At least one G/L line item must be entered."
        );
        return;
    }

    // Line validation
    for (var i = 0; i < aUserLines.length; i++) {

        var oLine = aUserLines[i];

        if (!oLine.glAccount || oLine.glAccount === "—") {

            MessageBox.error(
                "Line " + (i + 2) +
                ": G/L Account is missing."
            );

            return;
        }

        if (
            !oLine.amountDC ||
            parseFloat(oLine.amountDC) === 0
        ) {

            MessageBox.error(
                "Line " + (i + 2) +
                ": Amount must be greater than zero."
            );

            return;
        }
    }

    // Balance validation
    var oBalance =
        oModel.getProperty("/initiatorBalance");

    if (!oBalance || !oBalance.isBalanced) {

        MessageBox.error(
            "Document is not in balance. Net difference: " +
            (oBalance ? oBalance.netAmount : "0.00")
        );

        return;
    }

    // ---------------------------------------------------------
    // 2. UI validation passed
    // ---------------------------------------------------------
    oModel.setProperty(
        "/appState/isBusy",
        true
    );

    oModel.setProperty(
        "/initiatorValidation",
        {
            visible: true,
            state: "Information",
            text: "Validating document in SAP..."
        }
    );

    // ---------------------------------------------------------
    // 3. Get Recipient lines also
    //
    // saveDraftAndSimulate creates the complete draft:
    // Header + Initiator Items + Recipient Items
    // ---------------------------------------------------------
    var aRecipientLines =
        oModel.getProperty("/recipientLines") || [];

    // ---------------------------------------------------------
    // 4. Call MasterDataService
    // ---------------------------------------------------------
    MasterDataService.saveDraftAndSimulate(
        oHeader,
        aInitiatorLines,
        aRecipientLines
    )

    .then(function (oResult) {

        console.log(
            "[Main] SAP Simulation successful:",
            oResult
        );

        oModel.setProperty(
            "/appState/isBusy",
            false
        );

        // Store temporary document number
        oModel.setProperty(
            "/workflow/intercoRef",
            oResult.accountingdocument_temp || ""
        );

        // Mark validation successful
        oModel.setProperty(
            "/initiatorValidation",
            {
                visible: true,
                state: "Success",
                text:
                    "SAP validation successful. " +
                    "No errors were returned."
            }
        );

        MessageBox.success(
            "SAP validation successful.\n\n" +
            "Draft Document: " +
            (oResult.accountingdocument_temp || "—")
        );

    })

    .catch(function (oError) {

        console.error(
            "[Main] SAP Simulation failed:",
            oError
        );

        oModel.setProperty(
            "/appState/isBusy",
            false
        );

        oModel.setProperty(
            "/initiatorValidation",
            {
                visible: true,
                state: "Error",
                text:
                    "SAP validation failed."
            }
        );

        MessageBox.error(
            "SAP validation failed.\n\n" +
            (
                oError &&
                oError.message
                    ? oError.message
                    : "An unexpected error occurred."
            )
        );
    });
},

   onCreateNewIC: function () {
    var oApp = this.getView().byId("icAppRoot");
    var oFormPage = this.getView().byId("icFormPage");
     var oModel = this.getView().getModel();
            oModel.setProperty("/appState/isEditMode", true);
            oModel.setProperty("/appState/isHeaderEditable", true);

    if (!oApp) {
        sap.m.MessageBox.error("icAppRoot not found");
        return;
    }

    if (!oFormPage) {
        sap.m.MessageBox.error("icFormPage not found");
        return;
    }

    oApp.to(oFormPage.getId());
},

        // ─────────────────────────────────────────────────────────────────────
        // Action Handlers (Save, Submit, Reset)
        // ─────────────────────────────────────────────────────────────────────

        onSaveDraft: function () {
            var oModel = this.getView().getModel();
            oModel.setProperty("/appState/isBusy", true);

            setTimeout(function () {
                oModel.setProperty("/appState/isBusy", false);
                oModel.setProperty("/workflow/status", Constants.WORKFLOW_STATUS.DRAFT);
                oModel.setProperty("/workflow/statusState", "Warning");
                oModel.setProperty("/workflow/intercoRef", "IC-2026-" + Math.floor(1000 + Math.random() * 9000));
                MessageToast.show("Draft saved successfully.");
            }, 600);
        },

        _validateRequiredFields: function () {
            var oModel  = this.getView().getModel();
            var oHeader = oModel.getProperty("/headerData");
            var bValid  = true;

            var aChecks = [
                { state: "initiatorCCState",  test: !!(oHeader.initiatorCC  || "").trim() },
                { state: "recipientBPState",  test: !!(oHeader.recipientBP  || "").trim() },
                { state: "recipientCCState",  test: !!(oHeader.recipientCC  || "").trim() },
                { state: "documentDateState", test: !!(oHeader.documentDate || "").trim() },
                { state: "postingDateState",  test: !!(oHeader.postingDate  || "").trim() },
                { state: "referenceState",    test: !!(oHeader.reference    || "").trim() },
                { state: "headerTextState",   test: !!(oHeader.headerText   || "").trim() }
            ];

            aChecks.forEach(function (o) {
                oModel.setProperty("/headerData/" + o.state, o.test ? "None" : "Error");
                if (!o.test) { bValid = false; }
            });

            var fNet = parseFloat(oHeader.netAmount) || 0;
            oModel.setProperty("/headerData/netAmountState", fNet > 0 ? "None" : "Error");
            if (fNet <= 0) { bValid = false; }

            return bValid;
        },

        onSubmitWorkflow: function () {
            var oModel   = this.getView().getModel();

            if (!this._validateRequiredFields()) {
                MessageBox.error("Please fill in all required fields before submitting.");
                return;
            }

            var oBalance = oModel.getProperty("/initiatorBalance");

            if (!oBalance.isBalanced) {
                MessageBox.error("Cannot submit: Document debits and credits must balance.");
                return;
            }

            MessageBox.confirm("Submit this intercompany document for posting in SAP?", {
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.
                        OK) { return; }

                    oModel.setProperty("/appState/isBusy", true);

                    var oHeader          = oModel.getProperty("/headerData");
                    var aInitiatorLines  = oModel.getProperty("/initiatorLines") || [];
                    var aRecipientLines  = oModel.getProperty("/recipientLines") || [];
                    console.log("Header for Submit:", oHeader);
                    console.log("Initiator Lines:", aInitiatorLines);
                    console.log("Recipient Lines:", aRecipientLines);

                    MasterDataService.submitIntercoDocument(oHeader, aInitiatorLines, aRecipientLines)
                        .then(function (oResult) {
                            oModel.setProperty("/appState/isBusy", false);
                            oModel.setProperty("/appState/isHeaderEditable", false);
                            oModel.setProperty("/appState/isRecipientEditable", true);
                            oModel.setProperty("/workflow/status", Constants.WORKFLOW_STATUS.SUBMITTED);
                            oModel.setProperty("/workflow/statusState", "Success");
                            oModel.setProperty("/workflow/intercoRef", oResult.accountingdocument_temp || "POSTED");
                            oModel.setProperty("/workflow/initiatorLineCount", aInitiatorLines.length);
                            MessageBox.success(
                                "Intercompany document posted successfully in SAP.\n\n" +
                                "Document reference: " + (oResult.accountingdocument_temp || "—")
                            );
                        })
                        .catch(function (oError) {
                            oModel.setProperty("/appState/isBusy", false);
                            MessageBox.error(
                                "Submission failed:\n\n" +
                                (oError && oError.message ? oError.message : "An unexpected error occurred.")
                            );
                        });
                }
            });
        },

        onResetForm: function () {
            var that = this;
            MessageBox.warning("Are you sure you want to reset the entire form?", {
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.YES) {
                        that._initModel();
                        that._loadReferenceData();
                        MessageToast.show("Form has been reset.");
                    }
                }
            });
        },


        // filer 
        onInitiatorCompanyCodeTokenUpdate: function (oEvent) {

    var oModel = this.getView().getModel();
    var aTokens = oEvent.getSource().getTokens();

    var sValue = "";

    if (aTokens.length > 0) {
        sValue = aTokens[0].getKey() || aTokens[0].getText();
    }

    oModel.setProperty("/search/inCompanyCode", sValue);

    console.log(
        "Search Initiator Company Code:",
        sValue
    );
},

onRecipientCompanyCodeTokenUpdate: function (oEvent) {

    var oModel = this.getView().getModel();
    var aTokens = oEvent.getSource().getTokens();

    var sValue = "";

    if (aTokens.length > 0) {
        sValue = aTokens[0].getKey() || aTokens[0].getText();
    }

    oModel.setProperty("/search/recCompanyCode", sValue);

    console.log(
        "Search Recipient Company Code:",
        sValue
    );
},

        // search filter
 onGoSearch: function () {

    var oModel = this.getView().getModel();

      var sInitiatorCC =
        (oModel.getProperty("/search/in_companycode") || "")
            .trim()
            .toUpperCase();

    var sRecipientCC =
        (oModel.getProperty("/search/rec_companycode") || "")
            .trim()
            .toUpperCase();

    console.log("=================================");
    console.log("IC SEARCH");
    console.log("Initiator Company Code:", sInitiatorCC);
    console.log("Recipient Company Code:", sRecipientCC);
    console.log("=================================");

    var oFilters = {
        in_companycode: sInitiatorCC,
        rec_companycode: sRecipientCC
    };

    this._loadJournalEntries(oFilters);
},

        // ─── Download Template ─────────────────────────────────────────────────

        onDownloadInitiatorTemplate: function () {
            var aLines =
                this.getView().getModel().getProperty("/initiatorLines") || [];
            InitiatorGLTemplate.download(aLines);
        },

        onDownloadRecipientTemplate: function () {
            var aLines =
                this.getView().getModel().getProperty("/recipientLines") || [];
            RecipientGLTemplate.download(aLines);
        },

        onCreateNew: function () {
            var oModel = this.getView().getModel();
            oModel.setProperty("/appState/isEditMode", true);
            oModel.setProperty("/appState/isHeaderEditable", true);
        },

        onCancel: function () {
            var that = this;
            var oApp = this.getView().byId("icAppRoot");

    if (oApp) {
        oApp.back();
    }
            MessageBox.warning("Discard changes and return to display mode?", {
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.YES) {
                        that._initModel();
                        that._loadReferenceData();
                    }
                }
            });
        },

        onDeleteDraft: function () {
            var that = this;
            MessageBox.warning("Delete this draft? This cannot be undone.", {
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.YES) {
                        that._initModel();
                        that._loadReferenceData();
                        MessageToast.show("Draft deleted.");
                    }
                }
            });
        },

        onSubmitToRecipient: function () {
            var that   = this;
            var oModel = this.getView().getModel();

            if (!this._validateRequiredFields()) {
                MessageBox.error("Please fill in all required fields before submitting.");
                return;
            }

            var oBalance = oModel.getProperty("/initiatorBalance");
            if (!oBalance.isBalanced) {
                MessageBox.error("Cannot submit: Initiator GL lines debits and credits must balance.");
                return;
            }

            MessageBox.confirm("Submit initiator data and send to recipient for completion?", {
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }

                    oModel.setProperty("/appState/isBusy", true);

                    var oHeader         = oModel.getProperty("/headerData");
                    var aInitiatorLines = oModel.getProperty("/initiatorLines") || [];

                    MasterDataService.submitIntercoDocument(oHeader, aInitiatorLines, [])
                        .then(function (oResult) {
                            oModel.setProperty("/appState/isBusy", false);
                            oModel.setProperty("/appState/isHeaderEditable", false);
                            oModel.setProperty("/appState/isRecipientEditable", true);
                            oModel.setProperty("/workflow/status", Constants.WORKFLOW_STATUS.SUBMITTED);
                            oModel.setProperty("/workflow/statusState", "Success");
                            oModel.setProperty("/workflow/intercoRef", oResult.accountingdocument_temp || "");
                            oModel.setProperty("/workflow/initiatorLineCount", aInitiatorLines.length);
                            MessageBox.success(
                                "Initiator data saved to SAP.\n\n" +
                                "Document reference: " + (oResult.accountingdocument_temp || "—") +
                                "\n\nPlease complete the Recipient GL lines and click Post."
                            );
                        })
                        .catch(function (oError) {
                            oModel.setProperty("/appState/isBusy", false);
                            MessageBox.error(
                                "Submission failed:\n\n" +
                                (oError && oError.message ? oError.message : "An unexpected error occurred.")
                            );
                        });
                }
            });
        },

        onPostDocument: function () {
            var oModel = this.getView().getModel();
            var sDocId = oModel.getProperty("/workflow/intercoRef");

            if (!sDocId) {
                MessageBox.error("No document reference found. Please submit initiator data first.");
                return;
            }

            var oBalance = oModel.getProperty("/recipientBalance");
            if (!oBalance.isBalanced) {
                MessageBox.error("Cannot post: Recipient GL lines debits and credits must balance.");
                return;
            }

            MessageBox.confirm("Post this intercompany document in SAP?", {
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }

                    oModel.setProperty("/appState/isBusy", true);

                    var iInitiatorCount = oModel.getProperty("/workflow/initiatorLineCount") || 0;
                    var oHeader         = oModel.getProperty("/headerData");
                    var aRecipientLines = oModel.getProperty("/recipientLines") || [];

                    MasterDataService.submitRecipientLines(sDocId, oHeader, aRecipientLines, iInitiatorCount)
                        .then(function (oResult) {
                            oModel.setProperty("/appState/isBusy", false);
                            oModel.setProperty("/appState/isRecipientEditable", false);
                            oModel.setProperty("/workflow/status", "Posted");
                            oModel.setProperty("/workflow/statusState", "Success");
                            oModel.setProperty("/workflow/intercoRef", oResult.accountingdocument_temp || sDocId);
                            var sIniDoc = (oResult.in_accountingdocument  || "").replace(/<\/$/, "").trim();
                            var sRecDoc = (oResult.rec_accountingdocument || "").replace(/<\/$/, "").trim();
                            MessageBox.success(
                                "Intercompany document posted successfully.\n\n" +
                                "Initiator: " + (sIniDoc || "—") + "\n" +
                                "Recipient: " + (sRecDoc || "—")
                            );
                        })
                        .catch(function (oError) {
                            oModel.setProperty("/appState/isBusy", false);
                            MessageBox.error("Post failed: " + (oError && oError.message ? oError.message : String(oError)));
                        });
                }
            });
        },

        onSubmitToApprove: function () {
            MessageBox.information("Submit to Approve ");
        },

    });
});