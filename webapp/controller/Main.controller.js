sap.ui.define(
  [
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
    "sap/m/Token",
    "ZFI_INTERCO/util/InitiatorGLTemplate",
    "ZFI_INTERCO/util/RecipientGLTemplate",
  ],
  function (
    BaseController,
    MasterDataService,
    Constants,
    Helper,
    Formatter,
    JSONModel,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast,
    Fragment,
    Token,
    InitiatorGLTemplate,
    RecipientGLTemplate,
  ) {
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
        // Default Approval Status search filter to Draft ("00")
        this._setApprovalStatusTokens(["00"]);

        var that = this;
        // Preload Initiator/Recipient Preparer name lookup data before the
        // first load, so the preview table's Preparer columns can show
        // names instead of raw UserIDs from the very first render.
        Promise.all([
          this._fetchCreatedByVHData(),
          this._fetchSearchRecipientPreparerVHData(),
        ]).then(function () {
          // Load all IC records on startup, filtered to the default Approval Status
          that._loadJournalEntries({
            approval_status_codes: that.getView().getModel().getProperty(
              "/search/approval_status_codes",
            ),
          });
        });
      },


      /// status field converting code to display in initial screen
      formatApprovalStatus: function (sCode) {
    var mStatus = {
        "0": "Draft",
        "1": "InApproval",
        "2": "Approved 2 parties",
        "3": "Document Posted",
        "4": "Rejected"
    };

    return mStatus[sCode] || sCode || "-";
},

      // Initiator Preparer column: shows the person's name instead of the
      // raw UserID stored in `createdby`. Falls back to the raw ID when no
      // match is found (e.g. a technical/communication user id that isn't
      // part of the I_BusinessUserBasic master data).
      formatCreatedByName: function (sUserId) {
        return this._getCreatedByText(sUserId) || "-";
      },

      // Recipient Preparer column: same name-lookup pattern as Initiator
      // Preparer above, against the search Recipient Preparer VH data.
      formatRecipientPreparerName: function (sUserId) {
        return this._getRecipientPreparerText(sUserId) || "-";
      },

      _fetchAllPages: function (sInitialUrl) {
        var sServiceRoot =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
        var aAllResults = [];

        function fetchPage(sUrl) {
          return fetch(sUrl, {
            method: "GET",
            headers: { Accept: "application/json" },
          })
            .then(function (oResponse) {
              if (!oResponse.ok) {
                return oResponse.json()
                  .catch(function () { return null; })
                  .then(function (oErrBody) {
                    var sMsg = "HTTP " + oResponse.status + " " + oResponse.statusText;
                    if (oErrBody && oErrBody.error) {
                      var sSapMsg = oErrBody.error.message ||
                        (oErrBody.error.innererror && oErrBody.error.innererror.message);
                      if (sSapMsg) { sMsg += "\n" + sSapMsg; }
                    }
                    var oErr = new Error(sMsg);
                    oErr.httpStatus = oResponse.status;
                    throw oErr;
                  });
              }
              return oResponse.json();
            })
            .then(function (oData) {
              aAllResults = aAllResults.concat(oData.value || []);
              var sNextLink = oData["@odata.nextLink"];
              if (sNextLink) {
                var sNextUrl =
                  sNextLink.indexOf("http") === 0 ||
                  sNextLink.indexOf("/") === 0
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

        oModel.setProperty("/appState/isBusy", true);

        var sUrl =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/" +
          "ZC_INTERCO_JE_HEADER";

        var aParams = [];

        aParams.push(
          "$select=" +
            [
              "accountingdocument_temp",
              "accountingdocumenttype",
              "documentreferenceid",
              "documentheadertext",
              "in_companycode",
              "rec_companycode",
              "documentdate",
              "postingdate",
              "taxcode",
              "tax_amount",
              "amount",
              "currencycode",
              "in_accountingdocument",
              "rec_accountingdocument",
              "createdby",
              "rec_preparer",
              "IsActiveEntity",
              "approval_status"

            ].join(","),
        );

        if (oFilters) {
          var aFilterParts = [];

          if (oFilters.in_companycode) {
            aFilterParts.push(
              "in_companycode eq '" +
                encodeURIComponent(oFilters.in_companycode).replace(
                  /%20/g,
                  " ",
                ) +
                "'",
            );
          }

          if (oFilters.rec_companycode) {
            aFilterParts.push(
              "rec_companycode eq '" +
                encodeURIComponent(oFilters.rec_companycode).replace(
                  /%20/g,
                  " ",
                ) +
                "'",
            );
          }

          if (oFilters.in_accountingdocument) {
            aFilterParts.push(
              "in_accountingdocument eq '" +
                encodeURIComponent(oFilters.in_accountingdocument).replace(
                  /%20/g,
                  " ",
                ) +
                "'",
            );
          }

          if (oFilters.rec_accountingdocument) {
            aFilterParts.push(
              "rec_accountingdocument eq '" +
                encodeURIComponent(oFilters.rec_accountingdocument).replace(
                  /%20/g,
                  " ",
                ) +
                "'",
            );
          }

          if (oFilters.createdby && oFilters.createdby.length) {
            var aCreatedByFilterParts = oFilters.createdby.map(
              function (sUserId) {
                return (
                  "createdby eq '" +
                  encodeURIComponent(sUserId).replace(/%20/g, " ") +
                  "'"
                );
              },
            );
            aFilterParts.push(
              aCreatedByFilterParts.length > 1
                ? "(" + aCreatedByFilterParts.join(" or ") + ")"
                : aCreatedByFilterParts[0],
            );
          }

          if (oFilters.rec_preparer && oFilters.rec_preparer.length) {
            var aRecPreparerFilterParts = oFilters.rec_preparer.map(
              function (sUserId) {
                return (
                  "rec_preparer eq '" +
                  encodeURIComponent(sUserId).replace(/%20/g, " ") +
                  "'"
                );
              },
            );
            aFilterParts.push(
              aRecPreparerFilterParts.length > 1
                ? "(" + aRecPreparerFilterParts.join(" or ") + ")"
                : aRecPreparerFilterParts[0],
            );
          }

          if (oFilters.approval_status_codes && oFilters.approval_status_codes.length) {
            var aStatusFilterParts = oFilters.approval_status_codes.map(
              function (sCode) {
                return (
                  "approval_status eq '" +
                  encodeURIComponent(sCode).replace(/%20/g, " ") +
                  "'"
                );
              },
            );
            aFilterParts.push(
              aStatusFilterParts.length > 1
                ? "(" + aStatusFilterParts.join(" or ") + ")"
                : aStatusFilterParts[0],
            );
          }

          if (aFilterParts.length > 0) {
            aParams.push("$filter=" + aFilterParts.join(" and "));
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

            oModel.setProperty(
              "/referenceData/searchInitiatorCCOptions",
              aInitiatorOptions,
            );
            oModel.setProperty(
              "/referenceData/searchRecipientCCOptions",
              aRecipientOptions,
            );

          


                    // Deduplicate by accountingdocument_temp
        var mSeen = {};
        var aUnique = aResults.filter(function (oRow) {
            var sKey = oRow.accountingdocument_temp;
            if (mSeen[sKey]) { return false; }
            mSeen[sKey] = true;
            return true;
        });

        console.log("Journal Entries loaded:", aResults.length, "total (" + (aResults.length - aUnique.length) + " duplicates removed)");

        oModel.setProperty("/allSearchResults", aUnique);
        oModel.setProperty("/searchResults", aUnique);
        
        console.log("allSearchResults:::",aUnique)

        console.log("SERACH RESULT:::",aUnique)
        
        oModel.setProperty("/searchResultCount", aUnique.length);

        oModel.setProperty("/appState/isBusy", false);
        // var mSeen = {};
        // var aUnique = aResults.filter(function (oRow) {
        //     var sKey = oRow.accountingdocument_temp;
        //     if (mSeen[sKey]) { return false; }
        //     mSeen[sKey] = true;
        //     return true;
        // });

        //     console.log(
        //       "Journal Entries loaded:",
        //       aResults.length,
        //       "total records",
        //     );

        //     oModel.setProperty("/allSearchResults", aResults);
        //     oModel.setProperty("/searchResults", aResults);
        //     oModel.setProperty("/searchResultCount", aResults.length);
          })
          .catch(function (oError) {
            console.error("Error loading Journal Entries:", oError);

            oModel.setProperty("/allSearchResults", []);
            oModel.setProperty("/searchResults", []);
            oModel.setProperty("/searchResultCount", 0);

            oModel.setProperty("/appState/isBusy", false);

            sap.m.MessageToast.show("Unable to load Journal Entries.");
          });
      },

      _loadReferenceData: function () {
        var oModel = this.getView().getModel();
        var that = this;
        // Fetch details for the default initiator CC on startup (targeted single-CC call)
        var sDefaultCC =
          oModel.getProperty("/headerData/initiatorCC") ||
          Constants.DEFAULT.INITIATOR_CC;
        MasterDataService.getCompanyCodeDetails(sDefaultCC)
          .then(function (oCC) {
            if (oCC) {
              oModel.setProperty("/headerData/initiatorCCName", oCC.name);
              oModel.setProperty("/headerData/initiatorCountry", oCC.country);
              if (oCC.country) {
                MasterDataService.getTaxCodesByCountry(oCC.country).then(
                  function (aCodes) {
                    var aInitiatorCodes = aCodes.filter(function (oCode) {
                      return oCode.taxType === "A";
                    });
                    oModel.setProperty(
                      "/referenceData/initiatorTaxCodes",
                      aInitiatorCodes,
                    );
                  },
                );
              }
            }
            that._loadUserDefaultCC();
          })
          .catch(function () {
            that._loadUserDefaultCC();
          });
        MasterDataService.getClosedPeriods().then(function (aPeriods) {
          oModel.setProperty("/referenceData/closedPeriods", aPeriods);
        });

        // Populate Document Type dropdown from service; fall back to known types if API is empty
        var aFallbackTypes = [
          { documentType: Constants.DOCUMENT_TYPE.IC, description: "" },
          { documentType: Constants.DOCUMENT_TYPE.IA, description: "" },
        ];
        MasterDataService.getDocumentTypes()
          .then(function (aTypes) {
            oModel.setProperty(
              "/referenceData/documentTypes",
              aTypes && aTypes.length ? aTypes : aFallbackTypes,
            );
          })
          .catch(function () {
            oModel.setProperty("/referenceData/documentTypes", aFallbackTypes);
          });
      },

      _initModel: function () {
        _rowCounter = 1;

        // Re-initializing the form model means any previously-tracked draft
        // is no longer relevant (Reset Form / Delete Draft / app startup) —
        // turn off change-detection so it can't misfire against a stale
        // baseline once a new/different document is loaded.
        this._bDraftDirtyTrackingActive = false;

        var oData = {
          submitComment: "",
          postComment: "",
          search: {
            in_companycode: "",
            rec_companycode: "",
            in_accountingdocument: "",
            rec_accountingdocument: "",
            createdby: [],
            rec_preparer: [],
            approval_status_codes: ["00"],
            accountingDocumentTemp: "",
            inAccountingDocument: "",
            recAccountingDocument: "",
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
            recipientPreparer: "",
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
            initiatorCCState: "None",
            recipientBPState: "None",
            recipientCCState: "None",
            documentDateState: "None",
            postingDateState: "None",
            referenceState: "None",
            headerTextState: "None",
            netAmountState: "None",
            taxCalcVisible: false,
            taxCalcRows: [],
            initiatorTaxMismatchVisible: false,
            initiatorTaxMismatchText: "",
            recipientTaxMismatchVisible: false,
            recipientTaxMismatchText: "",

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
              lineRef3: "",
            },
          ],

          initiatorBalance: {
            totalDebits: "0.00",
            totalCredits: "0.00",
            netAmount: "0.00",
            isBalanced: false,
          },

          initiatorValidation: {
            visible: false,
            state: "None",
            text: "Not yet validated.",
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
              lineRef3: "",
            },
          ],

          recipientBalance: {
            totalDebits: "0.00",
            totalCredits: "0.00",
            netAmount: "0.00",
            isBalanced: false,
          },

          recipientValidation: {
            visible: false,
            state: "None",
            text: "Not yet validated.",
          },

          workflow: {
            status: Constants.WORKFLOW_STATUS.DRAFT,
            statusState: "Warning",
            intercoRef: "[NEW — assigned on save]",
            initiatorLineCount: 0,
          },

          appState: {
            isBusy: false,
            isEditMode: false,
            isHeaderEditable: false,
            isRecipientEditable: false,
          },

          referenceData: {
            companyCodes: [],
            taxCodes: [],
            allTaxCodes: [],
            initiatorTaxCodes: [],
            recipientTaxCodes: [],
            closedPeriods: [],
            documentTypes: [],
            glAccounts: [],
            profitCenters: [],
            costCenters: [],
            searchInitiatorCCOptions: [],
            searchRecipientCCOptions: [],
            initiatorCCVHData: [],
            recipientCCVHData: [],
            createdbyVHData: [],
            approvalStatusVHData: [],
            recipientPreparerVHData: [],
            searchRecipientPreparerVHData: [],
          },

          selectedEntry: {},
          jeItems: [],
          jeItemCount: 0,
        };

        var oModel = new JSONModel(oData);
        oModel.setSizeLimit(500);
        this.getView().setModel(oModel);
      },

      // ─────────────────────────────────────────────────────────────────────
      // Transaction Control
      // ─────────────────────────────────────────────────────────────────────

      onTransactionTypeChange: function (oEvent) {
        var oModel = this.getView().getModel();
        var iIdx = oEvent.getParameter("selectedIndex");

        // index 0 -> AR (IC Invoice), index 1 -> ACCRUAL (IC Accrual Journal)
        var sTxType = [
          Constants.TRANSACTION_TYPE.AR,
          Constants.TRANSACTION_TYPE.ACCRUAL,
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
        var sCode =
          iIdx === 0 ? Constants.DOCUMENT_TYPE.IC : Constants.DOCUMENT_TYPE.IA;

        oModel.setProperty("/headerData/documentTypeCode", sCode);
        oModel.setProperty(
          "/headerData/documentType",
          this.getI18nText("documentType." + sCode),
        );
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
        if (!sUserId) {
          return;
        }

        jQuery.ajax({
          url:
            "/sap/opu/odata/sap/CA_USRAPIV2_SRV/PersonalSettingCollection" +
            "?$filter=Id eq 'BUK'&$format=json",
          method: "GET",
          success: function (oData) {
            var aResults = oData && oData.d && oData.d.results;
            var sCC = aResults && aResults[0] && aResults[0].Value;
            if (!sCC) {
              return;
            }

            sCC = sCC.trim().toUpperCase();
            oModel.setProperty("/headerData/initiatorCC", sCC);
            MasterDataService.getCompanyCodeDetails(sCC)
              .then(function (oCC) {
                oModel.setProperty(
                  "/headerData/initiatorCCName",
                  oCC ? oCC.name : "— Unknown company code",
                );
                oModel.setProperty(
                  "/headerData/initiatorCountry",
                  oCC ? oCC.country : "—",
                );
                if (oCC && oCC.country) {
                  MasterDataService.getTaxCodesByCountry(oCC.country).then(
                    function (aCodes) {
                      var aInitiatorCodes = aCodes.filter(function (oCode) {
                        return oCode.taxType === "A";
                      });
                      oModel.setProperty(
                        "/referenceData/initiatorTaxCodes",
                        aInitiatorCodes,
                      );
                    },
                  );
                }
              })
              .catch(function () {
                oModel.setProperty(
                  "/headerData/initiatorCCName",
                  "— Unknown company code",
                );
                oModel.setProperty("/headerData/initiatorCountry", "—");
              });
          }.bind(this),
        });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Party Details
      // ─────────────────────────────────────────────────────────────────────

      onInitiatorCCChange: function () {
        var oModel = this.getView().getModel();
        var that = this;
        var sCC = (oModel.getProperty("/headerData/initiatorCC") || "")
          .trim()
          .toUpperCase();
        oModel.setProperty("/headerData/initiatorCC", sCC);
        oModel.setProperty("/headerData/initiatorCCName", sCC ? "..." : "");
        oModel.setProperty("/headerData/initiatorCountry", "");
        oModel.setProperty("/headerData/initiatorTaxCode", "");
        oModel.setProperty("/referenceData/initiatorTaxCodes", []);
        oModel.setProperty("/headerData/initiatorBP", "");
        oModel.setProperty("/headerData/recipientBP", "");
        oModel.setProperty("/headerData/recipientBPName", "");
        oModel.setProperty("/headerData/partyValidationVisible", false);
        if (sCC) {
          oModel.setProperty("/headerData/initiatorCCState", "None");
        }

        this._propagateTradingPartner();
        this._propagateRecipientTradingPartner();
        this._syncBPClearingLine();
        this._syncRecipientBPClearingLine();
        this._validateParties();

        if (!sCC) {
          return;
        }

        MasterDataService.getCompanyCodeDetails(sCC)
          .then(function (oCC) {
            oModel.setProperty(
              "/headerData/initiatorCCName",
              oCC ? oCC.name : "— Unknown company code",
            );
            oModel.setProperty(
              "/headerData/initiatorCountry",
              oCC ? oCC.country : "—",
            );

            if (oCC && oCC.country) {
              MasterDataService.getTaxCodesByCountry(oCC.country).then(
                function (aCodes) {
                  var aInitiatorCodes = aCodes.filter(function (oCode) {
                    return oCode.taxType === "A";
                  });
                  oModel.setProperty(
                    "/referenceData/initiatorTaxCodes",
                    aInitiatorCodes,
                  );
                },
              );
            }

            var sRecCC = (oModel.getProperty("/headerData/recipientCC") || "")
              .trim()
              .toUpperCase();
            if (sRecCC) {
              that._autoDeriveBPs(sRecCC, sCC);
            }
          })
          .catch(function () {
            oModel.setProperty(
              "/headerData/initiatorCCName",
              "— Unknown company code",
            );
            oModel.setProperty("/headerData/initiatorCountry", "—");
          });
      },

      onRecipientCCChange: function () {
        var oModel = this.getView().getModel();
        var that = this;
        var sCC = (oModel.getProperty("/headerData/recipientCC") || "")
          .trim()
          .toUpperCase();
        oModel.setProperty("/headerData/recipientCC", sCC);
        oModel.setProperty("/headerData/recipientCCName", sCC ? "..." : "");
        oModel.setProperty("/headerData/recipientCountry", "");
        oModel.setProperty("/headerData/recipientTaxCode", "");
        oModel.setProperty("/referenceData/recipientTaxCodes", []);
        oModel.setProperty("/headerData/recipientBP", "");
        oModel.setProperty("/headerData/recipientBPName", "");
        oModel.setProperty("/headerData/initiatorBP", "");
        this._propagateTradingPartner();
        this._validateParties();

        if (!sCC) {
          return;
        }

        MasterDataService.getCompanyCodeDetails(sCC)
          .then(function (oCC) {
            oModel.setProperty(
              "/headerData/recipientCCName",
              oCC ? oCC.name : "— Unknown company code",
            );
            oModel.setProperty(
              "/headerData/recipientCountry",
              oCC ? oCC.country : "—",
            );

            if (oCC && oCC.country) {
              MasterDataService.getTaxCodesByCountry(oCC.country).then(
                function (aCodes) {
                  var aRecipientCodes = aCodes.filter(function (oCode) {
                    return oCode.taxType === "V";
                  });
                  oModel.setProperty(
                    "/referenceData/recipientTaxCodes",
                    aRecipientCodes,
                  );
                },
              );
            }

            var sIniCC = (oModel.getProperty("/headerData/initiatorCC") || "")
              .trim()
              .toUpperCase();
            if (sIniCC) {
              that._autoDeriveBPs(sCC, sIniCC);
            }
          })
          .catch(function () {
            oModel.setProperty(
              "/headerData/recipientCCName",
              "— Unknown company code",
            );
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
          oModel.setProperty(
            "/headerData/recipientCountry",
            "— (derived from Recipient BP)",
          );
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
              MessageToast.show(
                "No intercompany relationship found for Business Partner: " +
                  sBP,
              );
              return;
            }
            var oRel = aResults[0];
            var sRecCC = oRel.receiverCC;

            oModel.setProperty("/headerData/recipientCC", sRecCC);
            oModel.setProperty("/headerData/recipientCCName", sRecCC);
            oModel.setProperty("/headerData/recipientCountry", "");
            oModel.setProperty("/headerData/recipientTaxCode", "");
            oModel.setProperty("/referenceData/recipientTaxCodes", []);

            // Fetch CC name and country for the derived recipient CC
            MasterDataService.getCompanyCodeDetails(sRecCC)
              .then(function (oCC) {
                oModel.setProperty(
                  "/headerData/recipientCCName",
                  oCC ? oCC.name : sRecCC,
                );
                oModel.setProperty(
                  "/headerData/recipientCountry",
                  oCC ? oCC.country : "—",
                );
                if (oCC && oCC.country) {
                  MasterDataService.getTaxCodesByCountry(oCC.country).then(
                    function (aCodes) {
                      var aRecipientCodes = aCodes.filter(function (oCode) {
                        return oCode.taxType === "V";
                      });
                      oModel.setProperty(
                        "/referenceData/recipientTaxCodes",
                        aRecipientCodes,
                      );
                    },
                  );
                }
              })
              .catch(function () {
                oModel.setProperty("/headerData/recipientCCName", sRecCC);
                oModel.setProperty("/headerData/recipientCountry", "—");
              });

            var sIniCC = (
              oModel.getProperty("/headerData/initiatorCC") || ""
            ).trim();
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
        var sIniCC = (
          oModel.getProperty("/headerData/initiatorCC") || ""
        ).trim();
        var oView = this.getView();
        var that = this;

        oModel.setProperty("/appState/isBusy", true);

        var oParams = sIniCC ? { senderCC: sIniCC } : {};

        MasterDataService.getICT001URelationship(oParams)
          .then(function (aResults) {
            oModel.setProperty("/appState/isBusy", false);

            if (!aResults.length) {
              MessageToast.show(
                "No intercompany business partners found" +
                  (sIniCC ? " for initiator " + sIniCC : "") +
                  ".",
              );
              return;
            }

            // Use CC code as the info column (name fetched when CC is confirmed)
            aResults.forEach(function (oRel) {
              oRel.receiverCCName = oRel.receiverCC;
            });
            oModel.setProperty("/referenceData/bpRelationships", aResults);

            if (!that._pBPDialog) {
              that._pBPDialog = Fragment.load({
                id: oView.getId() + "--bp",
                name: "ZFI_INTERCO.fragment.BPPicklist",
                controller: that,
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
        var sQuery = oEvent.getParameter("value");
        var oBinding = oEvent.getParameter("itemsBinding");
        if (!sQuery) {
          oBinding.filter([]);
          return;
        }
        oBinding.filter([
          new Filter({
            filters: [
              new Filter("bpForDebit", FilterOperator.Contains, sQuery),
              new Filter("senderCC", FilterOperator.Contains, sQuery),
              new Filter("receiverCC", FilterOperator.Contains, sQuery),
              new Filter("receiverCCName", FilterOperator.Contains, sQuery),
            ],
            and: false,
          }),
        ]);
      },

      onBPPicklistConfirm: function (oEvent) {
        var oSelected = oEvent.getParameter("selectedItem");
        if (!oSelected) {
          return;
        }
        var oRel = oSelected.getBindingContext().getObject();
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
          MasterDataService.getICT001URelationship({
            senderCC: sIniCC,
            receiverCC: sRecCC,
          }),
          MasterDataService.getICT001URelationship({
            senderCC: sRecCC,
            receiverCC: sIniCC,
          }),
        ])
          .then(function (aResults) {
            var aForward = aResults[0]; // IniCC as sender → BPforDebit = recipientBP
            var aReverse = aResults[1]; // RecCC as sender → BPforDebit = initiatorBP

            if (!aForward.length) {
              oModel.setProperty("/appState/isBusy", false);
              MessageToast.show(
                "No intercompany relationship found between " +
                  sIniCC +
                  " and " +
                  sRecCC +
                  ".",
              );
              return;
            }

            var sRecipientBP =
              aForward[0].bpForDebit || aForward[0].bpForCredit;
            var sInitiatorBP = aReverse.length
              ? aReverse[0].bpForDebit || aReverse[0].bpForCredit
              : "—";

            oModel.setProperty("/headerData/recipientBP", sRecipientBP);
            oModel.setProperty("/headerData/initiatorBP", sInitiatorBP);

            var fnFinalize = function () {
              oModel.setProperty("/appState/isBusy", false);
              that._validateParties();
              that._syncBPClearingLine();
              that._propagateTradingPartner();
              that._syncRecipientBPClearingLine();
              that._propagateRecipientTradingPartner();
            };

            var pSupplier = MasterDataService.getReconciliationAccount(
              sRecCC,
              sRecipientBP,
            ).catch(function () {
              return null;
            });
            var pCustomer = MasterDataService.getReconciliationAccountCustomer(
              sIniCC,
              sInitiatorBP,
            ).catch(function () {
              return null;
            });

            Promise.all([pSupplier, pCustomer]).then(function (aReconResults) {
              oModel.setProperty(
                "/headerData/reconciliationAccount",
                aReconResults[0]
                  ? aReconResults[0].reconciliationAccount
                  : sRecipientBP,
              );
              oModel.setProperty(
                "/headerData/recipientReconciliationAccount",
                aReconResults[1]
                  ? aReconResults[1].reconciliationAccount
                  : sInitiatorBP,
              );
              fnFinalize();
            });
          })
          .catch(function () {
            oModel.setProperty("/appState/isBusy", false);
            MessageToast.show(
              "Failed to derive intercompany business partners.",
            );
          });
      },

      // ─── Search Screen Company Code Value Help ─────────────────────

      _fetchCCVHData: function (sTarget) {
        var oModel = this.getView().getModel();
        var sBaseUrl =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/" +
          "ZC_INTERCO_JE_HEADER";

        var aSelect =
          sTarget === "initiator"
            ? [
                "accountingdocument_temp",
                "in_companycode",
                "in_accountingdocument",
              ]
            : [
                "accountingdocument_temp",
                "rec_companycode",
                "rec_accountingdocument",
              ];

        var sUrl = sBaseUrl + "?$select=" + aSelect.join(",");

        var that = this;
        return that
          ._fetchAllPages(sUrl)
          .then(function (aResults) {
            var sPath =
              sTarget === "initiator"
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
            controller: that,
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
            controller: that,
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
          "searchInitiatorCCTable",
        );
        if (!oTable) {
          return;
        }

        var oBinding = oTable.getBinding("items");
        if (sQuery) {
          oBinding.filter([
            new Filter({
              filters: [
                new Filter(
                  "accountingdocument_temp",
                  FilterOperator.Contains,
                  sQuery,
                ),
                new Filter("in_companycode", FilterOperator.Contains, sQuery),
                new Filter(
                  "in_accountingdocument",
                  FilterOperator.Contains,
                  sQuery,
                ),
              ],
              and: false,
            }),
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
          "searchInitiatorCCTable",
        );
        if (oTable) {
          oTable.getBinding("items").filter([]);
        }

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
          "searchRecipientCCTable",
        );
        if (!oTable) {
          return;
        }

        var oBinding = oTable.getBinding("items");
        if (sQuery) {
          oBinding.filter([
            new Filter({
              filters: [
                new Filter(
                  "accountingdocument_temp",
                  FilterOperator.Contains,
                  sQuery,
                ),
                new Filter("rec_companycode", FilterOperator.Contains, sQuery),
                new Filter(
                  "rec_accountingdocument",
                  FilterOperator.Contains,
                  sQuery,
                ),
              ],
              and: false,
            }),
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
          "searchRecipientCCTable",
        );
        if (oTable) {
          oTable.getBinding("items").filter([]);
        }

        this._pSearchRecipientCCDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      onSearchRecipientCCCancel: function () {
        this._pSearchRecipientCCDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      // ─── Created By Value Help ────────────────────────────────────────────

      _fetchCreatedByVHData: function () {
        var oModel = this.getView().getModel();
        var sUrl =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/" +
          "I_BusinessUserBasic?$select=BusinessPartner,UserID,PersonFullName" +
          "&$orderby=PersonFullName";

        return this._fetchAllPages(sUrl)
          .then(function (aResults) {
            oModel.setProperty("/referenceData/createdbyVHData", aResults);
          })
          .catch(function (oError) {
            console.error("Created By VH data fetch error:", oError);
            sap.m.MessageToast.show("Failed to load Created By value help data.");
          });
      },

      // Text lookup used to label tokens and the preview table column.
      // Falls back to the raw UserID when there's no match (e.g. VH data
      // not loaded yet, or a technical/communication user id that isn't
      // part of the I_BusinessUserBasic master data).
      _getCreatedByText: function (sUserId) {
        if (!sUserId) { return ""; }
        var aVHData =
          this.getView().getModel().getProperty(
            "/referenceData/createdbyVHData",
          ) || [];
        var oMatch = aVHData.find(function (oRow) {
          return oRow.UserID === sUserId;
        });
        return oMatch ? oMatch.PersonFullName : sUserId;
      },

      // Single source of truth for the Initiator Preparer selection:
      // updates the internal UserID array used for filtering AND rebuilds
      // the MultiInput's tokens (name-only, per requirement) to match.
      _setCreatedByTokens: function (aUserIds) {
        var oModel = this.getView().getModel();
        var that = this;

        oModel.setProperty("/search/createdby", aUserIds.slice());

        var oMultiInput = this.getView().byId("searchCreatedBy");
        if (!oMultiInput) { return; }

        oMultiInput.removeAllTokens();
        aUserIds.forEach(function (sUserId) {
          oMultiInput.addToken(
            new Token({
              key: sUserId,
              text: that._getCreatedByText(sUserId),
            }),
          );
        });
      },

      onSearchCreatedByValueHelp: function () {
        var oView = this.getView();
        var that = this;

        if (!this._pSearchCreatedByDialog) {
          this._pSearchCreatedByDialog = Fragment.load({
            id: oView.getId() + "--searchCreatedBy",
            name: "ZFI_INTERCO.fragment.SearchCreatedBy",
            controller: that,
          }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
          });
        }

        this._fetchCreatedByVHData().then(function () {
          that._pSearchCreatedByDialog.then(function (oDialog) {
            // Pre-select whatever is already chosen so re-opening the
            // dialog to add/remove people reflects the current tokens.
            var aSelectedIds =
              oView.getModel().getProperty("/search/createdby") || [];
            var oTable = Fragment.byId(
              oView.getId() + "--searchCreatedBy",
              "searchCreatedByTable",
            );
            if (oTable) {
              oTable.getItems().forEach(function (oItem) {
                var oContext = oItem.getBindingContext();
                var bSelected =
                  oContext &&
                  aSelectedIds.indexOf(oContext.getProperty("UserID")) !== -1;
                oItem.setSelected(!!bSelected);
              });
            }
            oDialog.open();
          });
        });
      },

      onSearchCreatedByFilter: function (oEvent) {
        var sQuery = (
          oEvent.getParameter("query") ||
          oEvent.getParameter("newValue") ||
          ""
        ).trim();

        var oTable = Fragment.byId(
          this.getView().getId() + "--searchCreatedBy",
          "searchCreatedByTable",
        );
        if (!oTable) { return; }

        var oBinding = oTable.getBinding("items");
        if (sQuery) {
          oBinding.filter([
            new Filter({
              filters: [
                new Filter("UserID", FilterOperator.Contains, sQuery),
                new Filter("PersonFullName", FilterOperator.Contains, sQuery),
              ],
              and: false,
            }),
          ]);
        } else {
          oBinding.filter([]);
        }
      },

      onSearchCreatedByConfirm: function () {
        var oTable = Fragment.byId(
          this.getView().getId() + "--searchCreatedBy",
          "searchCreatedByTable",
        );

        var aUserIds = oTable
          ? oTable.getSelectedContexts().map(function (oContext) {
              return oContext.getProperty("UserID");
            })
          : [];

        this._setCreatedByTokens(aUserIds);

        if (oTable) {
          oTable.getBinding("items").filter([]);
        }

        this._pSearchCreatedByDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      onSearchCreatedByCancel: function () {
        this._pSearchCreatedByDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      // Tokens are only ever added via the Value Help (onSearchCreatedByConfirm) —
      // free-typed tokens have no known UserID, so block that path and only
      // allow removal (the "x" on a token) to keep the internal id array in
      // sync with what's actually displayed.
      onSearchCreatedByTokenUpdate: function (oEvent) {
        if (oEvent.getParameter("type") !== "removed") {
          oEvent.preventDefault();
          return;
        }

        var aRemovedKeys = oEvent.getParameter("removedTokens").map(
          function (oToken) {
            return oToken.getKey();
          },
        );

        var aRemaining = (
          this.getView().getModel().getProperty("/search/createdby") || []
        ).filter(function (sUserId) {
          return aRemovedKeys.indexOf(sUserId) === -1;
        });

        this._setCreatedByTokens(aRemaining);
      },

      // ─── Recipient Preparer Value Help (Initial/Search screen) ─────────────
      // Same I_BusinessUserBasic source and 3-column pattern as the
      // Initiator Preparer search picker above.

      _fetchSearchRecipientPreparerVHData: function () {
        var oModel = this.getView().getModel();
        var sUrl =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/" +
          "I_BusinessUserBasic?$select=BusinessPartner,UserID,PersonFullName" +
          "&$orderby=PersonFullName";

        return this._fetchAllPages(sUrl)
          .then(function (aResults) {
            oModel.setProperty(
              "/referenceData/searchRecipientPreparerVHData",
              aResults,
            );
          })
          .catch(function (oError) {
            console.error(
              "Recipient Preparer VH data fetch error:",
              oError,
            );
            sap.m.MessageToast.show(
              "Failed to load Recipient Preparer value help data.",
            );
          });
      },

      // Text lookup used to label tokens and the preview table column.
      // Falls back to the raw UserID when there's no match (e.g. VH data
      // not loaded yet, or a technical/communication user id that isn't
      // part of the I_BusinessUserBasic master data).
      _getRecipientPreparerText: function (sUserId) {
        if (!sUserId) { return ""; }
        var aVHData =
          this.getView().getModel().getProperty(
            "/referenceData/searchRecipientPreparerVHData",
          ) || [];
        var oMatch = aVHData.find(function (oRow) {
          return oRow.UserID === sUserId;
        });
        return oMatch ? oMatch.PersonFullName : sUserId;
      },

      // Single source of truth for the Recipient Preparer selection:
      // updates the internal UserID array used for filtering AND rebuilds
      // the MultiInput's tokens (name-only, per requirement) to match.
      _setRecipientPreparerTokens: function (aUserIds) {
        var oModel = this.getView().getModel();
        var that = this;

        oModel.setProperty("/search/rec_preparer", aUserIds.slice());

        var oMultiInput = this.getView().byId("searchRecipientPreparer");
        if (!oMultiInput) { return; }

        oMultiInput.removeAllTokens();
        aUserIds.forEach(function (sUserId) {
          oMultiInput.addToken(
            new Token({
              key: sUserId,
              text: that._getRecipientPreparerText(sUserId),
            }),
          );
        });
      },

      onSearchRecipientPreparerValueHelp: function () {
        var oView = this.getView();
        var that = this;

        if (!this._pSearchRecipientPreparerDialog) {
          this._pSearchRecipientPreparerDialog = Fragment.load({
            id: oView.getId() + "--searchRecipientPreparer",
            name: "ZFI_INTERCO.fragment.SearchRecipientPreparer",
            controller: that,
          }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
          });
        }

        this._fetchSearchRecipientPreparerVHData().then(function () {
          that._pSearchRecipientPreparerDialog.then(function (oDialog) {
            // Pre-select whatever is already chosen so re-opening the
            // dialog to add/remove people reflects the current tokens.
            var aSelectedIds =
              oView.getModel().getProperty("/search/rec_preparer") || [];
            var oTable = Fragment.byId(
              oView.getId() + "--searchRecipientPreparer",
              "searchRecipientPreparerTable",
            );
            if (oTable) {
              oTable.getItems().forEach(function (oItem) {
                var oContext = oItem.getBindingContext();
                var bSelected =
                  oContext &&
                  aSelectedIds.indexOf(oContext.getProperty("UserID")) !== -1;
                oItem.setSelected(!!bSelected);
              });
            }
            oDialog.open();
          });
        });
      },

      onSearchRecipientPreparerFilter: function (oEvent) {
        var sQuery = (
          oEvent.getParameter("query") ||
          oEvent.getParameter("newValue") ||
          ""
        ).trim();

        var oTable = Fragment.byId(
          this.getView().getId() + "--searchRecipientPreparer",
          "searchRecipientPreparerTable",
        );
        if (!oTable) { return; }

        var oBinding = oTable.getBinding("items");
        if (sQuery) {
          oBinding.filter([
            new Filter({
              filters: [
                new Filter("UserID", FilterOperator.Contains, sQuery),
                new Filter("PersonFullName", FilterOperator.Contains, sQuery),
              ],
              and: false,
            }),
          ]);
        } else {
          oBinding.filter([]);
        }
      },

      onSearchRecipientPreparerConfirm: function () {
        var oTable = Fragment.byId(
          this.getView().getId() + "--searchRecipientPreparer",
          "searchRecipientPreparerTable",
        );

        var aUserIds = oTable
          ? oTable.getSelectedContexts().map(function (oContext) {
              return oContext.getProperty("UserID");
            })
          : [];

        this._setRecipientPreparerTokens(aUserIds);

        if (oTable) {
          oTable.getBinding("items").filter([]);
        }

        this._pSearchRecipientPreparerDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      onSearchRecipientPreparerCancel: function () {
        this._pSearchRecipientPreparerDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      // Tokens are only ever added via the Value Help
      // (onSearchRecipientPreparerConfirm) — free-typed tokens have no
      // known UserID, so block that path and only allow removal (the "x"
      // on a token) to keep the internal id array in sync with what's
      // actually displayed.
      onSearchRecipientPreparerTokenUpdate: function (oEvent) {
        if (oEvent.getParameter("type") !== "removed") {
          oEvent.preventDefault();
          return;
        }

        var aRemovedKeys = oEvent.getParameter("removedTokens").map(
          function (oToken) {
            return oToken.getKey();
          },
        );

        var aRemaining = (
          this.getView().getModel().getProperty("/search/rec_preparer") || []
        ).filter(function (sUserId) {
          return aRemovedKeys.indexOf(sUserId) === -1;
        });

        this._setRecipientPreparerTokens(aRemaining);
      },

      // ─── Recipient Preparer Value Help (Document entry — Recipient block) ──
      // Reuses the same I_BusinessUserBasic API as the Initiator Preparer
      // search-screen picker (_fetchCreatedByVHData) since both pick a
      // business user; swap the URL here if a dedicated API is provided.

      _fetchRecipientPreparerVHData: function () {
        var oModel = this.getView().getModel();
        var sUrl =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/" +
          "I_BusinessUserBasic?$select=BusinessPartner,UserID,PersonFullName" +
          "&$orderby=PersonFullName";

        return this._fetchAllPages(sUrl)
          .then(function (aResults) {
            oModel.setProperty("/referenceData/recipientPreparerVHData", aResults);
          })
          .catch(function (oError) {
            console.error("Recipient Preparer VH data fetch error:", oError);
            sap.m.MessageToast.show(
              "Failed to load Recipient Preparer value help data.",
            );
          });
      },

      onRecipientPreparerValueHelp: function () {
        var oView = this.getView();
        var that = this;

        if (!this._pRecipientPreparerDialog) {
          this._pRecipientPreparerDialog = Fragment.load({
            id: oView.getId() + "--recipientPreparer",
            name: "ZFI_INTERCO.fragment.RecipientPreparerValueHelp",
            controller: that,
          }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
          });
        }

        this._fetchRecipientPreparerVHData();

        this._pRecipientPreparerDialog.then(function (oDialog) {
          oDialog.open();
        });
      },

      onRecipientPreparerFilter: function (oEvent) {
        var sQuery = (
          oEvent.getParameter("query") ||
          oEvent.getParameter("newValue") ||
          ""
        ).trim();

        var oTable = Fragment.byId(
          this.getView().getId() + "--recipientPreparer",
          "recipientPreparerTable",
        );
        if (!oTable) { return; }

        var oBinding = oTable.getBinding("items");
        if (sQuery) {
          oBinding.filter([
            new Filter({
              filters: [
                new Filter("BusinessPartner", FilterOperator.Contains, sQuery),
                new Filter("UserID", FilterOperator.Contains, sQuery),
                new Filter("PersonFullName", FilterOperator.Contains, sQuery),
              ],
              and: false,
            }),
          ]);
        } else {
          oBinding.filter([]);
        }
      },

      onRecipientPreparerSelect: function (oEvent) {
        var oContext = oEvent.getSource().getBindingContext();
        var sValue = oContext.getProperty("UserID");

        this.getView().getModel().setProperty("/headerData/recipientPreparer", sValue);

        var oTable = Fragment.byId(
          this.getView().getId() + "--recipientPreparer",
          "recipientPreparerTable",
        );
        if (oTable) {
          oTable.getBinding("items").filter([]);
        }

        this._pRecipientPreparerDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      onRecipientPreparerCancel: function () {
        this._pRecipientPreparerDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      // ─── Approval Status Value Help ────────────────────────────────────────

      _fetchApprovalStatusVHData: function () {
        var oModel = this.getView().getModel();
        var sUrl =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/" +
          "ZI_AprStatusVH";

        return this._fetchAllPages(sUrl)
          .then(function (aResults) {
            oModel.setProperty("/referenceData/approvalStatusVHData", aResults);
          })
          .catch(function (oError) {
            console.error("Approval Status VH data fetch error:", oError);
            sap.m.MessageToast.show(
              "Failed to load Approval Status value help data.",
            );
          });
      },

      // Text lookup used to label tokens. Falls back to the one code/text
      // pair the app defaults to on load ("00" → "Draft"), in case a token
      // needs to be drawn before the VH data has been fetched from
      // ZI_AprStatusVH (e.g. the initial default on app start).
      _getApprovalStatusText: function (sCode) {
        var aVHData =
          this.getView().getModel().getProperty(
            "/referenceData/approvalStatusVHData",
          ) || [];
        var oMatch = aVHData.find(function (oRow) {
          return oRow.AprCode === sCode;
        });
        if (oMatch) {
          return oMatch.Text;
        }
        return sCode === "00" ? "Draft" : sCode;
      },

      // Single source of truth for the Approval Status selection: updates
      // the internal code array used for filtering AND rebuilds the
      // MultiInput's tokens (description-only, per requirement) to match.
      _setApprovalStatusTokens: function (aCodes) {
        var oModel = this.getView().getModel();
        var that = this;

        oModel.setProperty("/search/approval_status_codes", aCodes.slice());

        var oMultiInput = this.getView().byId("searchApprovalStatus");
        if (!oMultiInput) { return; }

        oMultiInput.removeAllTokens();
        aCodes.forEach(function (sCode) {
          oMultiInput.addToken(
            new Token({
              key: sCode,
              text: that._getApprovalStatusText(sCode),
            }),
          );
        });
      },

      onSearchApprovalStatusValueHelp: function () {
        var oView = this.getView();
        var that = this;

        if (!this._pSearchApprovalStatusDialog) {
          this._pSearchApprovalStatusDialog = Fragment.load({
            id: oView.getId() + "--searchApprovalStatus",
            name: "ZFI_INTERCO.fragment.SearchApprovalStatus",
            controller: that,
          }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
          });
        }

        this._fetchApprovalStatusVHData().then(function () {
          that._pSearchApprovalStatusDialog.then(function (oDialog) {
            // Pre-select whatever is already chosen so re-opening the
            // dialog to add/remove statuses reflects the current tokens.
            var aSelectedCodes =
              oView.getModel().getProperty("/search/approval_status_codes") ||
              [];
            var oTable = Fragment.byId(
              oView.getId() + "--searchApprovalStatus",
              "searchApprovalStatusTable",
            );
            if (oTable) {
              oTable.getItems().forEach(function (oItem) {
                var oContext = oItem.getBindingContext();
                var bSelected =
                  oContext &&
                  aSelectedCodes.indexOf(oContext.getProperty("AprCode")) !== -1;
                oItem.setSelected(!!bSelected);
              });
            }
            oDialog.open();
          });
        });
      },

      onSearchApprovalStatusFilter: function (oEvent) {
        var sQuery = (
          oEvent.getParameter("query") ||
          oEvent.getParameter("newValue") ||
          ""
        ).trim();

        var oTable = Fragment.byId(
          this.getView().getId() + "--searchApprovalStatus",
          "searchApprovalStatusTable",
        );
        if (!oTable) { return; }

        var oBinding = oTable.getBinding("items");
        if (sQuery) {
          oBinding.filter([
            new Filter({
              filters: [
                new Filter("AprCode", FilterOperator.Contains, sQuery),
                new Filter("Text", FilterOperator.Contains, sQuery),
              ],
              and: false,
            }),
          ]);
        } else {
          oBinding.filter([]);
        }
      },

      onSearchApprovalStatusConfirm: function () {
        var oTable = Fragment.byId(
          this.getView().getId() + "--searchApprovalStatus",
          "searchApprovalStatusTable",
        );

        var aCodes = oTable
          ? oTable.getSelectedContexts().map(function (oContext) {
              return oContext.getProperty("AprCode");
            })
          : [];

        this._setApprovalStatusTokens(aCodes);

        if (oTable) {
          oTable.getBinding("items").filter([]);
        }

        this._pSearchApprovalStatusDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      onSearchApprovalStatusCancel: function () {
        this._pSearchApprovalStatusDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      // Tokens are only ever added via the Value Help (onSearchApprovalStatusConfirm) —
      // free-typed tokens have no known status code, so block that path and
      // only allow removal (the "x" on a token) to keep the internal code
      // array in sync with what's actually displayed.
      onSearchApprovalStatusTokenUpdate: function (oEvent) {
        if (oEvent.getParameter("type") !== "removed") {
          oEvent.preventDefault();
          return;
        }

        var aRemovedKeys = oEvent.getParameter("removedTokens").map(
          function (oToken) {
            return oToken.getKey();
          },
        );

        var aRemaining = (
          this.getView().getModel().getProperty("/search/approval_status_codes") ||
          []
        ).filter(function (sCode) {
          return aRemovedKeys.indexOf(sCode) === -1;
        });

        this._setApprovalStatusTokens(aRemaining);
      },

      // ─── Company Code Value Help ───────────────────────────────────────────

      onInitiatorCCValueHelp: function () {
        this._sCCPicklistMode = "initiator";
        var oModel = this.getView().getModel();
        var that = this;

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.getICT001URelationship({})
          .then(function (aRels) {
            var mSeen = {};
            var aOptions = [];
            aRels.forEach(function (r) {
              if (!mSeen[r.senderCC]) {
                mSeen[r.senderCC] = true;
                aOptions.push({
                  companyCode: r.senderCC,
                  name: r.senderCC,
                  country: "",
                });
              }
            });
            oModel.setProperty("/referenceData/initiatorCCOptions", aOptions);
            oModel.setProperty("/appState/isBusy", false);
            that._openCCPicklist();
          })
          .catch(function (oErr) {
            oModel.setProperty("/appState/isBusy", false);
            MessageBox.error(
              "Could not load company codes: " +
                (oErr && oErr.message ? oErr.message : String(oErr)),
            );
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
            controller: this,
          }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
          });
        }
        this._pCCDialog.then(function (oDialog) {
          oDialog.open();
        });
      },

      onCCPicklistSearch: function (oEvent) {
        var sQuery = oEvent.getParameter("value");
        var oBinding = oEvent.getParameter("itemsBinding");
        if (!sQuery) {
          oBinding.filter([]);
          return;
        }
        oBinding.filter([
          new Filter(
            [
              new Filter("companyCode", FilterOperator.Contains, sQuery),
              new Filter("name", FilterOperator.Contains, sQuery),
              new Filter("country", FilterOperator.Contains, sQuery),
            ],
            false,
          ),
        ]);
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
          oModel.setProperty("/search/in_companycode", sCompanyCode);

          return;
        }

        // =========================================================
        // SEARCH SCREEN - RECIPIENT COMPANY CODE
        // =========================================================
        if (this._sCCPicklistMode === "searchRecipient") {
          oModel.setProperty("/search/rec_companycode", sCompanyCode);

          return;
        }

        // =========================================================
        // EXISTING IC FORM - INITIATOR
        // =========================================================
        if (this._sCCPicklistMode === "initiator") {
          oModel.setProperty("/headerData/initiatorCC", sCompanyCode);

          this.onInitiatorCCChange();

          return;
        }

        // =========================================================
        // EXISTING IC FORM - RECIPIENT
        // =========================================================
        if (this._sCCPicklistMode === "recipient") {
          oModel.setProperty("/headerData/recipientCC", sCompanyCode);

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
            controller: this,
          }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
          });
        }

        this._pDocTypeDialog.then(function (oDialog) {
          oDialog.open();

          if (
            (oModel.getProperty("/referenceData/documentTypes") || []).length >
            0
          ) {
            return;
          }

          oDialog.setBusy(true);
          MasterDataService.getDocumentTypes()
            .then(function (aTypes) {
              oDialog.setBusy(false);
              if (!aTypes.length) {
                MessageToast.show(
                  "No document types returned from the service.",
                );
                return;
              }
              oModel.setProperty("/referenceData/documentTypes", aTypes);
            })
            .catch(function () {
              oDialog.setBusy(false);
              MessageToast.show(
                "Failed to load document types. Check the service connection.",
              );
            });
        });
      },

      // ─── GL Account Value Help — Initiator ─────────────────────────────────
      onInitiatorGLAccountVH: function (oEvent) {
        var oModel = this.getView().getModel();
        var oView = this.getView();
        var that = this;

        var sCompanyCode =
          (oModel.getProperty("/headerData/initiatorCC") || "").trim();
          // (oModel.getProperty("/headerData/recipientCC") || "").trim();

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
                "No GL Accounts found for Company Code " + sCompanyCode + ".",
              );
              return;
            }

            // Store the API result for the SelectDialog.
            oModel.setProperty("/referenceData/glAccounts", aGLAccounts);

            // Create dialog only once.
            if (!that._pGLAccountDialog) {
              that._pGLAccountDialog = Fragment.load({
                id: oView.getId() + "--glAccount",
                name: "ZFI_INTERCO.fragment.GLAccountValueHelp",
                controller: that,
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
                (oError && oError.message ? oError.message : String(oError)),
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
        // var sQuery = (
        //     oEvent.getParameter("value") || "" ).trim();
        var sQuery = (oEvent.getParameter("value") || "")
          .replace(/\*/g, "")
          .trim();

        console.log("GL Squrey:", sQuery);

        var oModel = this.getView().getModel();

        var sCompanyCode = (
          oModel.getProperty("/headerData/initiatorCC") || ""
        ).trim();

        if (!sCompanyCode) {
          MessageToast.show("Please select Initiator Company Code first.");
          return;
        }

        if (!sQuery) {
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.searchGLAccounts(sCompanyCode, sQuery)
          .then(function (aResults) {
            console.log("Initiator GL Search Results:", aResults);

            oModel.setProperty("/referenceData/glAccounts", aResults || []);
          })
          .catch(function (oError) {
            console.error("Initiator GL Account search failed:", oError);

            oModel.setProperty("/referenceData/glAccounts", []);

            MessageToast.show("Failed to search GL Account.");
          })
          .then(function () {
            oModel.setProperty("/appState/isBusy", false);
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

        var sCompanyCode = (
          oModel.getProperty("/headerData/recipientCC") || ""
        ).trim();
        // (oModel.getProperty("/headerData/recipientCC") || "").trim();

        if (!sCompanyCode) {
          MessageToast.show("Please select Recipient Company Code first.");
          return;
        }

        // Remember the exact Recipient GL row
        var oInput = oEvent.getSource();
        var oContext = oInput.getBindingContext();

        if (!oContext) {
          MessageToast.show(
            "Unable to determine the selected Recipient GL line.",
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
                "No GL Accounts found for Company Code " + sCompanyCode + ".",
              );
              return;
            }

            oModel.setProperty("/referenceData/glAccounts", aGLAccounts);

            if (!that._pRecipientGLAccountDialog) {
              that._pRecipientGLAccountDialog = Fragment.load({
                id: oView.getId() + "--recipientGLAccount",
                name: "ZFI_INTERCO.fragment.RecipientGLAccountValueHelp",
                controller: that,
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
                (oError && oError.message ? oError.message : String(oError)),
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
        // var sQuery = (oEvent.getParameter("value") || "").trim();

         var sQuery = (oEvent.getParameter("value") || "")
          .replace(/\*/g, "")
          .trim();

        var oModel = this.getView().getModel();

        var sCompanyCode = (
          oModel.getProperty("/headerData/recipientCC") || ""
        ).trim();


        if (!sCompanyCode) {
          MessageToast.show("Please select Recipient Company Code first.");
          return;
        }

        if (!sQuery) {
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.searchGLAccounts(sCompanyCode, sQuery)
          .then(function (aResults) {
            console.log("Recipient GL Search Results:", aResults);

            oModel.setProperty("/referenceData/glAccounts", aResults || []);
          })
          .catch(function (oError) {
            console.error("Recipient GL Account search failed:", oError);

            oModel.setProperty("/referenceData/glAccounts", []);

            MessageToast.show("Failed to search Recipient GL Account.");
          })
          .then(function () {
            oModel.setProperty("/appState/isBusy", false);
          });
      },

      onRecipientGLAccountPicklistConfirm: function (oEvent) {
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

        var sRowPath = this._sRecipientGLAccountRowPath;

        if (!sRowPath) {
          MessageToast.show(
            "Unable to determine the Recipient GL coding line.",
          );
          return;
        }

        // IMPORTANT:
        // Write to recipientLines, not initiatorLines.
        oModel.setProperty(sRowPath + "/glAccount", sGLAccount);

        this._recalculateRecipientBalance();

        this._sRecipientGLAccountRowPath = "";

        MessageToast.show("GL Account " + sGLAccount + " selected.");
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
        var sCompanyCode = (
          oModel.getProperty("/headerData/initiatorCC") || ""
        ).trim();

        if (!sCompanyCode) {
          MessageToast.show("Please select Initiator Company Code first.");
          return;
        }

        // Remember the exact Initiator GL line
        // Example: /initiatorLines/1
        var oInput = oEvent.getSource();
        var oContext = oInput.getBindingContext();

        if (!oContext) {
          MessageToast.show(
            "Unable to determine the selected Profit Center line.",
          );
          return;
        }

        this._sProfitCenterRowPath = oContext.getPath();
        this._sProfitCenterCompanyCode = sCompanyCode;

        oModel.setProperty("/appState/isBusy", true);

        // Fetch Profit Centers based on Initiator Company Code
        MasterDataService.getProfitCenters(sCompanyCode)
          .then(function (aProfitCenters) {
            oModel.setProperty("/appState/isBusy", false);

            if (!aProfitCenters || !aProfitCenters.length) {
              MessageToast.show(
                "No Profit Centers found for Company Code " +
                  sCompanyCode +
                  ".",
              );

              return;
            }

            // Store API result for SelectDialog
            oModel.setProperty("/referenceData/profitCenters", aProfitCenters);

            // Create dialog only once
            if (!that._pProfitCenterDialog) {
              that._pProfitCenterDialog = Fragment.load({
                id: oView.getId() + "--profitCenter",
                name: "ZFI_INTERCO.fragment.ProfitCenterPicklist",
                controller: that,
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
                (oError && oError.message ? oError.message : String(oError)),
            );
          });
      },
      onProfitCenterPicklistSearch: function (oEvent) {
        var sQuery = (oEvent.getParameter("value") || "")
          .replace(/[*+]/g, "")
          .trim();
        var oModel = this.getView().getModel();
        var sCompanyCode = this._sProfitCenterCompanyCode || "";

        if (!sQuery) {
          oModel.setProperty("/referenceData/profitCenters", []);
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.searchProfitCenters(sCompanyCode, sQuery)
          .then(function (aResults) {
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/profitCenters", aResults || []);
          })
          .catch(function (oError) {
            console.error("Initiator Profit Center search failed:", oError);
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/profitCenters", []);
          });
      },
      onProfitCenterPicklistConfirm: function (oEvent) {
        var oSelectedItem = oEvent.getParameter("selectedItem");

        if (!oSelectedItem) {
          return;
        }

        var oContext = oSelectedItem.getBindingContext();

        if (!oContext) {
          MessageToast.show("Unable to determine the selected Profit Center.");
          return;
        }

        var oProfitCenter = oContext.getObject();

        var sProfitCenter = oProfitCenter.profitCenter || "";

        if (!sProfitCenter) {
          MessageToast.show("Selected Profit Center is empty.");
          return;
        }

        var oModel = this.getView().getModel();

        // Get the exact line from which the value help was opened
        var sRowPath = this._sProfitCenterRowPath;

        if (!sRowPath) {
          MessageToast.show(
            "Unable to determine the Initiator GL coding line.",
          );
          return;
        }

        // Set selected Profit Center
        oModel.setProperty(sRowPath + "/profitCenter", sProfitCenter);

        // Clear stored row path
        this._sProfitCenterRowPath = "";

        MessageToast.show("Profit Center " + sProfitCenter + " selected.");
      },
      onProfitCenterPicklistCancel: function () {
        this._sProfitCenterRowPath = "";
      },

      // ─── Profit Center Value Help — Recipient ───────────────────────────────

      onRecipientProfitCenterValueHelp: function (oEvent) {
        var oModel = this.getView().getModel();
        var oView = this.getView();
        var that = this;

        var sCompanyCode = (
          oModel.getProperty("/headerData/recipientCC") || ""
        ).trim();

        if (!sCompanyCode) {
          MessageToast.show("Please select Recipient Company Code first.");
          return;
        }

        var oInput = oEvent.getSource();
        var oContext = oInput.getBindingContext();

        if (!oContext) {
          MessageToast.show(
            "Unable to determine the selected Recipient Profit Center line.",
          );
          return;
        }

        this._sRecipientProfitCenterRowPath = oContext.getPath();
        this._sRecipientProfitCenterCompanyCode = sCompanyCode;

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.getProfitCenters(sCompanyCode)
          .then(function (aProfitCenters) {
            oModel.setProperty("/appState/isBusy", false);

            if (!aProfitCenters || !aProfitCenters.length) {
              MessageToast.show(
                "No Profit Centers found for Company Code " +
                  sCompanyCode +
                  ".",
              );

              return;
            }

            oModel.setProperty("/referenceData/profitCenters", aProfitCenters);

            if (!that._pRecipientProfitCenterDialog) {
              that._pRecipientProfitCenterDialog = Fragment.load({
                id: oView.getId() + "--recipientProfitCenter",
                name: "ZFI_INTERCO.fragment.RecipientProfitCenterPicklist",
                controller: that,
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
                (oError && oError.message ? oError.message : String(oError)),
            );
          });
      },
      onRecipientProfitCenterPicklistSearch: function (oEvent) {
        var sQuery = (oEvent.getParameter("value") || "")
          .replace(/[*+]/g, "")
          .trim();
        var oModel = this.getView().getModel();
        var sCompanyCode = this._sRecipientProfitCenterCompanyCode || "";

        if (!sQuery) {
          oModel.setProperty("/referenceData/profitCenters", []);
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.searchProfitCenters(sCompanyCode, sQuery)
          .then(function (aResults) {
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/profitCenters", aResults || []);
          })
          .catch(function (oError) {
            console.error("Recipient Profit Center search failed:", oError);
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/profitCenters", []);
          });
      },

      onRecipientProfitCenterPicklistConfirm: function (oEvent) {
        var oSelectedItem = oEvent.getParameter("selectedItem");

        if (!oSelectedItem) {
          return;
        }

        var oContext = oSelectedItem.getBindingContext();

        if (!oContext) {
          MessageToast.show(
            "Unable to determine the selected Recipient Profit Center.",
          );
          return;
        }

        var oProfitCenter = oContext.getObject();

        var sProfitCenter = oProfitCenter.profitCenter || "";

        if (!sProfitCenter) {
          MessageToast.show("Selected Profit Center is empty.");
          return;
        }

        var oModel = this.getView().getModel();

        var sRowPath = this._sRecipientProfitCenterRowPath;

        if (!sRowPath) {
          MessageToast.show(
            "Unable to determine the Recipient GL coding line.",
          );
          return;
        }

        oModel.setProperty(sRowPath + "/profitCenter", sProfitCenter);

        this._sRecipientProfitCenterRowPath = "";

        MessageToast.show("Profit Center " + sProfitCenter + " selected.");
      },

      onRecipientProfitCenterPicklistCancel: function () {
        this._sRecipientProfitCenterRowPath = "";
      },

      onInitiatorCostCenterVH: function (oEvent) {
        this._oCostCenterInput = oEvent.getSource();

        var oModel = this.getView().getModel();

        var sCompanyCode = (oModel.getProperty("/headerData/initiatorCC") || "")
          .trim()
          .toUpperCase();

        if (!sCompanyCode) {
          sap.m.MessageToast.show(
            "Please select Initiator Company Code first.",
          );
          return;
        }

        this._sCostCenterCompanyCode = sCompanyCode;

        MasterDataService.getCostCenters(sCompanyCode)
          .then(
            function (aCostCenters) {
              oModel.setProperty("/referenceData/costCenters", aCostCenters);

              if (!aCostCenters || !aCostCenters.length) {
                sap.m.MessageToast.show(
                  "No Cost Centers found for Company Code " +
                    sCompanyCode +
                    ".",
                );
                return;
              }

              if (!this._oCostCenterDialog) {
                this._oCostCenterDialog = sap.ui.xmlfragment(
                  this.getView().getId(),
                  "ZFI_INTERCO.fragment.CostCenterValueHelp",
                  this,
                );

                this.getView().addDependent(this._oCostCenterDialog);
              }

              this._oCostCenterDialog.setModel(oModel);
              this._oCostCenterDialog.open();
            }.bind(this),
          )

          .catch(function (oError) {
            console.error("[CostCenter VH] Error:", oError);

            sap.m.MessageToast.show("Failed to load Cost Centers.");
          });
      },

      onCostCenterPicklistSearch: function (oEvent) {
        var sValue = (oEvent.getParameter("value") || "")
          .replace(/\*/g, "")
          .trim();


          

        var oModel = this.getView().getModel();
        var sCompanyCode = this._sCostCenterCompanyCode || "";

        if (!sValue) {
          oModel.setProperty("/referenceData/costCenters", []);
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.searchCostCenters(sCompanyCode, sValue)
          .then(function (aResults) {
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/costCenters", aResults || []);
          })
          .catch(function (oError) {
            console.error("Initiator Cost Center search failed:", oError);
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/costCenters", []);
          });
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

        this._oCostCenterInput.setValue(oCostCenter.CostCenter);

        this._oCostCenterInput
          .getBindingContext()
          .getModel()
          .setProperty(
            this._oCostCenterInput.getBindingContext().getPath() +
              "/costCenter",
            oCostCenter.CostCenter,
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

        var sCompanyCode = (oModel.getProperty("/headerData/recipientCC") || "")
          .trim()
          .toUpperCase();

        if (!sCompanyCode) {
          MessageToast.show("Please select Recipient Company Code first.");

          return;
        }

        this._sRecipientCostCenterCompanyCode = sCompanyCode;

        MasterDataService.getCostCenters(sCompanyCode)
          .then(
            function (aCostCenters) {
              oModel.setProperty("/referenceData/costCenters", aCostCenters);

              if (!aCostCenters || !aCostCenters.length) {
                MessageToast.show(
                  "No Cost Centers found for Company Code " +
                    sCompanyCode +
                    ".",
                );

                return;
              }

              if (!this._oRecipientCostCenterDialog) {
                this._oRecipientCostCenterDialog = sap.ui.xmlfragment(
                  this.getView().getId(),
                  "ZFI_INTERCO.fragment.RecipientCostCenterValueHelp",
                  this,
                );

                this.getView().addDependent(this._oRecipientCostCenterDialog);
              }

              this._oRecipientCostCenterDialog.setModel(oModel);

              this._oRecipientCostCenterDialog.open();
            }.bind(this),
          )
          .catch(function (oError) {
            console.error("[Recipient CostCenter VH] Error:", oError);

            MessageToast.show("Failed to load Recipient Cost Centers.");
          });
      },

      onRecipientCostCenterPicklistSearch: function (oEvent) {
        var sValue = (oEvent.getParameter("value") || "")
          .replace(/\*/g, "")
          .trim();

        var oModel = this.getView().getModel();
        var sCompanyCode = this._sRecipientCostCenterCompanyCode || "";

        if (!sValue) {
          oModel.setProperty("/referenceData/costCenters", []);
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.searchCostCenters(sCompanyCode, sValue)
          .then(function (aResults) {
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/costCenters", aResults || []);
          })
          .catch(function (oError) {
            console.error("Recipient Cost Center search failed:", oError);
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/costCenters", []);
          });
      },

      onRecipientCostCenterPicklistConfirm: function (oEvent) {
        var oSelectedItem = oEvent.getParameter("selectedItem");

        if (!oSelectedItem || !this._oRecipientCostCenterInput) {
          return;
        }

        var oContext = oSelectedItem.getBindingContext();

        if (!oContext) {
          return;
        }

        var oCostCenter = oContext.getObject();

        this._oRecipientCostCenterInput.setValue(oCostCenter.CostCenter);

        this._oRecipientCostCenterInput
          .getBindingContext()
          .getModel()
          .setProperty(
            this._oRecipientCostCenterInput.getBindingContext().getPath() +
              "/costCenter",
            oCostCenter.CostCenter,
          );

        this._oRecipientCostCenterDialog.close();
      },

      onRecipientCostCenterPicklistCancel: function () {
        if (this._oRecipientCostCenterDialog) {
          this._oRecipientCostCenterDialog.close();
        }
      },

      // ─── WBS Element Value Help — Initiator ─────────────────────────────────

      onInitiatorWbsElementVH: function (oEvent) {
        var oModel = this.getView().getModel();

        var sCompanyCode = (oModel.getProperty("/headerData/initiatorCC") || "")
          .trim()
          .toUpperCase();

        if (!sCompanyCode) {
          MessageToast.show("Please select Initiator Company Code first.");
          return;
        }

        // Remember the exact GL line on which the value help was clicked.
        var oInput = oEvent.getSource();
        var oContext = oInput.getBindingContext();

        if (!oContext) {
          MessageToast.show("Unable to determine the selected GL line.");
          return;
        }

        this._sWBSRowPath = oContext.getPath();
        this._sWBSCompanyCode = sCompanyCode;

        MasterDataService.getWBSElements(sCompanyCode)
          .then(
            function (aWBSElements) {
              oModel.setProperty("/referenceData/wbsElements", aWBSElements);

              if (!aWBSElements || !aWBSElements.length) {
                MessageToast.show(
                  "No WBS Elements found for Company Code " +
                    sCompanyCode +
                    ".",
                );
                return;
              }

              if (!this._oWBSDialog) {
                this._oWBSDialog = sap.ui.xmlfragment(
                  this.getView().getId(),
                  "ZFI_INTERCO.fragment.WBSValueHelp",
                  this,
                );

                this.getView().addDependent(this._oWBSDialog);
              }

              this._oWBSDialog.setModel(oModel);
              this._oWBSDialog.open();
            }.bind(this),
          )
          .catch(function (oError) {
            console.error("[WBS VH] Error:", oError);
            MessageToast.show("Failed to load WBS Elements.");
          });
      },

      onWBSPicklistSearch: function (oEvent) {
        var sValue = (oEvent.getParameter("value") || "")
          .replace(/[*+]/g, "")
          .trim();

        var oModel = this.getView().getModel();
        var sCompanyCode = this._sWBSCompanyCode || "";

        if (!sValue) {
          oModel.setProperty("/referenceData/wbsElements", []);
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.searchWBSElements(sCompanyCode, sValue)
          .then(function (aResults) {
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/wbsElements", aResults || []);
          })
          .catch(function (oError) {
            console.error("Initiator WBS Element search failed:", oError);
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/wbsElements", []);
          });
      },

      onWBSPicklistConfirm: function (oEvent) {
        var oSelectedItem = oEvent.getParameter("selectedItem");

        if (!oSelectedItem) {
          return;
        }

        var oContext = oSelectedItem.getBindingContext();

        if (!oContext) {
          MessageToast.show("Unable to determine the selected WBS Element.");
          return;
        }

        var oWBS = oContext.getObject();

        var sProjectElement = oWBS.ProjectElement || "";

        if (!sProjectElement) {
          MessageToast.show("Selected WBS Element is empty.");
          return;
        }

        var oModel = this.getView().getModel();

        // Use the exact GL row from which the value help was opened.
        var sRowPath = this._sWBSRowPath;

        if (!sRowPath) {
          MessageToast.show("Unable to determine the GL coding line.");
          return;
        }

        // Set selected WBS Element into that exact row.
        oModel.setProperty(sRowPath + "/wbsElement", sProjectElement);

        // Clear stored row path after successful selection.
        this._sWBSRowPath = "";

        MessageToast.show("WBS Element " + sProjectElement + " selected.");
      },

      onWBSPicklistCancel: function () {
        // SelectDialog closes automatically.
        this._sWBSRowPath = "";
      },

      // ─── WBS Element Value Help — Recipient ─────────────────────────────────

      onRecipientWbsElementVH: function (oEvent) {
        var oModel = this.getView().getModel();

        var sCompanyCode = (oModel.getProperty("/headerData/recipientCC") || "")
          .trim()
          .toUpperCase();

        if (!sCompanyCode) {
          MessageToast.show("Please select Recipient Company Code first.");
          return;
        }

        // Remember the exact GL line on which the value help was clicked.
        var oInput = oEvent.getSource();
        var oContext = oInput.getBindingContext();

        if (!oContext) {
          MessageToast.show("Unable to determine the selected GL line.");
          return;
        }

        this._sRecipientWBSRowPath = oContext.getPath();
        this._sRecipientWBSCompanyCode = sCompanyCode;

        MasterDataService.getWBSElements(sCompanyCode)
          .then(
            function (aWBSElements) {
              oModel.setProperty("/referenceData/wbsElements", aWBSElements);

              if (!aWBSElements || !aWBSElements.length) {
                MessageToast.show(
                  "No WBS Elements found for Company Code " +
                    sCompanyCode +
                    ".",
                );
                return;
              }

              if (!this._oRecipientWBSDialog) {
                this._oRecipientWBSDialog = sap.ui.xmlfragment(
                  this.getView().getId(),
                  "ZFI_INTERCO.fragment.RecipientWBSValueHelp",
                  this,
                );

                this.getView().addDependent(this._oRecipientWBSDialog);
              }

              this._oRecipientWBSDialog.setModel(oModel);
              this._oRecipientWBSDialog.open();
            }.bind(this),
          )
          .catch(function (oError) {
            console.error("[Recipient WBS VH] Error:", oError);
            MessageToast.show("Failed to load Recipient WBS Elements.");
          });
      },

      onRecipientWBSPicklistSearch: function (oEvent) {
        var sValue = (oEvent.getParameter("value") || "")
          .replace(/[*+]/g, "")
          .trim();

        var oModel = this.getView().getModel();
        var sCompanyCode = this._sRecipientWBSCompanyCode || "";

        if (!sValue) {
          oModel.setProperty("/referenceData/wbsElements", []);
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.searchWBSElements(sCompanyCode, sValue)
          .then(function (aResults) {
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/wbsElements", aResults || []);
          })
          .catch(function (oError) {
            console.error("Recipient WBS Element search failed:", oError);
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/referenceData/wbsElements", []);
          });
      },

      onRecipientWBSPicklistConfirm: function (oEvent) {
        var oSelectedItem = oEvent.getParameter("selectedItem");

        if (!oSelectedItem) {
          return;
        }

        var oContext = oSelectedItem.getBindingContext();

        if (!oContext) {
          MessageToast.show("Unable to determine the selected WBS Element.");
          return;
        }

        var oWBS = oContext.getObject();

        var sProjectElement = oWBS.ProjectElement || "";

        if (!sProjectElement) {
          MessageToast.show("Selected WBS Element is empty.");
          return;
        }

        var oModel = this.getView().getModel();

        // Use the exact GL row from which the value help was opened.
        var sRowPath = this._sRecipientWBSRowPath;

        if (!sRowPath) {
          MessageToast.show("Unable to determine the GL coding line.");
          return;
        }

        // Set selected WBS Element into that exact row.
        oModel.setProperty(sRowPath + "/wbsElement", sProjectElement);

        // Clear stored row path after successful selection.
        this._sRecipientWBSRowPath = "";

        MessageToast.show("WBS Element " + sProjectElement + " selected.");
      },

      onRecipientWBSPicklistCancel: function () {
        // SelectDialog closes automatically.
        this._sRecipientWBSRowPath = "";
      },

      onDocTypePicklistSearch: function (oEvent) {
        var sQuery = oEvent.getParameter("value");
        var oBinding = oEvent.getParameter("itemsBinding");
        if (!sQuery) {
          oBinding.filter([]);
          return;
        }
        oBinding.filter([
          new Filter("documentType", FilterOperator.Contains, sQuery),
        ]);
      },

      onDocTypePicklistConfirm: function (oEvent) {
        var oSelected = oEvent.getParameter("selectedItem");
        if (!oSelected) {
          return;
        }
        var sType = oSelected.getBindingContext().getObject().documentType;
        this.getView()
          .getModel()
          .setProperty("/headerData/documentTypeCode", sType);
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
          oModel.setProperty(
            "/headerData/partyValidationText",
            "T001U relationship confirmed. Initiator " +
              sIniCC +
              " ↔ Recipient " +
              sRecCC +
              ". Interco clearing accounts derived from YY1_ICT001U.",
          );
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
        if (sValue) {
          oModel.setProperty("/headerData/documentDateState", "None");
        }
      },

      onPostingDateChange: function (oEvent) {
        var sValue = oEvent.getParameter("value");
        var oModel = this.getView().getModel();
        oModel.setProperty("/headerData/postingDate", sValue);
        if (sValue) {
          oModel.setProperty("/headerData/postingDateState", "None");
        }

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
        var aClosedPeriods =
          oModel.getProperty("/referenceData/closedPeriods") || [];
        var bClosed = aClosedPeriods.indexOf(sKey) > -1;
        oModel.setProperty(
          "/headerData/periodStatusState",
          bClosed ? "Error" : "Success",
        );
        oModel.setProperty(
          "/headerData/periodStatusText",
          "Period " +
            sPeriod +
            "/" +
            sYear +
            (bClosed ? " — CLOSED, posting blocked" : " — Open"),
        );
        oModel.setProperty(
          "/headerData/periodStatusIcon",
          bClosed ? "sap-icon://decline" : "sap-icon://accept",
        );
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

        oModel.setProperty(
          "/headerData/totalIntercoAmount",
          (fNet + fTax).toFixed(2),
        );
        if (fNet > 0) {
          oModel.setProperty("/headerData/netAmountState", "None");
        }

        // Show Tax Code dropdowns only when a tax amount has been entered
        var bTaxVisible = fTax > 0;
        oModel.setProperty("/headerData/taxCodeVisible", bTaxVisible);


       

        if (!bTaxVisible) {
          // Tax removed — clear tax code selections, computed amounts, and any mismatch warning
          oModel.setProperty("/headerData/initiatorTaxCode", "");
          oModel.setProperty("/headerData/recipientTaxCode", "");
   
  var aIniLines = oModel.getProperty("/initiatorLines") || [];
  aIniLines.forEach(function (oLine) { oLine.taxCode = ""; });
  oModel.setProperty("/initiatorLines", aIniLines);

  var aRecLines = oModel.getProperty("/recipientLines") || [];
  aRecLines.forEach(function (oLine) { oLine.taxCode = ""; });
  oModel.setProperty("/recipientLines", aRecLines);
          oModel.setProperty("/headerData/initiatorTaxAmount", "0.00");
          oModel.setProperty("/headerData/recipientTaxAmount", "0.00");
          oModel.setProperty("/headerData/taxCalcRows", []);
          oModel.setProperty("/headerData/taxCalcVisible", false);
          oModel.setProperty("/headerData/initiatorTaxMismatchVisible", false);
          oModel.setProperty("/headerData/initiatorTaxMismatchText", "");
          oModel.setProperty("/headerData/recipientTaxMismatchVisible", false);
          oModel.setProperty("/headerData/recipientTaxMismatchText", "");

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
        var sCode = oModel.getProperty("/headerData/initiatorTaxCode") || "";
        // Propagate selected Tax / VAT Code to every initiator GL line
        var aLines = oModel.getProperty("/initiatorLines") || [];
        aLines.forEach(function (oLine) {

          oLine.taxCode = sCode;
        
        });
        oModel.setProperty("/initiatorLines", aLines);

     

        this._recalculateTax();
        this._syncBPClearingLine();
        this._recalculateBalance();
        this._syncRecipientBPClearingLine();
        this._validateTaxCodeState();
      },

      onRecipientTaxCodeChange: function () {
        var oModel = this.getView().getModel();
        var sCode = oModel.getProperty("/headerData/recipientTaxCode") || "";
        // Propagate selected Tax / VAT Code to every recipient GL line
        var aLines = oModel.getProperty("/recipientLines") || [];
        aLines.forEach(function (oLine) {
          oLine.taxCode = sCode;
        });
        oModel.setProperty("/recipientLines", aLines);

        this._recalculateTax();
        this._syncRecipientBPClearingLine();
        this._validateTaxCodeState();
      },

      // ─── Tax Code Value Help (Initiator / Recipient) ────────────────────────
      // Same TableSelectDialog pattern as WBSValueHelp/GLAccountValueHelp.
      // Confirm just writes the picked code into the same headerData field the
      // Select used to write to, then calls the existing onInitiatorTaxCodeChange/
      // onRecipientTaxCodeChange handlers above — so propagation to GL lines,
      // _recalculateTax(), _syncBPClearingLine()/_syncRecipientBPClearingLine(),
      // _recalculateBalance() and _validateTaxCodeState() all keep working exactly
      // as before; only the input control changed from Select to Input+ValueHelp.

      onInitiatorTaxCodeVH: function () {
        var oModel = this.getView().getModel();
        var that = this;

        if (!this._pInitiatorTaxCodeDialog) {
          this._pInitiatorTaxCodeDialog = Fragment.load({
            id: this.getView().getId() + "--initiatorTaxCode",
            name: "ZFI_INTERCO.fragment.TaxCodeValueHelp",
            controller: this,
          }).then(function (oDialog) {
            that.getView().addDependent(oDialog);
            return oDialog;
          });
        }

        this._pInitiatorTaxCodeDialog.then(function (oDialog) {
          if (!(oModel.getProperty("/referenceData/initiatorTaxCodes") || []).length) {
            MessageToast.show("Please select Initiator Company Code first.");
            return;
          }
          oDialog.open();
        });
      },

      onInitiatorTaxCodePicklistSearch: function (oEvent) {
        var sQuery = oEvent.getParameter("value");
        var oBinding = oEvent.getParameter("itemsBinding");
        if (!sQuery) {
          oBinding.filter([]);
          return;
        }
        oBinding.filter([
          new Filter({
            filters: [
              new Filter("code", FilterOperator.Contains, sQuery),
              new Filter("description", FilterOperator.Contains, sQuery),
            ],
            and: false,
          }),
        ]);
      },

      onInitiatorTaxCodePicklistConfirm: function (oEvent) {
        var oSelected = oEvent.getParameter("selectedItem");
        if (!oSelected) {
          return;
        }
        var oCode = oSelected.getBindingContext().getObject();
        this.getView().getModel().setProperty("/headerData/initiatorTaxCode", oCode.code || "");
        this.onInitiatorTaxCodeChange();
      },

      onInitiatorTaxCodePicklistCancel: function () {
        // TableSelectDialog self-closes
      },

      onRecipientTaxCodeVH: function () {
        var oModel = this.getView().getModel();
        var that = this;

        if (!this._pRecipientTaxCodeDialog) {
          this._pRecipientTaxCodeDialog = Fragment.load({
            id: this.getView().getId() + "--recipientTaxCode",
            name: "ZFI_INTERCO.fragment.RecipientTaxCodeValueHelp",
            controller: this,
          }).then(function (oDialog) {
            that.getView().addDependent(oDialog);
            return oDialog;
          });
        }

        this._pRecipientTaxCodeDialog.then(function (oDialog) {
          if (!(oModel.getProperty("/referenceData/recipientTaxCodes") || []).length) {
            MessageToast.show("Please select Recipient Company Code first.");
            return;
          }
          oDialog.open();
        });
      },

      onRecipientTaxCodePicklistSearch: function (oEvent) {
        var sQuery = oEvent.getParameter("value");
        var oBinding = oEvent.getParameter("itemsBinding");
        if (!sQuery) {
          oBinding.filter([]);
          return;
        }
        oBinding.filter([
          new Filter({
            filters: [
              new Filter("code", FilterOperator.Contains, sQuery),
              new Filter("description", FilterOperator.Contains, sQuery),
            ],
            and: false,
          }),
        ]);
      },

      onRecipientTaxCodePicklistConfirm: function (oEvent) {
        var oSelected = oEvent.getParameter("selectedItem");
        if (!oSelected) {
          return;
        }
        var oCode = oSelected.getBindingContext().getObject();
        this.getView().getModel().setProperty("/headerData/recipientTaxCode", oCode.code || "");
        this.onRecipientTaxCodeChange();
      },

      onRecipientTaxCodePicklistCancel: function () {
        // TableSelectDialog self-closes
      },

      _validateTaxCodeState: function () {
        var oModel = this.getView().getModel();
        var fTax = parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;
        var sIni = oModel.getProperty("/headerData/initiatorTaxCode") || "";
        var sRec = oModel.getProperty("/headerData/recipientTaxCode") || "";
        oModel.setProperty(
          "/headerData/initiatorTaxCodeState",
          fTax > 0 && !sIni ? "Error" : "None",
        );
        oModel.setProperty(
          "/headerData/recipientTaxCodeState",
          fTax > 0 && !sRec ? "Error" : "None",
        );
      },

      _recalculateTax: function () {
        var oModel = this.getView().getModel();
        // Req 2/3: base is IC Net Amount — user-entered /headerData/taxAmount is NEVER modified here
        var fNet = parseFloat(oModel.getProperty("/headerData/netAmount")) || 0;
        var sIniCode = oModel.getProperty("/headerData/initiatorTaxCode") || "";
        var sRecCode = oModel.getProperty("/headerData/recipientTaxCode") || "";
        var sIniCountry =
          oModel.getProperty("/headerData/initiatorCountry") || "";
        var sRecCountry =
          oModel.getProperty("/headerData/recipientCountry") || "";

        if (!fNet || (!sIniCode && !sRecCode)) {
          oModel.setProperty("/headerData/initiatorTaxAmount", "0.00");
          oModel.setProperty("/headerData/recipientTaxAmount", "0.00");
          oModel.setProperty("/headerData/taxCalcRows", []);
          oModel.setProperty("/headerData/taxCalcVisible", false);
          oModel.setProperty("/headerData/initiatorTaxMismatchVisible", false);
          oModel.setProperty("/headerData/initiatorTaxMismatchText", "");
          oModel.setProperty("/headerData/recipientTaxMismatchVisible", false);
          oModel.setProperty("/headerData/recipientTaxMismatchText", "");
          return;
        }

        var fIniTax = 0;
        var fRecTax = 0;
        var pChain = Promise.resolve();

        if (sIniCode) {
          pChain = pChain
            .then(function () {
              return MasterDataService.getTaxCodeRate(sIniCode, sIniCountry);
            })
            .then(function (fRate) {
              // Req 2: Calculated Tax = IC Net Amount × CONDITIONRATERATIO / 100
              fIniTax = (fNet * fRate) / 100;
              oModel.setProperty(
                "/headerData/initiatorTaxAmount",
                fIniTax.toFixed(2),
              );
            });
        }

        if (sRecCode) {
          pChain = pChain
            .then(function () {
              return MasterDataService.getTaxCodeRate(sRecCode, sRecCountry);
            })
            .then(function (fRate) {
              // Req 3: Same formula for recipient
              fRecTax = (fNet * fRate) / 100;
              oModel.setProperty(
                "/headerData/recipientTaxAmount",
                fRecTax.toFixed(2),
              );
            });
        }

        pChain.then(function () {
          var sCcy =
            oModel.getProperty("/headerData/currency") ||
            Constants.DEFAULT.CURRENCY;
          var sIniCC = (oModel.getProperty("/headerData/initiatorCC") || "")
            .trim()
            .toUpperCase();
          var sRecCC = (oModel.getProperty("/headerData/recipientCC") || "")
            .trim()
            .toUpperCase();
          var aRows = [];

          if (fNet > 0 && sIniCode) {
            aRows.push({
              entity: "Initiator" + (sIniCC ? " (" + sIniCC + ")" : ""),
              taxCode: sIniCode,
              rate:
                (fNet > 0 ? ((fIniTax / fNet) * 100).toFixed(2) : "0.00") + "%",
              gross: fNet.toFixed(2),
              taxAmount: fIniTax.toFixed(2),
              netAmount: (fNet - fIniTax).toFixed(2),
              currency: sCcy,
            });
          }
          if (fNet > 0 && sRecCode) {
            aRows.push({
              entity: "Recipient" + (sRecCC ? " (" + sRecCC + ")" : ""),
              taxCode: sRecCode,
              rate:
                (fNet > 0 ? ((fRecTax / fNet) * 100).toFixed(2) : "0.00") + "%",
              gross: fNet.toFixed(2),
              taxAmount: fRecTax.toFixed(2),
              netAmount: (fNet - fRecTax).toFixed(2),
              currency: sCcy,
            });
          }
          oModel.setProperty("/headerData/taxCalcRows", aRows);
          oModel.setProperty("/headerData/taxCalcVisible", aRows.length > 0);

          // Req 4: Compare user-entered taxAmount vs total calculated — warning only, never overwrite
          var fUserTax =
            parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;

          // Initiator mismatch: compare user tax vs initiator calculated tax only
          if (fUserTax > 0 && sIniCode && Math.abs(fUserTax - fIniTax) > 0.01) {
            oModel.setProperty("/headerData/initiatorTaxMismatchVisible", true);
            oModel.setProperty(
              "/headerData/initiatorTaxMismatchText",
              "Warning: The entered Tax Amount (" +
                fUserTax.toFixed(2) +
                " " +
                sCcy +
                ") does not match the calculated Tax Amount (" +
                fIniTax.toFixed(2) +
                " " +
                sCcy +
                ") based on the selected Tax Code. Please review the entered value.",
            );
          } else {
            oModel.setProperty(
              "/headerData/initiatorTaxMismatchVisible",
              false,
            );
            oModel.setProperty("/headerData/initiatorTaxMismatchText", "");
          }

          // Recipient mismatch: compare user tax vs recipient calculated tax only
          if (fUserTax > 0 && sRecCode && Math.abs(fUserTax - fRecTax) > 0.01) {
            oModel.setProperty("/headerData/recipientTaxMismatchVisible", true);
            oModel.setProperty(
              "/headerData/recipientTaxMismatchText",
              "Warning: The entered Tax Amount (" +
                fUserTax.toFixed(2) +
                " " +
                sCcy +
                ") does not match the calculated Tax Amount (" +
                fRecTax.toFixed(2) +
                " " +
                sCcy +
                ") based on the selected Tax Code. Please review the entered value.",
            );
          } else {
            oModel.setProperty(
              "/headerData/recipientTaxMismatchVisible",
              false,
            );
            oModel.setProperty("/headerData/recipientTaxMismatchText", "");
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
            isSystem: false,
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
        var sIniTaxCode =
          oModel.getProperty("/headerData/initiatorTaxCode") || "";

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
          lineRef3: "",
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
        aLines.forEach(function (oLine, i) {
          oLine.rowNum = i + 1;
        });
        oModel.setProperty("/initiatorLines", aLines);
        this._recalculateBalance();
      },

      onGLLineChange: function () {
        this._recalculateBalance();
      },

      _recalculateBalance: function () {
        var oModel = this.getView().getModel();
        var aLines = oModel.getProperty("/initiatorLines") || [];
        var fTotalDr = 0,
          fTotalCr = 0;

        aLines.forEach(function (oLine) {
          var fAmt =
            parseFloat(String(oLine.amountDC).replace(/[^0-9.\-]/g, "")) || 0;
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
          isBalanced: bBalanced,
        });
      },

      _syncBPClearingLine: function () {
        var oModel = this.getView().getModel();
        var aLines = oModel.getProperty("/initiatorLines");
        if (!aLines || !aLines.length) return;

        var sTxType = oModel.getProperty("/headerData/transactionType");
        var sInitiatorBP = oModel.getProperty("/headerData/initiatorBP") || "—";
        var sRecipientBP = oModel.getProperty("/headerData/recipientBP") || "—";
        var sReconAccount =
          oModel.getProperty("/headerData/reconciliationAccount") ||
          sRecipientBP;
        var fGross =
          parseFloat(oModel.getProperty("/headerData/totalIntercoAmount")) || 0;
        var fIniTaxAmt =
          parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;
        var sIniTaxCode =
          oModel.getProperty("/headerData/initiatorTaxCode") || "";

        // GL Account = ReconciliationAccount from I_SupplierCompany(recipientCC, recipientBP).
        // Business Partner = Recipient BP (how the recipient appears as a supplier in initiator's books).
        // Trading Partner  = Recipient Company Code (the intercompany counterpart).
        aLines[0].glAccount = sReconAccount;
        aLines[0].businessPartner = sRecipientBP;
        // aLines[0].tradingPartner =
        //   oModel.getProperty("/headerData/recipientCC") || "—";
        aLines[0].amountDC = fGross.toFixed(2);
        aLines[0].taxCode = sIniTaxCode;
        aLines[0].taxAmount = fIniTaxAmt.toFixed(2);
        aLines[0].debitCredit =
          sTxType === Constants.TRANSACTION_TYPE.AP
            ? Constants.DC_INDICATOR.CREDIT
            : Constants.DC_INDICATOR.DEBIT;

        oModel.setProperty("/initiatorLines", aLines);
        this._recalculateBalance();
      },

      _propagateTradingPartner: function () {
        var oModel = this.getView().getModel();
        var aLines = oModel.getProperty("/initiatorLines") || [];
        var sRecCC = (
          oModel.getProperty("/headerData/recipientCC") || ""
        ).trim();
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
        var sRecTaxCode =
          oModel.getProperty("/headerData/recipientTaxCode") || "";

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
          lineRef3: "",
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
        aLines.forEach(function (oLine, i) {
          oLine.rowNum = i + 1;
        });
        oModel.setProperty("/recipientLines", aLines);
        this._recalculateRecipientBalance();
      },

      onRecipientGLLineChange: function () {
        this._recalculateRecipientBalance();
      },

      _recalculateRecipientBalance: function () {
        var oModel = this.getView().getModel();
        var aLines = oModel.getProperty("/recipientLines") || [];
        var fTotalDr = 0,
          fTotalCr = 0;

        aLines.forEach(function (oLine) {
          var fAmt =
            parseFloat(String(oLine.amountDC).replace(/[^0-9.\-]/g, "")) || 0;
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
          isBalanced: bBalanced,
        });
      },

      _syncRecipientBPClearingLine: function () {
        var oModel = this.getView().getModel();
        var aLines = oModel.getProperty("/recipientLines");
        if (!aLines || !aLines.length) return;

        var sTxType = oModel.getProperty("/headerData/transactionType");
        var sInitiatorBP = oModel.getProperty("/headerData/initiatorBP") || "—";
        var sReconAccount =
          oModel.getProperty("/headerData/recipientReconciliationAccount") ||
          sInitiatorBP;
        var fGross =
          parseFloat(oModel.getProperty("/headerData/totalIntercoAmount")) || 0;
        var fRecTaxAmt =
          parseFloat(oModel.getProperty("/headerData/taxAmount")) || 0;
        var sRecTaxCode =
          oModel.getProperty("/headerData/recipientTaxCode") || "";

        // GL Account = ReconciliationAccount from I_CustomerCompany(initiatorCC, initiatorBP).
        // Business Partner = Initiator BP (how the initiator appears as a customer in recipient's books).
        // Trading Partner  = Initiator Company Code (the intercompany counterpart).
        aLines[0].glAccount = sReconAccount;
        aLines[0].businessPartner = sInitiatorBP;
        aLines[0].tradingPartner =
          oModel.getProperty("/headerData/initiatorCC") || "—";
        aLines[0].amountDC = fGross.toFixed(2);
        aLines[0].taxCode = sRecTaxCode;
        aLines[0].taxAmount = fRecTaxAmt.toFixed(2);
        aLines[0].debitCredit =
          sTxType === Constants.TRANSACTION_TYPE.AP
            ? Constants.DC_INDICATOR.DEBIT
            : Constants.DC_INDICATOR.CREDIT;

        oModel.setProperty("/recipientLines", aLines);
        this._recalculateRecipientBalance();
      },

      _propagateRecipientTradingPartner: function () {
        var oModel = this.getView().getModel();
        var aLines = oModel.getProperty("/recipientLines") || [];
        var sIniCC = (
          oModel.getProperty("/headerData/initiatorCC") || ""
        ).trim();
        aLines.forEach(function (oLine) {
          oLine.tradingPartner = sIniCC || "—";
        });
        oModel.setProperty("/recipientLines", aLines);
      },

      onRecipientValidate: function () {
        var oModel = this.getView().getModel();

        // ---------------------------------------------------------
        // Recipient Validate can only run after Submit to Recipient
        // has established the document number. Never create a new
        // document just because this button was clicked.
        // ---------------------------------------------------------
        var sExistingDocId = oModel.getProperty("/workflow/intercoRef") || "";
        if (!sExistingDocId || sExistingDocId === "[NEW — assigned on save]") {
          MessageBox.error(
            "No document reference found. Please Submit to Recipient first.",
          );
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        var that = this;
        setTimeout(function () {
          var aLines = oModel.getProperty("/recipientLines") || [];

          var aUserLines = aLines.filter(function (oLine) {
            return !oLine.isSystemLine;
          });

          var oHeader = oModel.getProperty("/headerData");

          // Header checks — each blocks independently, same as Initiator
          if (!oHeader.initiatorCC) {
            oModel.setProperty("/appState/isBusy", false);
            MessageBox.error("Initiator Company Code is required.");
            return;
          }

          if (!oHeader.recipientCC) {
            oModel.setProperty("/appState/isBusy", false);
            MessageBox.error("Recipient Company Code is required.");
            return;
          }

          if (!oHeader.postingDate) {
            oModel.setProperty("/appState/isBusy", false);
            MessageBox.error("Posting Date is required.");
            return;
          }

          var fTaxAmount = parseFloat(oHeader.taxAmount) || 0;
          if (fTaxAmount > 0 && !oHeader.recipientTaxCode) {
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/recipientValidation", {
              visible: true,
              state: "Error",
              text: "Tax Code is required when a Tax Amount is entered. Please select a Tax / VAT Code.",
            });
            return;
          }

          // At least one user line
          if (aUserLines.length === 0) {
            oModel.setProperty("/appState/isBusy", false);
            MessageBox.error("At least one G/L line item must be entered.");
            return;
          }

          // Line validation — each blocks independently, same as Initiator
          for (var i = 0; i < aUserLines.length; i++) {
            var oLine = aUserLines[i];

            if (!oLine.glAccount) {
              oModel.setProperty("/appState/isBusy", false);
              MessageBox.error(
                "Line " + (i + 2) + ": G/L Account is missing.",
              );
              return;
            }

            if (!oLine.amountDC || parseFloat(oLine.amountDC) === 0) {
              oModel.setProperty("/appState/isBusy", false);
              MessageBox.error(
                "Line " + (i + 2) + ": Amount must be greater than zero.",
              );
              return;
            }
          }

          var oBalance = oModel.getProperty("/recipientBalance");
          // if (!oBalance.isBalanced) {
          //   oModel.setProperty("/appState/isBusy", false);
          //   MessageBox.error(
          //     "Document is not in balance. Net difference: " +
          //       oBalance.netAmount,
          //   );
          //   return;
          // }

          // ---------------------------------------------------------
          // Client-side checks passed. Validate/simulate in SAP using
          // the SAME accountingdocument_temp established by Submit to
          // Recipient — never create a new document from this button.
          // ---------------------------------------------------------
          oModel.setProperty("/recipientValidation", {
            visible: true,
            state: "Information",
            text: "Validating document in SAP...",
          });

          var oHeaderForSap = oModel.getProperty("/headerData");

          MasterDataService.saveDraftAndSimulate_RES(
            oHeaderForSap,
            [],
            aLines,
            sExistingDocId,
            "R",
          )
            .then(function (oResult) {
              console.log("[Main] SAP Recipient Simulation successful:", oResult);
              oModel.setProperty("/appState/isBusy", false);

              // ---------------------------------------------------------
              // Once SAP Simulate returns the Tax GL account, split the
              // entered gross amount into Net GL Amount + Tax Amount:
              //   BP Clearing (gross) = Main GL (net) + Tax GL (tax)
              // Re-validating (unchanged or edited tax amount) must not
              // double-subtract, so any previous deduction is added back
              // before the current tax amount is applied.
              // Mirrors the Initiator-side logic in onInitiatorValidate,
              // except the header response carries the Recipient's Tax
              // GL account under "rec_tax_gl" (Initiator's is "tax_gl").
              // ---------------------------------------------------------
              var sTaxGL = String(
                (oResult.result && oResult.result.rec_tax_gl) || "",
              ).trim();

            //      var sTaxGL = String(
            //   (oResult.result && oResult.result.tax_gl) || "",
            // ).trim();

              if (sTaxGL && fTaxAmount > 0) {
                var aLinesAfter = oModel.getProperty("/recipientLines") || [];

                var oMainLine = aLinesAfter.find(function (oLine) {
                  return !oLine.isSystemLine;
                });

                if (oMainLine) {
                  var fPrevDeducted = parseFloat(oMainLine.taxDeducted) || 0;
                  var fCurrentAmount = parseFloat(oMainLine.amountDC) || 0;
                  var fGrossAmount = fCurrentAmount + fPrevDeducted;

                  oMainLine.amountDC = (fGrossAmount - fTaxAmount).toFixed(2);
                  oMainLine.taxDeducted = fTaxAmount;

                  console.log(
                    "[Main] Recipient split gross",
                    fGrossAmount.toFixed(2),
                    "into net",
                    oMainLine.amountDC,
                    "+ tax",
                    fTaxAmount.toFixed(2),
                    "using Tax GL",
                    sTaxGL,
                  );

                  var sTaxCode = String(oMainLine.taxCode || "").trim();
                  var sTradingPartner = String(
                    oMainLine.tradingPartner || "",
                  ).trim();

                  // The Tax GL line must sit on the SAME side as the
                  // main line (net + tax = gross). Recipient's main
                  // line direction depends on transaction type (AP/AR),
                  // so the tax line's debitCredit must be copied from
                  // it rather than left blank — a blank value falls
                  // into the Credit bucket in _recalculateRecipientBalance,
                  // which only happens to match when the main line is
                  // itself Credit (as on the Initiator side).
                  var sMainDC = String(oMainLine.debitCredit || "").trim();

                  var iTaxLineIndexAfter = aLinesAfter.findIndex(function (
                    oLine,
                  ) {
                    return oLine.isTaxGLLine === true;
                  });

                  if (iTaxLineIndexAfter >= 0) {
                    // Existing Tax GL line → UPDATE
                    aLinesAfter[iTaxLineIndexAfter].glAccount = sTaxGL;
                    aLinesAfter[iTaxLineIndexAfter].amountDC =
                      fTaxAmount.toFixed(2);
                    aLinesAfter[iTaxLineIndexAfter].tradingPartner =
                      sTradingPartner;
                    aLinesAfter[iTaxLineIndexAfter].taxCode = sTaxCode;
                    aLinesAfter[iTaxLineIndexAfter].debitCredit = sMainDC;

                  } else {
                    // No Tax GL line → CREATE
                    aLinesAfter.push({
                      rowNum: aLinesAfter.length + 1,
                      isSystemLine: true,
                      isTaxGLLine: true,
                      debitCredit: sMainDC,
                      glAccount: sTaxGL,
                      businessPartner: "",
                      amountDC: fTaxAmount.toFixed(2),
                      taxCode: sTaxCode,
                      tradingPartner: sTradingPartner,
                      partnerPrCtr: "",
                      wbsElement: "",
                      costCenter: "",
                      profitCenter: "",
                      internalOrder: "",
                      personnel: "",
                      contract: "",
                      contractType: "",
                      assignment: "",
                      itemText: "Tax",
                      lineRef1: "",
                      lineRef2: "",
                      lineRef3: "",
                      taxAmount: "0.00",
                    });
                  }

                  oModel.setProperty("/recipientLines", aLinesAfter);
                  that._recalculateRecipientBalance();
                }
              }

              // Reuse the same document reference — do not overwrite
              // with a new one unless SAP itself returns the same id.
              oModel.setProperty(
                "/workflow/intercoRef",
                oResult.accountingdocument_temp || sExistingDocId,
              );

              oModel.setProperty("/recipientValidation", {
                visible: true,
                state: "Success",
                text: "SAP validation successful. No errors were returned.",
              });

              MessageBox.success(
                "SAP validation successful.\n\n" +
                  "Draft Document: " +
                  (oResult.accountingdocument_temp || sExistingDocId),
              );
            })
            .catch(function (oError) {
              console.error("[Main] SAP Recipient Simulation failed:", oError);

              oModel.setProperty("/appState/isBusy", false);

              oModel.setProperty("/recipientValidation", {
                visible: true,
                state: "Error",
                text: "SAP validation failed.",
              });

              MessageBox.error(
                "SAP validation failed.\n\n" +
                  (oError && oError.message
                    ? oError.message
                    : "An unexpected error occurred."),
              );
            });
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
        var that = this;

        var oModel = this.getView().getModel();

        // ---------------------------------------------------------
        // 1. Run existing UI validation first
        // ---------------------------------------------------------
        var oHeader = oModel.getProperty("/headerData") || {};
        var aInitiatorLines = oModel.getProperty("/initiatorLines") || [];

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
        var fTaxAmount = parseFloat(oHeader.taxAmount) || 0;

        if (fTaxAmount > 0 && !oHeader.initiatorTaxCode) {
          MessageBox.error(
            "Tax Code is required when a Tax Amount is entered.",
          );
          return;
        }

        // At least one user line
        if (aUserLines.length === 0) {
          MessageBox.error("At least one G/L line item must be entered.");
          return;
        }

        // Line validation
        for (var i = 0; i < aUserLines.length; i++) {
          var oLine = aUserLines[i];

          if (!oLine.glAccount || oLine.glAccount === "—") {
            MessageBox.error("Line " + (i + 2) + ": G/L Account is missing.");

            return;
          }

          if (!oLine.amountDC || parseFloat(oLine.amountDC) === 0) {
            MessageBox.error(
              "Line " + (i + 2) + ": Amount must be greater than zero.",
            );

            return;
          }
        }

        // // Balance validation
        // var oBalance = oModel.getProperty("/initiatorBalance");

        // if (!oBalance || !oBalance.isBalanced) {

        //     MessageBox.error(
        //         "Document is not in balance. Net difference: " +
        //         (oBalance ? oBalance.netAmount : "0.00")
        //     );

        //     return;
        // }

        // ---------------------------------------------------------
        // 2. UI validation passed
        // ---------------------------------------------------------
        oModel.setProperty("/appState/isBusy", true);

        oModel.setProperty("/initiatorValidation", {
          visible: true,
          state: "Information",
          text: "Validating document in SAP...",
        });

        // ---------------------------------------------------------
        // 3. Resolve existing draft reference
        //    First Validate → empty → create new draft header.
        //    Subsequent Validates → reuse the same draft (no new POST).
        // ---------------------------------------------------------
        var sExistingDocId = oModel.getProperty("/workflow/intercoRef") || "";

        if (!sExistingDocId || sExistingDocId === "[NEW — assigned on save]") {
          sExistingDocId = "";
        }

        // ---------------------------------------------------------
        // 4. Call MasterDataService with the lines as entered.
        //    Recipient lines are excluded at this stage ([] passed).
        //    Recipient processing will be implemented separately.
        // ---------------------------------------------------------
        MasterDataService.saveDraftAndSimulate(
          oHeader,
          aInitiatorLines,
          [],
          sExistingDocId,
          "I",
        )

          .then(function (oResult) {
            console.log("[Main] SAP Simulation successful:", oResult);
            oModel.setProperty("/appState/isBusy", false);

            // ---------------------------------------------------------
            // Once SAP Simulate returns the Tax GL account, split the
            // entered gross amount into Net GL Amount + Tax Amount:
            //   BP Clearing (gross) = Main GL (net) + Tax GL (tax)
            // Re-validating (unchanged or edited tax amount) must not
            // double-subtract, so any previous deduction is added back
            // before the current tax amount is applied.
            // ---------------------------------------------------------
            var sTaxGL = String(
              (oResult.result && oResult.result.tax_gl) || "",
            ).trim();

            if (sTaxGL && fTaxAmount > 0) {
              var aLinesAfter = oModel.getProperty("/initiatorLines") || [];

              var oMainLine = aLinesAfter.find(function (oLine) {
                return !oLine.isSystemLine;
              });

              if (oMainLine) {
                var fPrevDeducted = parseFloat(oMainLine.taxDeducted) || 0;
                var fCurrentAmount = parseFloat(oMainLine.amountDC) || 0;
                var fGrossAmount = fCurrentAmount + fPrevDeducted;

                oMainLine.amountDC = (fGrossAmount - fTaxAmount).toFixed(2);
                oMainLine.taxDeducted = fTaxAmount;

                console.log(
                  "[Main] Split gross",
                  fGrossAmount.toFixed(2),
                  "into net",
                  oMainLine.amountDC,
                  "+ tax",
                  fTaxAmount.toFixed(2),
                  "using Tax GL",
                  sTaxGL,
                );

                var sTaxCode = String(oMainLine.taxCode || "").trim();
                var sTradingPartner = String(
                  oMainLine.tradingPartner || "",
                ).trim();

                // The Tax GL line must sit on the SAME side as the main
                // line (net + tax = gross), so its debitCredit is copied
                // from the main line rather than hardcoded — a hardcoded
                // value only balances when it happens to match the main
                // line's own direction (see the equivalent Recipient-side
                // fix in onRecipientValidate).
                var sMainDC = String(oMainLine.debitCredit || "").trim();

                var iTaxLineIndexAfter = aLinesAfter.findIndex(function (
                  oLine,
                ) {
                  return oLine.isTaxGLLine === true;
                });

                if (iTaxLineIndexAfter >= 0) {
                  // Existing Tax GL line → UPDATE
                  aLinesAfter[iTaxLineIndexAfter].glAccount = sTaxGL;
                  aLinesAfter[iTaxLineIndexAfter].amountDC =
                    fTaxAmount.toFixed(2);
                  aLinesAfter[iTaxLineIndexAfter].tradingPartner =
                    sTradingPartner;
                  aLinesAfter[iTaxLineIndexAfter].taxCode = sTaxCode;
                  aLinesAfter[iTaxLineIndexAfter].debitCredit = sMainDC;

                } else {
                  // No Tax GL line → CREATE
                  aLinesAfter.push({
                    rowNum: aLinesAfter.length + 1,
                    isSystemLine: true,
                    isTaxGLLine: true,
                    debitCredit: sMainDC,
                    glAccount: sTaxGL,
                    businessPartner: "",
                    amountDC: fTaxAmount.toFixed(2),
                    taxCode: sTaxCode,
                    tradingPartner: sTradingPartner,
                    partnerPrCtr: "",
                    wbsElement: "",
                    costCenter: "",
                    profitCenter: "",
                    internalOrder: "",
                    personnel: "",
                    contract: "",
                    contractType: "",
                    assignment: "",
                    itemText: "Tax",
                    lineRef1: "",
                    lineRef2: "",
                    lineRef3: "",
                    taxAmount: "0.00",
                  });
                }

                oModel.setProperty("/initiatorLines", aLinesAfter);
                that._recalculateBalance();
              }
            }

            // Store temporary document number
            oModel.setProperty(
              "/workflow/intercoRef",
              oResult.accountingdocument_temp || "",
            );

            // Mark validation successful
            oModel.setProperty("/initiatorValidation", {
              visible: true,
              state: "Success",
              text: "SAP validation successful. " + "No errors were returned.",
            });

            MessageBox.success(
              "SAP validation successful.\n\n" +
                "Draft Document: " +
                (oResult.accountingdocument_temp || "—"),
            );
          })

          .catch(function (oError) {
            console.error("[Main] SAP Simulation failed:", oError);

            oModel.setProperty("/appState/isBusy", false);

            oModel.setProperty("/initiatorValidation", {
              visible: true,
              state: "Error",
              text: "SAP validation failed.",
            });

            MessageBox.error(
              "SAP validation failed.\n\n" +
                (oError && oError.message
                  ? oError.message
                  : "An unexpected error occurred."),
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
        this._persistDraftChanges();
      },

      // Shared by the manual "Save Draft" button (onSaveDraft) and the
      // "unsaved changes" prompt shown from onCancel (Back), so both paths
      // persist identically and update the unsaved-changes baseline the
      // same way. fnOnSuccess, if given, only runs after a successful save
      // (onCancel uses it to navigate back once the save has landed).
      _persistDraftChanges: function (fnOnSuccess) {
        var oModel = this.getView().getModel();
        var that = this;

        // Guard against a double-click firing two saves before the
        // busy overlay blocks input (same real-backend call as
        // onInitiatorValidate, so avoid the same race here).
        if (oModel.getProperty("/appState/isBusy")) {
          return;
        }

        // ---------------------------------------------------------
        // Save Draft persists whatever has been entered so far —
        // it does not require the full field validation that
        // onInitiatorValidate enforces before calling Simulate.
        // ---------------------------------------------------------
        var oHeader = oModel.getProperty("/headerData") || {};
        var aInitiatorLines = oModel.getProperty("/initiatorLines") || [];
        var aRecipientLines = oModel.getProperty("/recipientLines") || [];

        oModel.setProperty("/appState/isBusy", true);

        // ---------------------------------------------------------
        // Reuse the existing draft reference if one already exists
        // (same idempotency rule as onInitiatorValidate): first save
        // creates the header, later saves update it.
        // ---------------------------------------------------------
        var sExistingDocId = oModel.getProperty("/workflow/intercoRef") || "";

        if (!sExistingDocId || sExistingDocId === "[NEW — assigned on save]") {
          sExistingDocId = "";
        }

        // Last argument (bSkipSimulate = true) skips the RAP Simulate
        // call — a plain draft save only needs the header/items saved.
        MasterDataService.saveDraftAndSimulate(
          oHeader,
          aInitiatorLines,
          [],
          sExistingDocId,
          "I",
          true,
        )
          .then(function (oResult) {
            // ---------------------------------------------------------
            // Save Draft persists "whatever has been entered so far" on
            // BOTH sides, matching the app's dual GL Coding nature (see
            // Header Data → Initiator/Recipient Company Code selection).
            // Once a Recipient Company Code is chosen, its GL lines must
            // be saved too — not just the Initiator's. Reuse the same
            // draft (docId from the call above) so saveDraftAndSimulate_RES
            // hits its "reuse existing document" branch, which only
            // clears/replaces "R"-indicator items and leaves the
            // Initiator items just saved above untouched.
            // ---------------------------------------------------------
            if (!oHeader.recipientCC) {
              return oResult;
            }

            return MasterDataService.saveDraftAndSimulate_RES(
              oHeader,
              [],
              aRecipientLines,
              oResult.accountingdocument_temp,
              "R",
              true,
            ).then(function () {
              return oResult;
            });
          })
          .then(function (oResult) {
            console.log("[Main] Save Draft successful:", oResult);
            oModel.setProperty("/appState/isBusy", false);

            oModel.setProperty(
              "/workflow/status",
              Constants.WORKFLOW_STATUS.DRAFT,
            );
            oModel.setProperty("/workflow/statusState", "Warning");

            oModel.setProperty(
              "/workflow/intercoRef",
              oResult.accountingdocument_temp || "",
            );

            MessageToast.show(
              "Draft saved successfully. Document: " +
                (oResult.accountingdocument_temp || "—"),
            );

            // Re-snapshot the now-saved state as the new "unsaved changes"
            // baseline, so a later Back click only prompts for edits made
            // after this save.
            that._armDraftDirtyTracking();

            if (typeof fnOnSuccess === "function") {
              fnOnSuccess();
            }
          })
          .catch(function (oError) {
            console.error("[Main] Save Draft failed:", oError);

            oModel.setProperty("/appState/isBusy", false);

            // Nothing was actually persisted — the baseline is left as-is,
            // so a later Back click still recognizes this as unsaved. Do
            // NOT call fnOnSuccess: the caller (onCancel) must stay on the
            // form since the save didn't actually happen.

            MessageBox.error(
              "Save Draft failed.\n\n" +
                (oError && oError.message
                  ? oError.message
                  : "An unexpected error occurred."),
            );
          });
      },

      _validateRequiredFields: function () {
        var oModel = this.getView().getModel();
        var oHeader = oModel.getProperty("/headerData");
        var bValid = true;

        var aChecks = [
          {
            state: "initiatorCCState",
            test: !!(oHeader.initiatorCC || "").trim(),
          },
          {
            state: "recipientBPState",
            test: !!(oHeader.recipientBP || "").trim(),
          },
          {
            state: "recipientCCState",
            test: !!(oHeader.recipientCC || "").trim(),
          },
          {
            state: "documentDateState",
            test: !!(oHeader.documentDate || "").trim(),
          },
          {
            state: "postingDateState",
            test: !!(oHeader.postingDate || "").trim(),
          },
          { state: "referenceState", test: !!(oHeader.reference || "").trim() },
          {
            state: "headerTextState",
            test: !!(oHeader.headerText || "").trim(),
          },
        ];

        aChecks.forEach(function (o) {
          oModel.setProperty(
            "/headerData/" + o.state,
            o.test ? "None" : "Error",
          );
          if (!o.test) {
            bValid = false;
          }
        });

        var fNet = parseFloat(oHeader.netAmount) || 0;
        oModel.setProperty(
          "/headerData/netAmountState",
          fNet > 0 ? "None" : "Error",
        );
        if (fNet <= 0) {
          bValid = false;
        }

        return bValid;
      },

      onSubmitWorkflow: function () {
        var oModel = this.getView().getModel();

        if (!this._validateRequiredFields()) {
          MessageBox.error(
            "Please fill in all required fields before submitting.",
          );
          return;
        }

        var oBalance = oModel.getProperty("/initiatorBalance");

        if (!oBalance.isBalanced) {
          MessageBox.error(
            "Cannot submit: Document debits and credits must balance.",
          );
          return;
        }

        MessageBox.confirm(
          "Submit this intercompany document for posting in SAP?",
          {
            onClose: function (sAction) {
              if (sAction !== MessageBox.Action.OK) {
                return;
              }

              oModel.setProperty("/appState/isBusy", true);

              var oHeader = oModel.getProperty("/headerData");
              var aInitiatorLines = oModel.getProperty("/initiatorLines") || [];
              var aRecipientLines = oModel.getProperty("/recipientLines") || [];
              console.log("Header for Submit:", oHeader);
              console.log("Initiator Lines:", aInitiatorLines);
              console.log("Recipient Lines:", aRecipientLines);

              MasterDataService.submitIntercoDocument(
                oHeader,
                aInitiatorLines,
                aRecipientLines,
              )
                .then(function (oResult) {
                  oModel.setProperty("/appState/isBusy", false);
                  oModel.setProperty("/appState/isHeaderEditable", false);
                  oModel.setProperty("/appState/isRecipientEditable", true);
                  oModel.setProperty(
                    "/workflow/status",
                    Constants.WORKFLOW_STATUS.SUBMITTED,
                  );
                  oModel.setProperty("/workflow/statusState", "Success");
                  oModel.setProperty(
                    "/workflow/intercoRef",
                    oResult.accountingdocument_temp || "POSTED",
                  );
                  oModel.setProperty(
                    "/workflow/initiatorLineCount",
                    aInitiatorLines.length,
                  );
                  MessageBox.success(
                    "Intercompany document posted successfully in SAP.\n\n" +
                      "Document reference: " +
                      (oResult.accountingdocument_temp || "—"),
                  );
                })
                .catch(function (oError) {
                  oModel.setProperty("/appState/isBusy", false);
                  MessageBox.error(
                    "Submission failed:\n\n" +
                      (oError && oError.message
                        ? oError.message
                        : "An unexpected error occurred."),
                  );
                });
            },
          },
        );
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
          },
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

        console.log("Search Initiator Company Code:", sValue);
      },

      onRecipientCompanyCodeTokenUpdate: function (oEvent) {
        var oModel = this.getView().getModel();
        var aTokens = oEvent.getSource().getTokens();

        var sValue = "";

        if (aTokens.length > 0) {
          sValue = aTokens[0].getKey() || aTokens[0].getText();
        }

        oModel.setProperty("/search/recCompanyCode", sValue);

        console.log("Search Recipient Company Code:", sValue);
      },

      // search filter
      onGoSearch: function () {
        var oModel = this.getView().getModel();

        var sInitiatorCC = (oModel.getProperty("/search/in_companycode") || "")
          .trim()
          .toUpperCase();

        var sRecipientCC = (oModel.getProperty("/search/rec_companycode") || "")
          .trim()
          .toUpperCase();

        var sInAccDoc = (oModel.getProperty("/search/in_accountingdocument") || "")
          .trim();

        var sRecAccDoc = (oModel.getProperty("/search/rec_accountingdocument") || "")
          .trim();

        var aCreatedBy = oModel.getProperty("/search/createdby") || [];

        var aRecPreparer = oModel.getProperty("/search/rec_preparer") || [];

        var aApprovalStatusCodes =
          oModel.getProperty("/search/approval_status_codes") || [];

        console.log("=================================");
        console.log("IC SEARCH");
        console.log("Initiator Company Code:", sInitiatorCC);
        console.log("Recipient Company Code:", sRecipientCC);
        console.log("Initiator Accounting Document:", sInAccDoc);
        console.log("Recipient Accounting Document:", sRecAccDoc);
        console.log("Created By:", aCreatedBy);
        console.log("Recipient Preparer:", aRecPreparer);
        console.log("Approval Status:", aApprovalStatusCodes);
        console.log("=================================");

        var oFilters = {
          in_companycode: sInitiatorCC,
          rec_companycode: sRecipientCC,
          in_accountingdocument: sInAccDoc,
          rec_accountingdocument: sRecAccDoc,
          createdby: aCreatedBy,
          rec_preparer: aRecPreparer,
          approval_status_codes: aApprovalStatusCodes,
        };

        this._loadJournalEntries(oFilters);
      },

      // ─── Download Template ─────────────────────────────────────────────────

      onUploadInitiatorTemplate: function () {
        var that = this;
        var oInput = document.createElement("input");
        oInput.type = "file";
        oInput.accept = ".xlsx";
        oInput.style.display = "none";
        document.body.appendChild(oInput);
        oInput.addEventListener("change", function () {
          document.body.removeChild(oInput);
          var oFile = oInput.files[0];
          if (!oFile) {
            return;
          }
          var oModel = that.getView().getModel();
          oModel.setProperty("/appState/isBusy", true);
          InitiatorGLTemplate.parse(oFile)
            .then(function (aNewLines) {
              oModel.setProperty("/appState/isBusy", false);
              if (!aNewLines.length) {
                MessageToast.show("No data rows found in the uploaded file.");
                return;
              }
              var aLines = oModel.getProperty("/initiatorLines") || [];
              var iNextRow = aLines.length + 1;
              aNewLines.forEach(function (oLine) {
                oLine.rowNum = iNextRow++;
                aLines.push(oLine);
              });
              oModel.setProperty("/initiatorLines", aLines);
              that._recalculateBalance();
              MessageToast.show(
                aNewLines.length + " line(s) added from template.",
              );
            })
            .catch(function (oError) {
              oModel.setProperty("/appState/isBusy", false);
              MessageBox.error(
                "Upload failed: " + (oError.message || String(oError)),
              );
            });
        });
        oInput.click();
      },

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
      onUploadRecipientTemplate: function () {
        var that = this;

        var oInput = document.createElement("input");
        oInput.type = "file";
        oInput.accept = ".xlsx";
        oInput.style.display = "none";

        document.body.appendChild(oInput);

        oInput.addEventListener("change", function () {
          var oFile = oInput.files[0];

          document.body.removeChild(oInput);

          if (!oFile) {
            return;
          }

          var oModel = that.getView().getModel();

          oModel.setProperty("/appState/isBusy", true);

          RecipientGLTemplate.parse(oFile)

            .then(function (aNewLines) {
              oModel.setProperty("/appState/isBusy", false);

              if (!aNewLines.length) {
                MessageToast.show("No data rows found in the uploaded file.");

                return;
              }

              // Existing Recipient lines
              var aLines = oModel.getProperty("/recipientLines") || [];

              // Continue row numbering
              var iNextRow = aLines.length + 1;

              aNewLines.forEach(function (oLine) {
                oLine.rowNum = iNextRow++;

                aLines.push(oLine);
              });

              // Update model
              oModel.setProperty("/recipientLines", aLines);

              // Recalculate Recipient balance
              that._recalculateRecipientBalance();

              MessageToast.show(
                aNewLines.length + " line(s) added from template.",
              );
            })

            .catch(function (oError) {
              oModel.setProperty("/appState/isBusy", false);

              MessageBox.error(
                "Upload failed: " + (oError.message || String(oError)),
              );
            });
        });

        oInput.click();
      },

      onCreateNew: function () {
        var oModel = this.getView().getModel();
        oModel.setProperty("/appState/isEditMode", true);
        oModel.setProperty("/appState/isHeaderEditable", true);
      },

      onCancel: function () {
        var that = this;
        var oApp = this.getView().byId("icAppRoot");

        function leaveForm() {
          // Leaving the draft edit form — stop tracking so it doesn't
          // misfire later against a stale baseline.
          that._bDraftDirtyTrackingActive = false;
          if (oApp) {
            oApp.back();
          }
        }

        if (this._hasDraftUnsavedChanges()) {
          MessageBox.warning("This draft has unsaved changes. Save them now?", {
            actions: [MessageBox.Action.YES, MessageBox.Action.NO],
            emphasizedAction: MessageBox.Action.YES,
            onClose: function (sAction) {
              if (sAction === MessageBox.Action.YES) {
                // Only leave the form once the save actually succeeds —
                // _persistDraftChanges' own error handling keeps the user
                // on the form (with the failure message) otherwise.
                that._persistDraftChanges(leaveForm);
              } else {
                leaveForm();
              }
            },
          });
          return;
        }

        leaveForm();
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
          },
        });
      },

      // onSubmitToRecipient: function () {
      //   var that = this;
      //   var oModel = this.getView().getModel();

      //   if (!this._validateRequiredFields()) {
      //     MessageBox.error(
      //       "Please fill in all required fields before submitting.",
      //     );
      //     return;
      //   }

      //   var oBalance = oModel.getProperty("/initiatorBalance");
      //   if (!oBalance.isBalanced) {
      //     MessageBox.error(
      //       "Cannot submit: Initiator GL lines debits and credits must balance.",
      //     );
      //     return;
      //   }

      //   MessageBox.confirm(
      //     "Submit initiator data and send to recipient for completion?",
      //     {
      //       onClose: function (sAction) {
      //         if (sAction !== MessageBox.Action.OK) {
      //           return;
      //         }

      //         oModel.setProperty("/appState/isBusy", true);

      //         var oHeader = oModel.getProperty("/headerData");
      //         var aInitiatorLines = oModel.getProperty("/initiatorLines") || [];

      //         // Reuse the SAME accountingdocument_temp if Initiator
      //         // Validate already created one — Submit must never spin
      //         // up a second document for the same workflow.
      //         var sExistingDocId =
      //           oModel.getProperty("/workflow/intercoRef") || "";
      //         if (
      //           !sExistingDocId ||
      //           sExistingDocId === "[NEW — assigned on save]"
      //         ) {
      //           sExistingDocId = "";
      //         }

      //         MasterDataService.submitIntercoDocument(
      //           oHeader,
      //           aInitiatorLines,
      //           [],
      //           sExistingDocId,
      //         )
      //           .then(function (oResult) {
      //             oModel.setProperty("/appState/isBusy", false);
      //             oModel.setProperty("/appState/isHeaderEditable", false);
      //             oModel.setProperty("/appState/isRecipientEditable", true);
      //             oModel.setProperty(
      //               "/workflow/status",
      //               Constants.WORKFLOW_STATUS.SUBMITTED,
      //             );
      //             oModel.setProperty("/workflow/statusState", "Success");
      //             oModel.setProperty(
      //               "/workflow/intercoRef",
      //               oResult.accountingdocument_temp || "",
      //             );
      //             oModel.setProperty(
      //               "/workflow/initiatorLineCount",
      //               aInitiatorLines.length,
      //             );
      //             MessageBox.success(
      //               "Initiator data saved to SAP.\n\n" +
      //                 "Document reference: " +
      //                 (oResult.accountingdocument_temp || "—") +
      //                 "\n\nPlease complete the Recipient GL lines and click Post.",
      //             );
      //           })
      //           .catch(function (oError) {
      //             oModel.setProperty("/appState/isBusy", false);
      //             MessageBox.error(
      //               "Submission failed:\n\n" +
      //                 (oError && oError.message
      //                   ? oError.message
      //                   : "An unexpected error occurred."),
      //             );
      //           });
      //       },
      //     },
      //   );
      // },


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

    MessageBox.confirm(
        "Submit initiator data and send to recipient for completion?",
        {
            onClose: function (sAction) {
                if (sAction !== MessageBox.Action.OK) {
                    return;
                }
                that._openSubmitCommentDialog();
            },
        },
    );
},

_openSubmitCommentDialog: function () {
    var that  = this;
    var oView = this.getView();

    oView.getModel().setProperty("/submitComment", "");

    if (!this._pSubmitCommentDialog) {
        this._pSubmitCommentDialog = Fragment.load({
            id:         oView.getId() + "--submitComment",
            name:       "ZFI_INTERCO.fragment.SubmitCommentDialog",
            controller: that,
        }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
        });
    }

    this._pSubmitCommentDialog.then(function (oDialog) {
        oDialog.open();
    });
},

onSubmitCommentContinue: function () {
    var that   = this;
    var oModel = this.getView().getModel();

    this._pSubmitCommentDialog.then(function (oDialog) {
        oDialog.close();
    });

    oModel.setProperty("/appState/isBusy", true);

    var oHeader         = oModel.getProperty("/headerData");
    var aInitiatorLines = oModel.getProperty("/initiatorLines") || [];
    var sComment        = oModel.getProperty("/submitComment") || "";   // optional, may be ""

    // Same reuse guard as before — untouched
    var sExistingDocId = oModel.getProperty("/workflow/intercoRef") || "";
    if (!sExistingDocId || sExistingDocId === "[NEW — assigned on save]") {
        sExistingDocId = "";
    }

    MasterDataService.submitIntercoDocument(
        oHeader,
        aInitiatorLines,
        [],
        sExistingDocId,
        sComment,           // NEW — 5th param, optional, appended at the end
    )
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
},

      onPostDocument: function () {
        var that = this;
        var oModel = this.getView().getModel();
        var sDocId = oModel.getProperty("/workflow/intercoRef");

        if (!sDocId) {
          MessageBox.error(
            "No document reference found. Please submit initiator data first.",
          );
          return;
        }
        
        var oBalance = oModel.getProperty("/recipientBalance");
        if (!oBalance.isBalanced) {
          MessageBox.error(
            "Cannot post: Recipient GL lines debits and credits must balance.",
          );
          return;
        }
 

        MessageBox.confirm("Post this intercompany document in SAP?", {
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) {
              return;
            }

            that._openPostCommentDialog();
          },
        });
      },

      _openPostCommentDialog: function () {
        var that  = this;
        var oView = this.getView();

        oView.getModel().setProperty("/postComment", "");

        if (!this._pPostCommentDialog) {
          this._pPostCommentDialog = Fragment.load({
            id:         oView.getId() + "--postComment",
            name:       "ZFI_INTERCO.fragment.PostCommentDialog",
            controller: that,
          }).then(function (oDialog) {
            oView.addDependent(oDialog);
            return oDialog;
          });
        }

        this._pPostCommentDialog.then(function (oDialog) {
          oDialog.open();
        });
      },

      onPostCommentContinue: function () {
        var oModel = this.getView().getModel();
        var sDocId = oModel.getProperty("/workflow/intercoRef");

        this._pPostCommentDialog.then(function (oDialog) {
          oDialog.close();
        });

        oModel.setProperty("/appState/isBusy", true);

        var iInitiatorCount =
          oModel.getProperty("/workflow/initiatorLineCount") || 0;
        var oHeader = oModel.getProperty("/headerData");
        var aRecipientLines = oModel.getProperty("/recipientLines") || [];
        var sComment = oModel.getProperty("/postComment") || ""; // optional, may be ""

        MasterDataService.submitRecipientLines(
          sDocId,
          oHeader,
          aRecipientLines,
          iInitiatorCount,
          sComment, // NEW — 5th param, optional, appended at the end
        )
          .then(function (oResult) {
            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/appState/isRecipientEditable", false);
            oModel.setProperty("/workflow/status", "Posted");
            oModel.setProperty("/workflow/statusState", "Success");
            oModel.setProperty(
              "/workflow/intercoRef",
              oResult.accountingdocument_temp || sDocId,
            );
            var sIniDoc = (oResult.in_accountingdocument || "")
              .replace(/<\/$/, "")
              .trim();
            var sRecDoc = (oResult.rec_accountingdocument || "")
              .replace(/<\/$/, "")
              .trim();
            MessageBox.success(
              "Intercompany document posted successfully.\n\n" +
                "Initiator: " +
                (sIniDoc || "—") +
                "\n" +
                "Recipient: " +
                (sRecDoc || "—"),
            );
          })
          .catch(function (oError) {
            oModel.setProperty("/appState/isBusy", false);
            MessageBox.error(
              "Post failed: " +
                (oError && oError.message
                  ? oError.message
                  : String(oError)),
            );
          });
      },

      onSubmitToApprove: function () {
    
      var oModel = this.getView().getModel();
        var sDocId = oModel.getProperty("/workflow/intercoRef");

        if (!sDocId) {
          MessageBox.error(
            "No document reference found. Please submit initiator data first.",
          );
          return;
        }

        var oBalance = oModel.getProperty("/recipientBalance");
        // if (!oBalance.isBalanced) {
        //   MessageBox.error(
        //     "Cannot post: Recipient GL lines debits and credits must balance.",
        //   );
        //   return;
        // }

        MessageBox.confirm("Submit this intercompany document to approval?", {
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) {
              return;
            }

            oModel.setProperty("/appState/isBusy", true);

            var iInitiatorCount =
              oModel.getProperty("/workflow/initiatorLineCount") || 0;
            var oHeader = oModel.getProperty("/headerData");
            var aRecipientLines = oModel.getProperty("/recipientLines") || [];

            MasterDataService.submitToApproval(
              sDocId,
              oHeader,
              aRecipientLines,
              iInitiatorCount,
            )
              .then(function (oResult) {
                oModel.setProperty("/appState/isBusy", false);
                oModel.setProperty("/appState/isRecipientEditable", false);
                oModel.setProperty("/workflow/status", "Posted");
                oModel.setProperty("/workflow/statusState", "Success");
                oModel.setProperty(
                  "/workflow/intercoRef",
                  oResult.accountingdocument_temp || sDocId,
                );
                var sIniDoc = (oResult.in_accountingdocument || "")
                  .replace(/<\/$/, "")
                  .trim();
                var sRecDoc = (oResult.rec_accountingdocument || "")
                  .replace(/<\/$/, "")
                  .trim();
                MessageBox.success(
                  "Intercompany document posted successfully.\n\n" +
                    "Initiator: " +
                    (sIniDoc || "—") +
                    "\n" +
                    "Recipient: " +
                    (sRecDoc || "—"),
                );
              })
              .catch(function (oError) {
                oModel.setProperty("/appState/isBusy", false);
                MessageBox.error(
                  "Post failed: " +
                    (oError && oError.message
                      ? oError.message
                      : String(oError)),
                );
              });
          },
        });
      

      },

      // ─── Journal Entry Detail (Read-Only) ──────────────────────────────────

      // Navigation arrow (RowActionItem type="Navigation") press handler.
      onRowActionNavigation: function (oEvent) {
        var oRow = oEvent.getParameter("row");
        if (!oRow) { return; }
        var oContext = oRow.getBindingContext();
        if (!oContext) { return; }
        this._navigateToDetail(oContext.getObject());
      },

      // Primary navigation: fired by cellClick on journalEntriesTable.
      // cellClick provides rowBindingContext directly — most reliable approach
      // for sap.ui.table.Table regardless of whether cell content is interactive.
      onTableRowClick: function (oEvent) {
        var oRowContext = oEvent.getParameter("rowBindingContext");
        if (!oRowContext) {
          return;
        }
        this._navigateToDetail(oRowContext.getObject());
      },

      // Fallback: fired when the user clicks the Link in column 1.
      // Uses the link's own binding context (also reliable in sap.ui.table.Table).
      onOpenEntry: function (oEvent) {
        var oContext = oEvent.getSource().getBindingContext();
        if (!oContext) {
          return;
        }
        this._navigateToDetail(oContext.getObject());
      },

      _navigateToDetail: function (oRow) {
        if (!oRow) {
          return;
        }

        // RAP drafts (not yet submitted/activated) reopen directly into the
        // existing edit form instead of the read-only detail page.
        if (oRow.IsActiveEntity === false) {
          this._reopenDraftForEdit(oRow);
          return;
        }

        var oModel = this.getView().getModel();
        var oView = this.getView();

        console.log("[JE Detail] Navigating to:", oRow.accountingdocument_temp, "| IsActiveEntity:", oRow.IsActiveEntity);

        oModel.setProperty("/selectedEntry", oRow);
        oModel.setProperty("/jeItems", []);
        oModel.setProperty("/jeItemCount", 0);

        var oApp = oView.byId("icAppRoot");
        var oDetailPage = oView.byId("jeDetailPage");
        if (oApp && oDetailPage) {
          oApp.to(oDetailPage.getId());
        }

        var bIsActive = oRow.IsActiveEntity !== false;
        this._loadJEItems(oRow.accountingdocument_temp, bIsActive);
      },

      _loadJEItems: function (sDocId, bIsActive) {
        var oModel = this.getView().getModel();
        console.log("[JE Items] _loadJEItems called | sDocId:", sDocId, "| bIsActive:", bIsActive);
        if (!sDocId) {
          oModel.setProperty("/jeItems", []);
          oModel.setProperty("/jeItemCount", 0);
          return;
        }

        // Query ZC_INTERCO_JE_HEADER with $expand=_Item, filtering only by
        // accountingdocument_temp (no IsActiveEntity in filter — avoids backend
        // issues with IsActiveEntity inside collection+expand queries).
        // The response may contain both active and draft records; we prefer the
        // active entity's _Item, falling back to draft.
        var sServiceRoot =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
        var sDocIdSafe = String(sDocId).replace(/'/g, "");

        var sUrl =
          sServiceRoot +
          "ZC_INTERCO_JE_HEADER?$filter=accountingdocument_temp eq '" +
          sDocIdSafe +
          "'&$expand=_Item";

        console.log("[JE Items] URL:", sUrl);

        this._fetchAllPages(sUrl)
          .then(function (aResults) {
            // Pick active entity first, then draft
            var oRec =
              aResults.find(function (r) { return r.IsActiveEntity === true; }) ||
              aResults.find(function (r) { return r.IsActiveEntity === false; });

            var aItems = (oRec && Array.isArray(oRec._Item)) ? oRec._Item : [];
            oModel.setProperty("/jeItems", aItems);
            oModel.setProperty("/jeItemCount", aItems.length);

            if (aItems.length === 0) {
              MessageToast.show("No item details found for this journal entry.");
            }
          })
          .catch(function (oError) {
            console.error("[JE Items] Error loading JE items:", oError);
            oModel.setProperty("/jeItems", []);
            oModel.setProperty("/jeItemCount", 0);
            MessageBox.error(
              oError.message || "An unexpected error occurred.",
              { title: "Could Not Load JE Items" }
            );
          });
      },

      // ─── Reopen RAP Draft into Edit Form ───────────────────────────────────

      _reopenDraftForEdit: function (oRow) {
        var oModel = this.getView().getModel();
        var that = this;
        var sDocId = oRow.accountingdocument_temp;

        if (!sDocId) {
          MessageBox.error("This draft has no document id and cannot be reopened.");
          return;
        }

        oModel.setProperty("/appState/isBusy", true);

        MasterDataService.getDraftForEdit(sDocId)
          .then(function (oDraft) {
            // Map fully before touching busy/navigation state, so a failure
            // thrown synchronously inside the mapper leaves the current
            // model untouched and the user on the search page.
            var pCosmeticLookups = that._applyDraftToFormModel(
              oDraft.header,
              oDraft.items,
            );

            oModel.setProperty("/appState/isBusy", false);
            oModel.setProperty("/appState/isEditMode", true);

            var oApp = that.getView().byId("icAppRoot");
            var oFormPage = that.getView().byId("icFormPage");
            if (!oApp || !oFormPage) {
              MessageBox.error("icFormPage not found.");
              return;
            }
            oApp.to(oFormPage.getId());

            // Arm change-detection only once the cosmetic (non-user)
            // lookups triggered by _applyDraftToFormModel have all landed,
            // so they aren't mistaken for a user edit against the baseline.
            Promise.resolve(pCosmeticLookups).then(function () {
              that._armDraftDirtyTracking();
            });
          })
          .catch(function (oError) {
            oModel.setProperty("/appState/isBusy", false);
            MessageBox.error(
              (oError && oError.message) || "An unexpected error occurred while loading the draft.",
              { title: "Could Not Load Draft" },
            );
          });
      },

      _applyDraftToFormModel: function (oHeader, aItems) {
        var oModel = this.getView().getModel();
        var oHeaderData = oModel.getProperty("/headerData");

        if (oHeader.in_companycode !== undefined) {
          oHeaderData.initiatorCC = oHeader.in_companycode || "";
        }
        if (oHeader.rec_companycode !== undefined) {
          oHeaderData.recipientCC = oHeader.rec_companycode || "";
        }
        if (oHeader.documentreferenceid !== undefined) {
          oHeaderData.reference = oHeader.documentreferenceid || "";
        }
        if (oHeader.documentheadertext !== undefined) {
          oHeaderData.headerText = oHeader.documentheadertext || "";
        }
        if (oHeader.currencycode) {
          oHeaderData.currency = oHeader.currencycode;
        }
        if (oHeader.tax_amount !== undefined) {
          oHeaderData.taxAmount = (parseFloat(oHeader.tax_amount) || 0).toFixed(2);
        }
        if (oHeader.amount !== undefined) {
          oHeaderData.totalIntercoAmount = (parseFloat(oHeader.amount) || 0).toFixed(2);
          // /headerData/netAmount is the real user-entered input in
          // SectionDocDetails.fragment.xml (IC Net Amount); totalIntercoAmount
          // is always derived as netAmount + taxAmount (see
          // onIntercoAmountChange). The backend only stores the gross
          // "amount", so net must be back-derived here or the Net Amount
          // input would incorrectly show 0.00 after reopening a draft.
          var fGrossAmt = parseFloat(oHeader.amount) || 0;
          var fTaxAmt = parseFloat(oHeader.tax_amount) || 0;
          oHeaderData.netAmount = (fGrossAmt - fTaxAmt).toFixed(2);
        }
        if (oHeader.taxcode) {
          oHeaderData.initiatorTaxCode = oHeader.taxcode;
        }
        if (oHeader.rec_preparer !== undefined) {
          oHeaderData.recipientPreparer = oHeader.rec_preparer || "";
        }
        // Recipient Tax/VAT Code Select is only enabled when
        // isRecipientEditable && taxCodeVisible (SectionRecipientGL.fragment.xml);
        // taxCodeVisible is normally set by onIntercoAmountChange and defaults
        // to false in _initModel, so it must be restored here too.
        if (oHeader.tax_amount !== undefined) {
          oHeaderData.taxCodeVisible = (parseFloat(oHeader.tax_amount) || 0) > 0;
        }
        if (oHeader.accountingdocumenttype) {
          oHeaderData.documentTypeCode = oHeader.accountingdocumenttype;
          oHeaderData.documentType = oHeader.accountingdocumenttype;
        }
        if (oHeader.documentdate) {
          oHeaderData.documentDate = this._fromODataDate(oHeader.documentdate);
        }
        if (oHeader.postingdate) {
          oHeaderData.postingDate = this._fromODataDate(oHeader.postingdate);
          var oParsed = Helper.parseDate(oHeaderData.postingDate);
          if (oParsed) {
            oHeaderData.fiscalPeriod = String(oParsed.month).padStart(2, "0");
            oHeaderData.fiscalYear = String(oParsed.year);
          }
        }
        oModel.setProperty("/headerData", oHeaderData);
        if (oHeaderData.fiscalPeriod && oHeaderData.fiscalYear) {
          this._checkPeriodStatus(oHeaderData.fiscalPeriod, oHeaderData.fiscalYear);
        }

        // Cosmetic-only lookups (CC name/country/tax-code dropdown options) —
        // read-only calls, no reset of BP/row-0 fields (unlike
        // onInitiatorCCChange/onRecipientCCChange, which must NOT be called
        // here since they would stomp the correctly-loaded row 0).
        // Collected into aCosmeticLookups so the caller can know when these
        // (non-user) model writes have all landed — see _reopenDraftForEdit,
        // which only arms change-detection once this settles.
        var aCosmeticLookups = [];

        if (oHeaderData.initiatorCC) {
          aCosmeticLookups.push(
            MasterDataService.getCompanyCodeDetails(oHeaderData.initiatorCC).then(function (oCC) {
              oModel.setProperty("/headerData/initiatorCCName", oCC ? oCC.name : "");
              oModel.setProperty("/headerData/initiatorCountry", oCC ? oCC.country : "");
              if (oCC && oCC.country) {
                return MasterDataService.getTaxCodesByCountry(oCC.country).then(function (aCodes) {
                  oModel.setProperty(
                    "/referenceData/initiatorTaxCodes",
                    aCodes.filter(function (c) { return c.taxType === "A"; }),
                  );
                });
              }
            }),
          );
        }
        if (oHeaderData.recipientCC) {
          aCosmeticLookups.push(
            MasterDataService.getCompanyCodeDetails(oHeaderData.recipientCC).then(function (oCC) {
              oModel.setProperty("/headerData/recipientCCName", oCC ? oCC.name : "");
              if (oCC && oCC.country) {
                return MasterDataService.getTaxCodesByCountry(oCC.country).then(function (aCodes) {
                  oModel.setProperty(
                    "/referenceData/recipientTaxCodes",
                    aCodes.filter(function (c) { return c.taxType === "V"; }),
                  );
                });
              }
            }),
          );
        }

        // items 
        var aSorted = (aItems || []).slice().sort(function (a, b) {
          return (
            (parseInt(a.referencedocumentitem, 10) || 0) -
            (parseInt(b.referencedocumentitem, 10) || 0)
          );
        });
        var aInitiatorRaw = aSorted.filter(function (it) {
          return it.initiator_recipient_ind === "I" || it.initiator_recipient_ind === "IT";
        });
        var aRecipientRaw = aSorted.filter(function (it) {
          return it.initiator_recipient_ind === "R" || it.initiator_recipient_ind === "RT";
        });

        var aInitiatorLines = this._mapDraftItems(aInitiatorRaw, "IT");
        var aRecipientLines = this._mapDraftItems(aRecipientRaw, "RT");
        if (!aInitiatorLines.length) {
          aInitiatorLines = oModel.getProperty("/initiatorLines");
        }
        if (!aRecipientLines.length) {
          aRecipientLines = oModel.getProperty("/recipientLines");
        }

        oModel.setProperty("/initiatorLines", aInitiatorLines);
        oModel.setProperty("/recipientLines", aRecipientLines);
        this._recalculateBalance();
        this._recalculateRecipientBalance();

        // ---- workflow / phase ----
        // Submit-to-Recipient/Post/Submit-to-Approve all call the RAP
        // Activate action, so a document still sitting at
        // IsActiveEntity=false should only ever be pre-submission
        // (phase 1). Recipient-item presence is still checked defensively
        // in case of a partially-completed flow that never reached Activate.
        var bHasRecipientData =
          aRecipientRaw.length > 1 ||
          (aRecipientRaw.length === 1 && aRecipientRaw[0].initiator_recipient_ind === "RT");

        oModel.setProperty("/workflow/intercoRef", String(oHeader.accountingdocument_temp));
        oModel.setProperty("/workflow/status", Constants.WORKFLOW_STATUS.DRAFT);
        oModel.setProperty("/workflow/statusState", "Warning");
        oModel.setProperty("/appState/isHeaderEditable", !bHasRecipientData);
        oModel.setProperty("/appState/isRecipientEditable", bHasRecipientData);

        return Promise.all(aCosmeticLookups);
      },

      // ─── Draft Edit: Change Detection ──────────────────────────────────────
      // Reopening an existing Draft (see _reopenDraftForEdit) arms a
      // model-level dirty check: rather than wiring a change/liveChange
      // handler onto every individual header/GL-line field (many of which
      // have none today), we hook JSONModel#setProperty once and compare
      // against a snapshot taken right after the draft finished loading.

      // Snapshots the current header/line state as the "last known saved"
      // baseline. Called once when a draft is reopened, and again after
      // every successful save (new baseline = what was just persisted).
      // The check itself only runs on demand — see _hasDraftUnsavedChanges,
      // called from onCancel (Back) — not on every field edit.
      _armDraftDirtyTracking: function () {
        var oModel = this.getView().getModel();

        this._oDraftBaseline = {
          headerData: JSON.parse(JSON.stringify(oModel.getProperty("/headerData") || {})),
          initiatorLines: JSON.parse(JSON.stringify(oModel.getProperty("/initiatorLines") || [])),
          recipientLines: JSON.parse(JSON.stringify(oModel.getProperty("/recipientLines") || [])),
        };
        this._bDraftDirtyTrackingActive = true;
      },

      // Compares the live header/line state against the snapshot taken
      // when the draft was loaded (or last saved).
      _hasDraftUnsavedChanges: function () {
        if (!this._bDraftDirtyTrackingActive || !this._oDraftBaseline) {
          return false;
        }

        var oModel = this.getView().getModel();
        var oBaseline = this._oDraftBaseline;
        var oCurrentHeader = oModel.getProperty("/headerData") || {};
        var aCurrentInitiatorLines = oModel.getProperty("/initiatorLines") || [];
        var aCurrentRecipientLines = oModel.getProperty("/recipientLines") || [];

        return (
          JSON.stringify(oCurrentHeader) !== JSON.stringify(oBaseline.headerData) ||
          JSON.stringify(aCurrentInitiatorLines) !== JSON.stringify(oBaseline.initiatorLines) ||
          JSON.stringify(aCurrentRecipientLines) !== JSON.stringify(oBaseline.recipientLines)
        );
      },

      // The backend does not persist an explicit "is system line" flag —
      // the only available signal is referencedocumentitem ordering
      // combined with initiator_recipient_ind. buildItemPayload in
      // MasterDataService.js always posts aInitiatorLines[0]/
      // aRecipientLines[0] (the immutable BP-clearing system line, which
      // onDeleteInitiatorLine/onDeleteRecipientLine both refuse to delete)
      // FIRST, i.e. as the lowest referencedocumentitem for that side.
      // aRawItems is pre-sorted ascending by referencedocumentitem by the
      // caller, so index 0 of that sorted-and-filtered array is that line.
      _mapDraftItems: function (aRawItems, sTaxIndicator) {
        return aRawItems.map(function (it, i) {
          var bIsTaxGL = it.initiator_recipient_ind === sTaxIndicator;
          var bIsLowestSeqForSide = i === 0;
          return {
            rowNum: i + 1,
            isSystemLine: bIsLowestSeqForSide || bIsTaxGL,
            isTaxGLLine: bIsTaxGL,
            debitCredit: it.debitcreditcode || "",
            glAccount: it.glaccount || "",
            businessPartner: it.business_partner || "",
            amountDC: (parseFloat(it.amountintransactioncurrency) || 0).toFixed(2),
            taxCode: it.taxcode || "",
            taxAmount: (parseFloat(it.tax_amount) || 0).toFixed(2),
            costCenter: it.costcenter || "",
            profitCenter: it.profitcenter || "",
            itemText: it.documentitemtext || "",
            assignment: it.assignmentreference || "",
            // Not persisted server-side (absent from buildItemPayload) —
            // always blank on reload.
            tradingPartner: "",
            partnerPrCtr: "",
            wbsElement: "",
            internalOrder: "",
            personnel: "",
            contract: "",
            contractType: "",
            lineRef1: "",
            lineRef2: "",
            lineRef3: "",
          };
        });
      },

      // Reverse of MasterDataService's local toODataDate(): "YYYY-MM-DD"
      // (or a full ISO timestamp) -> UI "dd.MM.yyyy", matching the
      // DatePicker valueFormat in SectionDocDetails.fragment.xml.
      _fromODataDate: function (sOData) {
        if (!sOData) {
          return "";
        }
        var m = String(sOData).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? m[3] + "." + m[2] + "." + m[1] : "";
      },

      onJEDetailBack: function () {
        this.getView().byId("icAppRoot").back();
      },
    });
  },
);
