sap.ui.define([], function () {
  "use strict";

  var _aTaxCodes = [
    { code: "", description: "No Tax", rate: 0 },
    { code: "A0", description: "Output Tax Exempt", rate: 0 },
    { code: "S0", description: "Input Tax Exempt", rate: 0 },
    { code: "V1", description: "Output Tax 15%", rate: 0.15 },
    { code: "V2", description: "Output Tax 20%", rate: 0.2 },
    { code: "V5", description: "Output Tax 5%", rate: 0.05 },
    { code: "VE", description: "Tax Exempt (EU)", rate: 0 },
  ];

  var _aClosedPeriods = ["01/2024", "02/2024"]; // simulated closed FI periods
  var _aTaxCodesCache = null; // cache for ZC_RETRIEVE_TAXCODE full list

  // ── Public service interface ─────────────────────────────────────────────
  // Every method returns a Promise. When OData is wired, replace
  // Promise.resolve(...) with ODataModel.bindList(...).requestContexts().
  // Controller call-sites use .then() and remain unchanged.

  return {
    /**
     * Fetches name, country, and currency for a single company code.
     * Called on-demand when the user selects or enters a company code.
     *
     * @param {string} sCC  Company code (e.g. "1110")
     * @returns {Promise<{companyCode, name, country, currency} | null>}
     */
    getCompanyCodeDetails: function (sCC) {
      if (!sCC) {
        return Promise.resolve(null);
      }
      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/I_CompanyCode",
          method: "GET",
          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },
          data: { $filter: "CompanyCode eq '" + sCC + "'", $top: "1" },
          success: function (oData) {
            var aResults = (oData && oData.value) || [];
            if (!aResults.length) {
              resolve(null);
              return;
            }
            var cc = aResults[0];
            resolve({
              companyCode: cc.CompanyCode,
              name: cc.CompanyCodeName,
              country: cc.Country,
              currency: cc.Currency,
            });
          },
          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "Failed to fetch company code " +
                  sCC +
                  " [" +
                  oXHR.status +
                  "]: " +
                  sError,
              ),
            );
          },
        });
      });
    },

    getCompanyCodes: function () {
      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      var sUrl =
        sRoot +
        "I_CompanyCode" +
        "?$select=CompanyCode,CompanyCodeName,Country,Currency" +
        "&$orderby=CompanyCode";

      console.log("[CompanyCode] Request URL:", sUrl);

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",

          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },

          success: function (oData) {
            var aResults = (oData && oData.value) || [];

            console.log("[CompanyCode] Loaded:", aResults.length, aResults);

            resolve(
              aResults.map(function (oItem) {
                return {
                  companyCode: oItem.CompanyCode || "",
                  name: oItem.CompanyCodeName || "",
                  country: oItem.Country || "",
                  currency: oItem.Currency || "",
                };
              }),
            );
          },

          error: function (oXHR, sStatus, sError) {
            console.error(
              "[CompanyCode] API failed:",
              oXHR.status,
              sError,
              oXHR.responseText,
            );

            reject(
              new Error(
                "Failed to load Company Codes [" + oXHR.status + "]: " + sError,
              ),
            );
          },
        });
      });
    },

    getGLAccounts: function (sCompanyCode) {
      if (!sCompanyCode) {
        return Promise.resolve([]);
      }
      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
      var sFilter = "CompanyCode eq '" + sCompanyCode + "'";
      var sUrl =
        sRoot +
        "ZIGL_DETAILS" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=GLAccount,GLAccountName,CompanyCode,ChartOfAccounts,GLAccountLongName" +
        "&$orderby=GLAccount";
      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",
          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },

          success: function (oData) {
            var aResults = (oData && oData.value) || [];

            resolve(
              aResults.map(function (oItem) {
                return {
                  GLAccount: oItem.GLAccount,
                  GLAccountName: oItem.GLAccountName,
                  CompanyCode: oItem.CompanyCode,
                  ChartOfAccounts: oItem.ChartOfAccounts,
                  GLAccountLongName:oItem.GLAccountLongName
                };
              }),
            );
          },

          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "Failed to load GL Accounts [" + oXHR.status + "] " + sError,
              ),
            );
          },
        });
      });
    },

    searchGLAccounts: function (sCompanyCode, sSearch) {
      sCompanyCode = (sCompanyCode || "").trim();
      sSearch = (sSearch || "").trim();

      if (!sCompanyCode || !sSearch) {
        return Promise.resolve([]);
      }

      var sServiceRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      var sFilter = "CompanyCode eq '" + sCompanyCode + "' and startswith(GLAccount,'" +sSearch +"')";

      var sUrl =
        sServiceRoot +
        "ZIGL_DETAILS" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=GLAccount,GLAccountName,CompanyCode,ChartOfAccounts" +
        "&$orderby=GLAccount";

      console.log("GL Account Search URL:", sUrl);

      return fetch(sUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      })
        .then(function (oResponse) {
          if (!oResponse.ok) {
            throw new Error(
              "HTTP " + oResponse.status + " " + oResponse.statusText,
            );
          }

          return oResponse.json();
        })
        .then(function (oData) {
          console.log("GL Account Search Response:", oData);

          return oData.value || [];
        });
    },

    getProfitCenters: function (sCompanyCode) {
      var oToday = new Date();

      var sToday =
        oToday.getFullYear() +
        "-" +
        String(oToday.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(oToday.getDate()).padStart(2, "0");

      if (!sCompanyCode) {
        return Promise.resolve([]);
      }

      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      // var sFilter = "CompanyCode eq '" + sCompanyCode + "'";
      // Only return Profit Centers valid today
      var sFilter =
        "ValidityStartDate le " + sToday + " and ValidityEndDate eq 9999-12-31";
      var sUrl =  sRoot + "I_ProfitCenter" + "?$filter=" + encodeURIComponent(sFilter) +
        "&$select=ProfitCenter,ProfitCenter_Text,CompanyCode,ControllingArea,ValidityEndDate,ValidityStartDate" +
        "&$orderby=ProfitCenter";

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",

          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },

          success: function (oData) {
            var aResults = (oData && oData.value) || [];

            resolve(
              aResults.map(function (oItem) {
                return {
                  profitCenter: oItem.ProfitCenter,
                  description: oItem.ProfitCenter_Text,
                  companyCode: oItem.CompanyCode,
                  ControllingArea: oItem.ControllingArea,
                  ValidityStartDate:oItem.ValidityStartDate,
                  ValidityEndDate :oItem.ValidityEndDate
                };
              }),
            );
          },

          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "Failed to load Profit Centers for Company Code " +
                  sCompanyCode +
                  " [" +
                  oXHR.status +
                  "] " +
                  sError,
              ),
            );
          },
        });
      });
    },

    // Live search-as-you-type variant of getProfitCenters: matched by
    // ProfitCenter/ProfitCenter_Text only, called on every keystroke
    // instead of client-side filtering a fully preloaded list.
    // NOTE: CompanyCode is intentionally NOT part of the filter — the
    // I_ProfitCenter data in this system always returns CompanyCode
    // as blank, so filtering on it would match nothing (this mirrors
    // why getProfitCenters never filtered on it either). The
    // sCompanyCode parameter is accepted for call-site symmetry with
    // searchCostCenters but is otherwise unused here.
    searchProfitCenters: function (sCompanyCode, sSearch) {
      sSearch = (sSearch || "").trim();

      if (!sSearch) {
        return Promise.resolve([]);
      }

      var oToday = new Date();
      var sToday =
        oToday.getFullYear() +
        "-" +
        String(oToday.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(oToday.getDate()).padStart(2, "0");

      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      var sFilter =
        "ValidityStartDate le " +
        sToday +
        " and ValidityEndDate eq 9999-12-31 and " +
        "(startswith(ProfitCenter,'" +
        sSearch +
        "') or startswith(ProfitCenter_Text,'" +
        sSearch +
        "'))";

      var sUrl =
        sRoot +
        "I_ProfitCenter" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=ProfitCenter,ProfitCenter_Text,CompanyCode,ControllingArea" +
        "&$orderby=ProfitCenter";

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",

          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },

          success: function (oData) {
            var aResults = (oData && oData.value) || [];

            resolve(
              aResults.map(function (oItem) {
                return {
                  profitCenter: oItem.ProfitCenter,
                  description: oItem.ProfitCenter_Text,
                  companyCode: oItem.CompanyCode,
                  controllingArea: oItem.ControllingArea,
                };
              }),
            );
          },

          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "Failed to search Profit Centers [" +
                  oXHR.status +
                  "] " +
                  sError,
              ),
            );
          },
        });
      });
    },

    getCostCenters: function (sCompanyCode) {
      if (!sCompanyCode) {
        return Promise.resolve([]);
      }

      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      var sFilter = "CompanyCode eq '" + sCompanyCode + "'";

      var sUrl =
        sRoot +
        "I_CostCenter" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=CostCenter,CostCenter_Text,CompanyCode,ControllingArea,ProfitCenter,ValidityEndDate,ValidityStartDate" +
        "&$orderby=CostCenter";

      console.log("[CostCenter] Request URL:", sUrl);

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",

          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },

          success: function (oData) {
            var aResults = (oData && oData.value) || [];

            console.log(
              "[CostCenter] Company Code:",
              sCompanyCode,
              "Results:",
              aResults,
            );

            resolve(
              aResults.map(function (oItem) {
                return {
                  CostCenter: oItem.CostCenter,
                  CostCenter_Text: oItem.CostCenter_Text,
                  CompanyCode: oItem.CompanyCode,
                  ControllingArea: oItem.ControllingArea,
                  ProfitCenter: oItem.ProfitCenter,
                  ValidityStartDate:oItem.ValidityStartDate,
                  ValidityEndDate : oItem.ValidityEndDate


                };
              }),
            );
          },

          error: function (oXHR, sStatus, sError) {
            console.error(
              "[CostCenter] Failed for Company Code:",
              sCompanyCode,
              oXHR.status,
              sError,
              oXHR.responseText,
            );

            reject(
              new Error(
                "Failed to load Cost Centers for Company Code " +
                  sCompanyCode +
                  " [" +
                  oXHR.status +
                  "] " +
                  sError,
              ),
            );
          },
        });
      });
    },

    // Live search-as-you-type variant of getCostCenters: scoped by
    // Company Code + a search term, called on every keystroke instead
    // of client-side filtering a fully preloaded list.
    searchCostCenters: function (sCompanyCode, sSearch) {
      sCompanyCode = (sCompanyCode || "").trim();
      sSearch = (sSearch || "").trim();

      if (!sCompanyCode || !sSearch) {
        return Promise.resolve([]);
      }

      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      var sFilter =
        "CompanyCode eq '" +
        sCompanyCode +
        "' and (startswith(CostCenter,'" +
        sSearch +
        "') or startswith(CostCenter_Text,'" +
        sSearch +
        "'))";

      var sUrl =
        sRoot +
        "I_CostCenter" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=CostCenter,CostCenter_Text,CompanyCode,ControllingArea,ProfitCenter" +
        "&$orderby=CostCenter";

      console.log("[CostCenter] Search URL:", sUrl);

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",

          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },

          success: function (oData) {
            var aResults = (oData && oData.value) || [];

            resolve(
              aResults.map(function (oItem) {
                return {
                  CostCenter: oItem.CostCenter,
                  CostCenter_Text: oItem.CostCenter_Text,
                  CompanyCode: oItem.CompanyCode,
                  ControllingArea: oItem.ControllingArea,
                  ProfitCenter: oItem.ProfitCenter,
                };
              }),
            );
          },

          error: function (oXHR, sStatus, sError) {
            console.error(
              "[CostCenter] Search failed for Company Code:",
              sCompanyCode,
              oXHR.status,
              sError,
              oXHR.responseText,
            );

            reject(
              new Error(
                "Failed to search Cost Centers for Company Code " +
                  sCompanyCode +
                  " [" +
                  oXHR.status +
                  "] " +
                  sError,
              ),
            );
          },
        });
      });
    },

    // Initial (full, company-scoped) list for the WBS Element value help
    // dialog, mirroring getCostCenters.
    getWBSElements: function (sCompanyCode) {
      sCompanyCode = (sCompanyCode || "").trim();

      if (!sCompanyCode) {
        return Promise.resolve([]);
      }

      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      var sFilter = "CompanyCode eq '" + sCompanyCode + "'";

      var sUrl =
        sRoot +
        "ZI_WBS_VALUE_HELP" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=ProjectElement,WBSElementInternalID,ProjectElementDescription,CompanyCode,ControllingArea,ProfitCenter" +
        "&$orderby=ProjectElement";

      console.log("[WBS] Request URL:", sUrl);

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",

          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },

          success: function (oData) {
            var aResults = (oData && oData.value) || [];

            resolve(
              aResults.map(function (oItem) {
                return {
                  ProjectElement: oItem.ProjectElement,
                  WBSElementInternalID: oItem.WBSElementInternalID,
                  ProjectElementDescription: oItem.ProjectElementDescription,
                  CompanyCode: oItem.CompanyCode,
                  ProfitCenter:oItem.ProfitCenter,
                  ControllingArea :oItem.ControllingArea

                };
              }),
            );
          },

          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "Failed to load WBS Elements for Company Code " +
                  sCompanyCode +
                  " [" +
                  oXHR.status +
                  "] " +
                  sError,
              ),
            );
          },
        });
      });
    },

    // Live search-as-you-type variant of getWBSElements: scoped by
    // Company Code + a search term, called on every keystroke instead
    // of client-side filtering a fully preloaded list.
    searchWBSElements: function (sCompanyCode, sSearch) {
      sCompanyCode = (sCompanyCode || "").trim();
      sSearch = (sSearch || "").trim();

      if (!sCompanyCode || !sSearch) {
        return Promise.resolve([]);
      }

      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      var sFilter =
        "CompanyCode eq '" +
        sCompanyCode +
        "' and (startswith(ProjectElement,'" +
        sSearch +
        "') or startswith(ProjectElementDescription,'" +
        sSearch +
        "'))";

      var sUrl =
        sRoot +
        "ZI_WBS_VALUE_HELP" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=ProjectElement,WBSElementInternalID,ProjectElementDescription,CompanyCode" +
        "&$orderby=ProjectElement";

      console.log("[WBS] Search URL:", sUrl);

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",

          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },

          success: function (oData) {
            var aResults = (oData && oData.value) || [];

            resolve(
              aResults.map(function (oItem) {
                return {
                  ProjectElement: oItem.ProjectElement,
                  WBSElementInternalID: oItem.WBSElementInternalID,
                  ProjectElementDescription: oItem.ProjectElementDescription,
                  CompanyCode: oItem.CompanyCode,
                };
              }),
            );
          },

          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "Failed to search WBS Elements for Company Code " +
                  sCompanyCode +
                  " [" +
                  oXHR.status +
                  "] " +
                  sError,
              ),
            );
          },
        });
      });
    },

    /**
     * Returns all tax codes with their rates.
     * OData future: GET /TaxCodes
     *
     * @returns {Promise<Array<{code: string, description: string, rate: number}>>}
     */
    getTaxCodes: function () {
      return Promise.resolve(_aTaxCodes.slice());
    },

    getAllTaxCodes: function () {
      var USE_LIVE_API = true;
      if (!USE_LIVE_API) {
        return Promise.resolve(_aTaxCodes.slice());
      }
      if (_aTaxCodesCache) {
        return Promise.resolve(_aTaxCodesCache.slice());
      }
      return new Promise(function (resolve, reject) {
        var sRoot =
          "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
        jQuery.ajax({
          url: sRoot + "ZC_RETRIEVE_TAXCODE",
          method: "GET",
          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },
          success: function (oData) {
            var aRaw = (oData && oData.value) || [];
            if (aRaw.length > 0) {
              console.log(
                "[TaxCodes] Raw first record keys:",
                Object.keys(aRaw[0]),
                aRaw[0],
              );
            }
            _aTaxCodesCache = aRaw.map(function (item) {
              return {
                code: item.TaxCode,
                description: item.TaxCodeDescription,
                country: item.Country,
                rate: 0,
              };
            });
            console.log(
              "[TaxCodes] Loaded " +
                _aTaxCodesCache.length +
                " records from ZC_RETRIEVE_TAXCODE",
              _aTaxCodesCache,
            );
            resolve(_aTaxCodesCache.slice());
          },
          error: function (oXHR, sStatus, sError) {
            console.error(
              "[TaxCodes] ZC_RETRIEVE_TAXCODE failed:",
              oXHR.status,
              sError,
              oXHR.responseText,
            );
            reject(
              new Error(
                "Failed to fetch tax codes [" +
                  oXHR.status +
                  " " +
                  sError +
                  "]",
              ),
            );
          },
        });
      });
    },

    getTaxCodesByCountry: function (sCountry) {
      if (!sCountry) {
        return Promise.resolve([]);
      }
      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
      var sUrl =
        sRoot +
        "ZC_RETRIEVE_TAXCODE?$filter=" +
        encodeURIComponent("Country eq '" + sCountry + "'");
      return new Promise(function (resolve) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",
          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },
          success: function (oData) {
            var aItems = (oData && oData.value) || [];
            resolve(
              aItems.map(function (item) {
                return {
                  code: item.TaxCode,
                  description: item.TaxCodeDescription,
                  country: item.Country,
                  taxType: item.TaxType,
                  rate: 0,
                };
              }),
            );
          },
          error: function () {
            resolve([]);
          },
        });
      });
    },

    /**
     * Returns the list of closed FI period keys (format: "MM/YYYY").
     * OData future: GET /FiscalPeriods?$filter=IsClosed eq true&$select=PeriodKey
     *
     * @returns {Promise<string[]>}
     */
    getClosedPeriods: function () {
      return Promise.resolve(_aClosedPeriods.slice());
    },

    /**
     * Retrieves the FI Reconciliation Account (LFB1-AKONT) for the given
     * CompanyCode / Supplier pair from the SAP standard entity I_SupplierCompany.
     *
     * Used to populate the GL Account on the System BP Clearing Line (row 0 of
     * initiatorLines) in the Initiator GL Coding block.
     *
     * Called with:
     *   sCompanyCode = Recipient Company Code
     *   sSupplier    = Recipient Business Partner (Supplier number)
     *
     * Phase 1 (active): returns mock data so the controller chain works end-to-end
     *   without a live backend.
     * Phase 2 (live):   replace the mock block with the jQuery.ajax call below;
     *   the method signature and return contract are identical, so no controller
     *   changes are required.
     *
     * OData V4: GET /sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/
     *               I_SupplierCompany
     *               ?$filter=CompanyCode eq '{sCompanyCode}' and Supplier eq '{sSupplier}'
     *               &$select=ReconciliationAccount,Supplier
     *               &$top=1
     *
     * @param {string} sCompanyCode  Recipient company code
     * @param {string} sSupplier     Recipient Business Partner (Supplier number)
     * @returns {Promise<{reconciliationAccount: string, supplier: string} | null>}
     *          Resolves to null when no match is found; rejects on network error.
     */
    getReconciliationAccount: function (sCompanyCode, sSupplier) {
      // ── PHASE FLAG ────────────────────────────────────────────────────────
      // Set to true when the communication arrangement for zsb_interco_app
      // is active and USER_SAP_COM_BTP has authorization for I_SupplierCompany.
      var USE_LIVE_API = true;

      if (!USE_LIVE_API) {
        // Phase 1: mock — keyed by company code, returns AP reconciliation account.
        var _aMock = {
          1110: "21100000",
          1002: "21100000",
          1006: "21100000",
          1150: "21100000",
          1177: "21100000",
          1337: "21100000",
          1488: "21100000",
          1790: "21100000",
        };
        return Promise.resolve({
          reconciliationAccount: _aMock[sCompanyCode] || "21100000",
          supplier: sSupplier,
        });
      }

      // Phase 2: live OData V4 — activate by setting USE_LIVE_API = true above.
      var sServiceRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
      var sFilter =
        "CompanyCode eq '" +
        sCompanyCode +
        "' and Supplier eq '" +
        sSupplier +
        "'";
      var sUrl =
        sServiceRoot +
        "I_SupplierCompany" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=ReconciliationAccount,Supplier" +
        "&$top=1";

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",
          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },
          success: function (oData) {
            var aValue = (oData && oData.value) || [];
            if (!aValue.length) {
              resolve(null);
              return;
            }
            resolve({
              reconciliationAccount: aValue[0].ReconciliationAccount,
              supplier: aValue[0].Supplier,
            });
          },
          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "I_SupplierCompany request failed [" +
                  oXHR.status +
                  " " +
                  sError +
                  "]" +
                  " for CompanyCode=" +
                  sCompanyCode +
                  ", Supplier=" +
                  sSupplier,
              ),
            );
          },
        });
      });
    },

    /**
     * Retrieves the FI Reconciliation Account (KNBK-AKONT) for the given
     * CompanyCode / Customer pair from the SAP standard entity I_CustomerCompany.
     *
     * Used to populate the GL Account on the System BP Clearing Line (row 0 of
     * recipientLines) in the Recipient GL Coding block.
     *
     * Called with:
     *   sCompanyCode = Initiator Company Code
     *   sCustomer    = Initiator Business Partner (Customer number in recipient's books)
     *
     * OData V4: GET /sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/
     *               I_CustomerCompany
     *               ?$filter=CompanyCode eq '{sCompanyCode}' and Customer eq '{sCustomer}'
     *               &$select=ReconciliationAccount,Customer
     *               &$top=1
     *
     * @param {string} sCompanyCode  Initiator company code
     * @param {string} sCustomer     Initiator Business Partner (Customer number)
     * @returns {Promise<{reconciliationAccount: string, customer: string} | null>}
     *          Resolves to null when no match is found; rejects on network error.
     */
    getReconciliationAccountCustomer: function (sCompanyCode, sCustomer) {
      var USE_LIVE_API = true;

      if (!USE_LIVE_API) {
        var _aMock = {
          1110: "12100000",
          1002: "12100000",
          1006: "12100000",
          1150: "12100000",
          1177: "12100000",
          1337: "12100000",
          1488: "12100000",
          1790: "12100000",
        };
        return Promise.resolve({
          reconciliationAccount: _aMock[sCompanyCode] || "12100000",
          customer: sCustomer,
        });
      }

      var sServiceRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
      var sFilter =
        "CompanyCode eq '" +
        sCompanyCode +
        "' and Customer eq '" +
        sCustomer +
        "'";
      var sUrl =
        sServiceRoot +
        "I_CustomerCompany" +
        "?$filter=" +
        encodeURIComponent(sFilter) +
        "&$select=ReconciliationAccount,Customer" +
        "&$top=1";

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",
          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },
          success: function (oData) {
            var aValue = (oData && oData.value) || [];
            if (!aValue.length) {
              resolve(null);
              return;
            }
            resolve({
              reconciliationAccount: aValue[0].ReconciliationAccount,
              customer: aValue[0].Customer,
            });
          },
          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "I_CustomerCompany request failed [" +
                  oXHR.status +
                  " " +
                  sError +
                  "]" +
                  " for CompanyCode=" +
                  sCompanyCode +
                  ", Customer=" +
                  sCustomer,
              ),
            );
          },
        });
      });
    },

    /**
     * Fetches intercompany document types from the custom S/4HANA CBO.
     * Locally: proxied by ui5-middleware-simpleproxy (see ui5.yaml).
     * In BTP production: the destination handles the host and auth.
     * OData: GET YY1_ICDOCTYPE_CDS/YY1_ICDOCTYPE?$select=DocumentType
     *
     * @returns {Promise<Array<{documentType: string}>>}
     */
    getDocumentTypes: function () {
      var sUrl =
        "/sap/opu/odata/sap/YY1_ICDOCTYPE_CDS/YY1_ICDOCTYPE" +
        "?$format=json&$select=DocumentType";

      return new Promise(function (resolve) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",
          headers: { Accept: "application/json" },
          success: function (oData) {
            var aResults = (oData && oData.d && oData.d.results) || [];
            resolve(
              aResults.map(function (o) {
                return {
                  documentType: o.DocumentType,
                  description: o.AccountingDocumentTypeName || "",
                };
              }),
            );
          },
          error: function (oXHR) {
            console.warn(
              "getDocumentTypes: API failed [" +
                oXHR.status +
                "] – " +
                oXHR.responseText,
            );
            resolve([]);
          },
        });
      });
    },

    /**
     * Fetches intercompany relationship records from YY1_ICT001U (OData V2).
     * Pass at least one filter key: senderCC, receiverCC, or bpDebit.
     *
     * @param {object} params  { senderCC, receiverCC, bpDebit }
     * @returns {Promise<Array<{senderCC, receiverCC, bpForDebit, bpForCredit, debitKey, creditKey}>>}
     */
    getICT001URelationship: function (params) {
      var sRoot = "/sap/opu/odata/sap/YY1_ICT001U_CDS/YY1_ICT001U";
      var aFilters = [];
      if (params.senderCC) {
        aFilters.push("SenderCompanyCode eq '" + params.senderCC + "'");
      }
      if (params.receiverCC) {
        aFilters.push("ReciverCompanyCode eq '" + params.receiverCC + "'");
      }
      if (params.bpDebit) {
        aFilters.push("BPforDebitClearing eq '" + params.bpDebit + "'");
      }

      var oQueryParams = { $format: "json" };
      if (aFilters.length) {
        oQueryParams["$filter"] = aFilters.join(" and ");
      }

      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sRoot,
          method: "GET",
          data: oQueryParams,
          headers: { Accept: "application/json" },
          success: function (oData) {
            var aResults = (oData && oData.d && oData.d.results) || [];
            resolve(
              aResults.map(function (r) {
                return {
                  senderCC: r.SenderCompanyCode,
                  receiverCC: r.ReciverCompanyCode,
                  bpForDebit: r.BPforDebitClearing,
                  bpForCredit: r.BPforCreditClearing,
                  debitKey: r.DebitPostingKey,
                  creditKey: r.CreditPostingKey,
                };
              }),
            );
          },
          error: function (oXHR, sStatus, sError) {
            reject(
              new Error(
                "YY1_ICT001U lookup failed [" + oXHR.status + "]: " + sError,
              ),
            );
          },
        });
      });
    },

    // ── Internal: fetch CSRF token required for mutating OData V4 requests ─
    _fetchCsrfToken: function (sRoot) {
      return new Promise(function (resolve, reject) {
        jQuery.ajax({
          url: sRoot + "ZC_INTERCO_JE_HEADER?$top=0",
          method: "GET",
          headers: { "X-CSRF-Token": "Fetch", "OData-Version": "4.0" },
          complete: function (oXHR) {
            var sType = oXHR.getResponseHeader("Content-Type") || "";
            if (sType.indexOf("text/html") !== -1) {
              reject(
                new Error(
                  "Authentication error: SAP returned an SSO redirect during CSRF fetch. " +
                    "Ensure ui5.yaml uses a communication user (USER_SAP_COM_BTP) with basic auth.",
                ),
              );
              return;
            }
            if (oXHR.status >= 400) {
              var sDetail = oXHR.statusText;
              try {
                var oErrBody = JSON.parse(oXHR.responseText);
                sDetail =
                  oErrBody.error && oErrBody.error.message
                    ? oErrBody.error.message
                    : oXHR.responseText;
              } catch (e) {
                /* non-JSON error body */
              }
              reject(
                new Error(
                  "Service access denied [" +
                    oXHR.status +
                    "]: " +
                    sDetail +
                    " — Assign a Business Role containing the ZSB_INTERCO_APP catalog to USER_SAP_COM_BTP.",
                ),
              );
              return;
            }
            resolve(oXHR.getResponseHeader("X-CSRF-Token") || "");
          },
        });
      });
    },

    /**
     * Posts an intercompany document to ZC_INTERCO_JE_HEADER / ZC_INTERCO_JE_ITEM.
     *
     * Flow (SAP RAP draft pattern):
     *   1. POST ZC_INTERCO_JE_HEADER      → creates document, returns accountingdocument_temp
     *   2. POST …/_Item (per line)         → creates line items via navigation association
     *   3. POST …/Activate (if draft)      → activates the document
     *
     * @param {object} oHeader   /headerData model object
     * @param {Array}  aLines    /initiatorLines model array
     * @returns {Promise<{accountingdocument_temp: string}>}
     */
    submitIntercoDocument: function (
      oHeader,
      aInitiatorLines,
      aRecipientLines,
      sExistingDocId,
      sComment,
    ) {
      var sRoot = "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      // Convert SAP UI5 date string (MM/DD/YYYY or DD.MM.YYYY or YYYY-MM-DD) → OData Edm.Date
      function toODataDate(s) {
        if (!s) {
          return null;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          return s;
        }
        var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
          return (
            m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0")
          );
        }
        m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (m) {
          return (
            m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0")
          );
        }
        return null;
      }

      function isSamlRedirect(oXHR) {
        var sType = oXHR.getResponseHeader("Content-Type") || "";
        return sType.indexOf("text/html") !== -1;
      }

      function parseError(oXHR) {
        try {
          var oErr = JSON.parse(oXHR.responseText);
          return oErr.error && oErr.error.message
            ? oErr.error.message
            : oXHR.responseText;
        } catch (e) {
          return oXHR.responseText || oXHR.statusText;
        }
      }

      function buildItemPayload(oLine, iSeq, sInd) {
        return {
          referencedocumentitem: String(iSeq * 10),
          initiator_recipient_ind: sInd,
          documentitemtext: (oLine.itemText || "").slice(0, 25),
          assignmentreference: (oLine.assignment || "").slice(0, 16),
          glaccount: (oLine.glAccount || "").slice(0, 10),
          business_partner: (oLine.businessPartner || "").slice(0, 10),
          currencycode: (oHeader.currency || "USD").slice(0, 5),
          amountintransactioncurrency: parseFloat(oLine.amountDC) || 0,
          debitcreditcode: oLine.debitCredit || "S",
          profitcenter: (oLine.profitCenter || "").slice(0, 10),
          taxcode: (oLine.taxCode || "").slice(0, 2),
          tax_amount: parseFloat(oLine.taxAmount) || 0,
          costcenter: (oLine.costCenter || "").slice(0, 10),
          // internalorder:               (oLine.internalOrder   || "").slice(0, 12),
          // wbselement:                  (oLine.wbsElement      || "").slice(0, 24),
          // tradingpartner:              (oLine.tradingPartner  || "").slice(0, 6),
          // partnerprofitcenter:         (oLine.partnerPrCtr    || "").slice(0, 10),
          // personnel:                   (oLine.personnel       || "").slice(0, 8),
          // contract:                    (oLine.contract        || "").slice(0, 10),
          // contracttype:                (oLine.contractType    || "").slice(0, 4)
          // linereference1:              (oLine.lineRef1        || "").slice(0, 12),
          // linereference2:              (oLine.lineRef2        || "").slice(0, 12),
          // linereference3:              (oLine.lineRef3        || "").slice(0, 12)
        };
      }

      var oHdrPayload = {
        in_companycode: (oHeader.initiatorCC || "").slice(0, 4),
        rec_companycode: (oHeader.recipientCC || "").slice(0, 4),
        documentreferenceid: (oHeader.reference || "").slice(0, 16),
        documentheadertext: (oHeader.headerText || "").slice(0, 25),
        documentdate: toODataDate(oHeader.documentDate),
        postingdate: toODataDate(oHeader.postingDate),
        accountingdocumenttype: oHeader.documentTypeCode,
        mail_notif_ind: "X",
        currencycode: (oHeader.currency || "USD").slice(0, 5),
        amount: parseFloat(oHeader.totalIntercoAmount) || 0,
        tax_amount: parseFloat(oHeader.taxAmount) || 0,
        taxcode: (oHeader.initiatorTaxCode || "").slice(0, 2),
      };

      // Only initiator lines — recipient lines are added separately via submitRecipientLines (two-phase flow)
      // The system-generated Tax GL line gets "IT" instead of "I" so
      // it stays distinguishable from regular Initiator lines.
      var aItemPayloads = [];
      (aInitiatorLines || []).forEach(function (oLine, i) {
        var sInd = oLine.isTaxGLLine ? "IT" : "I";
        aItemPayloads.push(buildItemPayload(oLine, i + 1, sInd));
      });

      return this._fetchCsrfToken(sRoot)
        .then(function (sToken) {
          var oHdrs = {
            Accept: "application/json",
            "Content-Type": "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
            "X-CSRF-Token": sToken,
          };

          // ── Step 1: Create a new header, OR reuse the existing draft
          //    already created by a prior Initiator Validate — Submit
          //    must never spin up a second accountingdocument_temp. ──
          if (!sExistingDocId) {
            return new Promise(function (resolve, reject) {
              jQuery.ajax({
                url: sRoot + "ZC_INTERCO_JE_HEADER",
                method: "POST",
                headers: oHdrs,
                contentType: "application/json",
                data: JSON.stringify(oHdrPayload),
                success: function (oData, sStatus, oXHR) {
                  if (isSamlRedirect(oXHR)) {
                    reject(
                      new Error(
                        "Authentication error on header creation: SAP returned an SSO redirect. " +
                          "Ensure ui5.yaml uses USER_SAP_COM_BTP with basic auth.",
                      ),
                    );
                    return;
                  }
                  console.log("================================");
                  console.log("HEADER CREATE RESPONSE");
                  console.log(oData);
                  console.log("================================");
                  resolve({
                    docId: oData.accountingdocument_temp,
                    hdrs: oHdrs,
                    bActive: oData.IsActiveEntity === true,
                    isExistingDraft: false,
                  });
                },
                error: function (oXHR) {
                  reject(
                    new Error(
                      "Header creation failed [" +
                        oXHR.status +
                        "]: " +
                        parseError(oXHR),
                    ),
                  );
                },
              });
            });
          } else {
            console.log(
              "[Submit] Reusing existing draft:",
              sExistingDocId,
            );
            return Promise.resolve({
              docId: sExistingDocId,
              hdrs: oHdrs,
              bActive: false,
              isExistingDraft: true,
            });
          }
        })
        .then(function (oCtx) {
          // ── Step 1a (reused draft only): sync current header field
          //    values (Reference, Header Text, dates, tax code/amount,
          //    etc.) to SAP. These may have been entered or edited
          //    after the draft header was first created (e.g. via
          //    Save Draft), so Submit must push them now — otherwise
          //    the header stays exactly as it was at creation time
          //    even though the UI shows newer values. ───────────────
          if (!oCtx.isExistingDraft) {
            return oCtx;
          }

          var sHeaderKeyFrag =
            "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
            oCtx.docId +
            "',IsActiveEntity=" + oCtx.bActive + ")";

          return new Promise(function (resolve) {
            jQuery.ajax({
              url: sRoot + sHeaderKeyFrag,
              method: "PATCH",
              headers: oCtx.hdrs,
              contentType: "application/json",
              data: JSON.stringify(oHdrPayload),
              success: function () {
                console.log("[Submit] Header synced for draft:", oCtx.docId);
                resolve(oCtx);
              },
              error: function (oXHR) {
                console.warn(
                  "[Submit] Header sync failed — continuing submit anyway:",
                  oXHR.status,
                  oXHR.responseText,
                );
                resolve(oCtx); // never block submit over a header sync failure
              },
            });
          });
        })
         .then(function (oCtx) {
      // ── Step 1b (NEW, optional): save comment against the draft key ──
      // Fire-and-forget style — logs on failure, never rejects the chain,
      // so existing submit behavior is 100% preserved either way.
      if (!sComment) {
        return oCtx;
      }

      var sDraftKeyFrag =
        "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
        oCtx.docId +
        "',IsActiveEntity=" + oCtx.bActive + ")";

      return new Promise(function (resolve) {
        jQuery.ajax({
          url: sRoot + sDraftKeyFrag + "/com.sap.gateway.srvd.zsd_interco_app.v0001.SaveComment",
          method: "POST",
          headers: oCtx.hdrs,
          contentType: "application/json",
          data: JSON.stringify({ comments: sComment }),
          success: function () {
            resolve(oCtx);
          },
          error: function (oXHR) {
            console.warn("[Submit] SaveComment failed — continuing submit anyway:", oXHR.status, oXHR.responseText);
            resolve(oCtx);   // never block/fail the main submit flow over a comment
          },
        });
      });
    })
        .then(function (oCtx) {
          // ── Step 2 (reused draft only): clear only the "I" items
          //    already posted by a prior Validate, so the fresh item
          //    list can be reposted without duplicate-key errors. Any
          //    "R" items are left untouched. ─────────────────────────
          if (!oCtx.isExistingDraft) {
            return oCtx;
          }

          var sDraftKeyFrag =
            "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
            oCtx.docId +
            "',IsActiveEntity=false)";

          return new Promise(function (resolve) {
            jQuery.ajax({
              url:
                sRoot +
                sDraftKeyFrag +
                "/_Item?$select=referencedocumentitem,initiator_recipient_ind",
              method: "GET",
              headers: oCtx.hdrs,
              success: function (oData) {
                // Also match the Tax GL line's own indicator ("IT") so
                // a previously-generated tax line is replaced too, not
                // left behind as a stale duplicate.
                var aExisting = (oData.value || []).filter(function (oItem) {
                  var sInd = String(
                    oItem.initiator_recipient_ind || "",
                  ).trim();
                  return sInd === "I" || sInd === "IT";
                });
                console.log(
                  "[Submit] Clearing existing I items:",
                  aExisting.length,
                );

                var pDelete = Promise.resolve();
                aExisting.forEach(function (oItem) {
                  pDelete = pDelete.then(function () {
                    return new Promise(function (resolveDel) {
                      jQuery.ajax({
                        url:
                          sRoot +
                          "ZC_INTERCO_JE_ITEM(accountingdocument_temp='" +
                          oCtx.docId +
                          "',referencedocumentitem='" +
                          oItem.referencedocumentitem +
                          "',IsActiveEntity=false)",
                        method: "DELETE",
                        headers: oCtx.hdrs,
                        success: function () {
                          resolveDel();
                        },
                        error: function (oXHR) {
                          console.warn(
                            "[Submit] Could not delete item " +
                              oItem.referencedocumentitem +
                              " [" +
                              oXHR.status +
                              "] — continuing.",
                          );
                          resolveDel();
                        },
                      });
                    });
                  });
                });

                pDelete.then(function () {
                  resolve(oCtx);
                });
              },
              error: function () {
                resolve(oCtx);
              },
            });
          });
        })
        .then(function (oCtx) {
          // ── Step 3: Create items via _Item navigation ────────────────
          var sDocId = oCtx.docId;
          var sKeyFrag =
            "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
            sDocId +
            "',IsActiveEntity=" +
            oCtx.bActive +
            ")";

          var pChain = Promise.resolve();
          aItemPayloads.forEach(function (oItem) {
            pChain = pChain.then(function () {
              return new Promise(function (resolve, reject) {
                console.log("Posting Item");
                console.log(oItem);
                jQuery.ajax({
                  url: sRoot + sKeyFrag + "/_Item",
                  method: "POST",
                  headers: oCtx.hdrs,
                  contentType: "application/json",
                  data: JSON.stringify(oItem),
                  success: function () {
                    resolve();
                  },
                  error: function (oXHR) {
                    reject(
                      new Error(
                        "Item " +
                          oItem.referencedocumentitem +
                          " creation failed [" +
                          oXHR.status +
                          "]: " +
                          parseError(oXHR),
                      ),
                    );
                  },
                });
              });
            });
          });

          return pChain.then(function () {
            // ── Step 4: Activate draft → persist initiator data ──────────
            var sActivateUrl =
              sRoot +
              sKeyFrag +
              "/com.sap.gateway.srvd.zsd_interco_app.v0001.Activate";
            return new Promise(function (resolve, reject) {
              jQuery.ajax({
                url: sActivateUrl,
                method: "POST",
                headers: oCtx.hdrs,
                contentType: "application/json",
                data: "{}",
                success: function (oData) {
                  var sActiveDocId =
                    (oData &&
                      (oData.accountingdocument_temp ||
                        oData.AccountingDocument ||
                        oData.AccountingDocumentTemp)) ||
                    sDocId;
                  resolve({ accountingdocument_temp: sActiveDocId });
                },
                error: function (oXHR) {
                  reject(
                    new Error(
                      "Activation failed [" +
                        oXHR.status +
                        "]: " +
                        parseError(oXHR),
                    ),
                  );
                },
              });
            });
          });
        });
    },

    /**
     * Fetches the tax rate for a given TaxCode (and optional Country) from I_TaxCodeRate.
     * Returns the CONDITIONRATERATIO value (percentage, e.g. 15 for 15%).
     *
     * @param {string} sTaxCode  Tax code (e.g. "V1")
     * @param {string} sCountry  Country key (e.g. "ZA") — optional but recommended
     * @returns {Promise<number>} Resolves with CONDITIONRATERATIO (0 if not found)
     */
    getTaxCodeRate: function (sTaxCode, sCountry) {
      if (!sTaxCode) {
        return Promise.resolve(0);
      }
      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
      var sFilter = "TaxCode eq '" + sTaxCode + "'";
      if (sCountry) {
        sFilter += " and Country eq '" + sCountry + "'";
      }
      var sUrl =
        sRoot +
        "I_TaxCodeRate?$filter=" +
        encodeURIComponent(sFilter) +
        "&$top=1";
      return new Promise(function (resolve) {
        jQuery.ajax({
          url: sUrl,
          method: "GET",
          headers: {
            Accept: "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
          },
          success: function (oData) {
            var aItems = (oData && oData.value) || [];
            if (!aItems.length) {
              resolve(0);
              return;
            }
            resolve(parseFloat(aItems[0].ConditionRateRatio || 0));
          },
          error: function () {
            resolve(0);
          },
        });
      });
    },

    submitRecipientLines: function (
      sDocId,
      oHeader,
      aRecipientLines,
      iInitiatorCount,
      sComment,
    )
    {
      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      function isSamlRedirect(oXHR) {
        var sType = oXHR.getResponseHeader("Content-Type") || "";
        return sType.indexOf("text/html") !== -1;
      }

      function parseError(oXHR) {
        try {
          var oErr = JSON.parse(oXHR.responseText);
          if (!oErr || !oErr.error) {
            return oXHR.responseText || oXHR.statusText;
          }

          var sMsgs = oErr.error.message || "";

          // OData V4 standard detail array
          var aDetails = oErr.error.details || [];
          if (aDetails.length) {
            sMsgs +=
              "\n\n" +
              aDetails
                .map(function (d) {
                  var sSev = d["@SAP.Severity"] || d.code || "";
                  return "• " + (sSev ? "[" + sSev + "] " : "") + d.message;
                })
                .join("\n");
          }

          // SAP inner error details
          var aInner =
            (oErr.error.innererror && oErr.error.innererror.errordetails) || [];
          aInner.forEach(function (d) {
            if (
              d.message &&
              aDetails.every(function (x) {
                return x.message !== d.message;
              })
            ) {
              sMsgs += "\n• " + d.message;
            }
          });

          return sMsgs || oXHR.statusText;
        } catch (e) {
          return oXHR.responseText || oXHR.statusText;
        }
      }

      // Strip "—" placeholder values so they are not sent to the backend
      function sanitize(sVal, iMax) {
        var s = !sVal || sVal === "—" ? "" : String(sVal);
        return iMax ? s.slice(0, iMax) : s;
      }

      var sActiveKeyFrag =
        "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
        sDocId +
        "',IsActiveEntity=true)";
      var sDraftKeyFrag =
        "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
        sDocId +
        "',IsActiveEntity=false)";

      // The system-generated Tax GL line gets "RT" instead of "R" so
      // it stays distinguishable from regular Recipient lines.
      var iOffset = iInitiatorCount || 0;
      var aItemPayloads = (aRecipientLines || []).map(function (oLine, i) {
        return {
          referencedocumentitem: String((iOffset + i + 1) * 10),
          initiator_recipient_ind: oLine.isTaxGLLine ? "RT" : "R",
          documentitemtext: sanitize(oLine.itemText, 25),
          assignmentreference: sanitize(oLine.assignment, 16),
          glaccount: sanitize(oLine.glAccount, 10),
          business_partner: sanitize(oLine.businessPartner, 10),
          currencycode: (oHeader.currency || "USD").slice(0, 5),
          amountintransactioncurrency: parseFloat(oLine.amountDC) || 0,
          debitcreditcode: oLine.debitCredit || "S",
          profitcenter: sanitize(oLine.profitCenter, 10),
          taxcode: sanitize(oLine.taxCode, 2),
          tax_amount: parseFloat(oLine.taxAmount) || 0,

          costcenter: sanitize(oLine.costCenter, 10),
        };
      });

      return this._fetchCsrfToken(sRoot)
        .then(function (sToken) {
          var oHdrs = {
            Accept: "application/json",
            "Content-Type": "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
            "X-CSRF-Token": sToken,
          };

          // ── Step 1: Edit active header → creates an edit draft ────────
          // A prior Recipient Validate (saveDraftAndSimulate) may have
          // already put this document into Edit and left that draft in
          // place (Simulate never activates it) — Edit then correctly
          // reports 409 "draft already exists". That draft is exactly
          // the one we want, so treat this specific 409 as success and
          // reuse it instead of failing the Post.
          var sEditUrl =
            sRoot +
            sActiveKeyFrag +
            "/com.sap.gateway.srvd.zsd_interco_app.v0001.Edit";
          return new Promise(function (resolve, reject) {
            jQuery.ajax({
              url: sEditUrl,
              method: "POST",
              headers: oHdrs,
              contentType: "application/json",
              data: JSON.stringify({ PreserveChanges: true }),
              success: function () {
                resolve(oHdrs);
              },
              error: function (oXHR) {
                if (oXHR.status === 409) {
                  console.log(
                    "[Post] Edit draft already exists — reusing it:",
                    sDocId,
                  );
                  resolve(oHdrs);
                  return;
                }
                reject(
                  new Error(
                    "Edit (draft creation) failed [" +
                      oXHR.status +
                      "]: " +
                      parseError(oXHR),
                  ),
                );
              },
            });
          });
        })
        .then(function (oHdrs) {
          // ── Step 2: Clear any "R" items already sitting in this draft
          //    (e.g. left over from a prior Recipient Validate) so Post's
          //    own item list isn't duplicated alongside them. "I" items
          //    are left untouched.
          return new Promise(function (resolve) {
            jQuery.ajax({
              url:
                sRoot +
                sDraftKeyFrag +
                "/_Item?$select=referencedocumentitem,initiator_recipient_ind",
              method: "GET",
              headers: oHdrs,
              success: function (oData) {
                // Also match the Tax GL line's own indicator ("RT") so
                // a previously-generated tax line is replaced too, not
                // left behind as a stale duplicate.
                var aExisting = (oData.value || []).filter(function (oItem) {
                  var sInd = String(
                    oItem.initiator_recipient_ind || "",
                  ).trim();
                  return sInd === "R" || sInd === "RT";
                });
                console.log(
                  "[Post] Clearing existing R items:",
                  aExisting.length,
                );

                var pDelete = Promise.resolve();
                aExisting.forEach(function (oItem) {
                  pDelete = pDelete.then(function () {
                    return new Promise(function (resolveDel) {
                      jQuery.ajax({
                        url:
                          sRoot +
                          "ZC_INTERCO_JE_ITEM(accountingdocument_temp='" +
                          sDocId +
                          "',referencedocumentitem='" +
                          oItem.referencedocumentitem +
                          "',IsActiveEntity=false)",
                        method: "DELETE",
                        headers: oHdrs,
                        success: function () {
                          resolveDel();
                        },
                        error: function (oXHR) {
                          console.warn(
                            "[Post] Could not delete item " +
                              oItem.referencedocumentitem +
                              " [" +
                              oXHR.status +
                              "] — continuing.",
                          );
                          resolveDel();
                        },
                      });
                    });
                  });
                });

                pDelete.then(function () {
                  resolve(oHdrs);
                });
              },
              error: function () {
                resolve(oHdrs);
              },
            });
          });
        })
        .then(function (oHdrs) {
          // ── Step 3: Post Recipient items to the (now-cleared) draft ───
          var pChain = Promise.resolve();
          aItemPayloads.forEach(function (oItem) {
            pChain = pChain.then(function () {
              return new Promise(function (resolve, reject) {
                jQuery.ajax({
                  url: sRoot + sDraftKeyFrag + "/_Item",
                  method: "POST",
                  headers: oHdrs,
                  contentType: "application/json",
                  data: JSON.stringify(oItem),
                  success: function () {
                    resolve();
                  },
                  error: function (oXHR) {
                    reject(
                      new Error(
                        "Recipient item " +
                          oItem.referencedocumentitem +
                          " creation failed [" +
                          oXHR.status +
                          "]: " +
                          parseError(oXHR),
                      ),
                    );
                  },
                });
              });
            });
          });
          return pChain.then(function () {
            return oHdrs;
          });
        })
        .then(function (oHdrs) {
          // ── Step 4: Activate the draft → recipient data persisted ─────
          var sActivateUrl =
            sRoot +
            sDraftKeyFrag +
            "/com.sap.gateway.srvd.zsd_interco_app.v0001.Activate";
          return new Promise(function (resolve, reject) {
            jQuery.ajax({
              url: sActivateUrl,
              method: "POST",
              headers: oHdrs,
              contentType: "application/json",
              data: "{}",
              success: function (oData, sStatus, oXHR) {
                if (isSamlRedirect(oXHR)) {
                  reject(new Error("Session expired during activation."));
                  return;
                }
                resolve(oHdrs);
              },
              error: function (oXHR) {
                reject(
                  new Error(
                    "Activation failed [" +
                      oXHR.status +
                      "]: " +
                      parseError(oXHR),
                  ),
                );
              },
            });
          });
        })
        .then(function (oHdrs) {
          // ── Step 4b (NEW, optional): save comment against the active key ──
          // Positioned after Activate (not mirrored from Submit's position)
          // so this cycle's "R" items are already active when the backend
          // derives Initiator-vs-Recipient action code from them. Still
          // fire-and-forget — logs on failure, never rejects the chain, so
          // existing post behavior is 100% preserved either way.
          if (!sComment) {
            return oHdrs;
          }

          return new Promise(function (resolve) {
            jQuery.ajax({
              url: sRoot + sActiveKeyFrag + "/com.sap.gateway.srvd.zsd_interco_app.v0001.SaveComment",
              method: "POST",
              headers: oHdrs,
              contentType: "application/json",
              data: JSON.stringify({ comments: sComment }),
              success: function () {
                resolve(oHdrs);
              },
              error: function (oXHR) {
                console.warn("[Post] SaveComment failed — continuing post anyway:", oXHR.status, oXHR.responseText);
                resolve(oHdrs); // never block/fail the main post flow over a comment
              },
            });
          });
        })
        .then(function (oHdrs) {
          // ── Step 5: PostJournalEntry on the active entity ─────────────
          var sActionUrl =
            sRoot +
            sActiveKeyFrag +
            "/com.sap.gateway.srvd.zsd_interco_app.v0001.PostJournalEntry";
          return new Promise(function (resolve, reject) {
            jQuery.ajax({
              url: sActionUrl,
              method: "POST",
              headers: oHdrs,
              contentType: "application/json",
              data: "{}",
              success: function (oData, sStatus, oXHR) {
                var sSAPMsgs = oXHR.getResponseHeader("SAP-Messages");
                if (sSAPMsgs) {
                  try {
                    var aMsgs = JSON.parse(sSAPMsgs);
                    var aErrors = aMsgs.filter(function (m) {
                      return m.numericSeverity >= 3 || m.severity === "error";
                    });
                    if (aErrors.length) {
                      reject(
                        new Error(
                          "PostJournalEntry returned errors:\n" +
                            aErrors
                              .map(function (m) {
                                return (
                                  "• " +
                                  (m.longText || m.message || JSON.stringify(m))
                                );
                              })
                              .join("\n"),
                        ),
                      );
                      return;
                    }
                  } catch (e) {
                    /* ignore malformed header */
                  }
                }
                resolve({
                  accountingdocument_temp: sDocId,
                  in_accountingdocument: oData.in_accountingdocument || "",
                  rec_accountingdocument: oData.rec_accountingdocument || "",
                  result: oData,
                });
              },
              error: function (oXHR) {
                reject(
                  new Error(
                    "PostJournalEntry failed [" +
                      oXHR.status +
                      "]: " +
                      parseError(oXHR),
                  ),
                );
              },
            });
          });
        });
    },


    //post to approavl

    submitToApproval: function (
      sDocId,
      oHeader,
      aRecipientLines,
      iInitiatorCount,
    ) 
    {
      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      function isSamlRedirect(oXHR) {
        var sType = oXHR.getResponseHeader("Content-Type") || "";
        return sType.indexOf("text/html") !== -1;
      }

      function parseError(oXHR) {
        try {
          var oErr = JSON.parse(oXHR.responseText);
          if (!oErr || !oErr.error) {
            return oXHR.responseText || oXHR.statusText;
          }

          var sMsgs = oErr.error.message || "";

          // OData V4 standard detail array
          var aDetails = oErr.error.details || [];
          if (aDetails.length) {
            sMsgs +=
              "\n\n" +
              aDetails
                .map(function (d) {
                  var sSev = d["@SAP.Severity"] || d.code || "";
                  return "• " + (sSev ? "[" + sSev + "] " : "") + d.message;
                })
                .join("\n");
          }

          // SAP inner error details
          var aInner =
            (oErr.error.innererror && oErr.error.innererror.errordetails) || [];
          aInner.forEach(function (d) {
            if (
              d.message &&
              aDetails.every(function (x) {
                return x.message !== d.message;
              })
            ) {
              sMsgs += "\n• " + d.message;
            }
          });

          return sMsgs || oXHR.statusText;
        } catch (e) {
          return oXHR.responseText || oXHR.statusText;
        }
      }

      // Strip "—" placeholder values so they are not sent to the backend
      function sanitize(sVal, iMax) {
        var s = !sVal || sVal === "—" ? "" : String(sVal);
        return iMax ? s.slice(0, iMax) : s;
      }

      var sActiveKeyFrag =
        "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
        sDocId +
        "',IsActiveEntity=true)";
      var sDraftKeyFrag =
        "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
        sDocId +
        "',IsActiveEntity=false)";

      // The system-generated Tax GL line gets "RT" instead of "R" so
      // it stays distinguishable from regular Recipient lines.
      var iOffset = iInitiatorCount || 0;
      var aItemPayloads = (aRecipientLines || []).map(function (oLine, i) {
        return {
          referencedocumentitem: String((iOffset + i + 1) * 10),
          initiator_recipient_ind: oLine.isTaxGLLine ? "RT" : "R",
          documentitemtext: sanitize(oLine.itemText, 25),
          assignmentreference: sanitize(oLine.assignment, 16),
          glaccount: sanitize(oLine.glAccount, 10),
          business_partner: sanitize(oLine.businessPartner, 10),
          currencycode: (oHeader.currency || "USD").slice(0, 5),
          amountintransactioncurrency: parseFloat(oLine.amountDC) || 0,
          debitcreditcode: oLine.debitCredit || "S",
          profitcenter: sanitize(oLine.profitCenter, 10),
          taxcode: sanitize(oLine.taxCode, 2),
          tax_amount: parseFloat(oLine.taxAmount) || 0,

          costcenter: sanitize(oLine.costCenter, 10),
        };
      });

      return this._fetchCsrfToken(sRoot)
        .then(function (sToken) {
          var oHdrs = {
            Accept: "application/json",
            "Content-Type": "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
            "X-CSRF-Token": sToken,
          };

          // ── Step 1: Edit active header → creates an edit draft ────────
          // A prior Recipient Validate (saveDraftAndSimulate) may have
          // already put this document into Edit and left that draft in
          // place (Simulate never activates it) — Edit then correctly
          // reports 409 "draft already exists". That draft is exactly
          // the one we want, so treat this specific 409 as success and
          // reuse it instead of failing the Post.
          var sEditUrl =
            sRoot +
            sActiveKeyFrag +
            "/com.sap.gateway.srvd.zsd_interco_app.v0001.Edit";
          return new Promise(function (resolve, reject) {
            jQuery.ajax({
              url: sEditUrl,
              method: "POST",
              headers: oHdrs,
              contentType: "application/json",
              data: JSON.stringify({ PreserveChanges: true }),
              success: function () {
                resolve(oHdrs);
              },
              error: function (oXHR) {
                if (oXHR.status === 409) {
                  console.log(
                    "[Post] Edit draft already exists — reusing it:",
                    sDocId,
                  );
                  resolve(oHdrs);
                  return;
                }
                reject(
                  new Error(
                    "Edit (draft creation) failed [" +
                      oXHR.status +
                      "]: " +
                      parseError(oXHR),
                  ),
                );
              },
            });
          });
        })
        .then(function (oHdrs) {
          // ── Step 2: Clear any "R" items already sitting in this draft
          //    (e.g. left over from a prior Recipient Validate) so Post's
          //    own item list isn't duplicated alongside them. "I" items
          //    are left untouched.
          return new Promise(function (resolve) {
            jQuery.ajax({
              url:
                sRoot +
                sDraftKeyFrag +
                "/_Item?$select=referencedocumentitem,initiator_recipient_ind",
              method: "GET",
              headers: oHdrs,
              success: function (oData) {
                // Also match the Tax GL line's own indicator ("RT") so
                // a previously-generated tax line is replaced too, not
                // left behind as a stale duplicate.
                var aExisting = (oData.value || []).filter(function (oItem) {
                  var sInd = String(
                    oItem.initiator_recipient_ind || "",
                  ).trim();
                  return sInd === "R" || sInd === "RT";
                });
                console.log(
                  "[Post] Clearing existing R items:",
                  aExisting.length,
                );

                var pDelete = Promise.resolve();
                aExisting.forEach(function (oItem) {
                  pDelete = pDelete.then(function () {
                    return new Promise(function (resolveDel) {
                      jQuery.ajax({
                        url:
                          sRoot +
                          "ZC_INTERCO_JE_ITEM(accountingdocument_temp='" +
                          sDocId +
                          "',referencedocumentitem='" +
                          oItem.referencedocumentitem +
                          "',IsActiveEntity=false)",
                        method: "DELETE",
                        headers: oHdrs,
                        success: function () {
                          resolveDel();
                        },
                        error: function (oXHR) {
                          console.warn(
                            "[Post] Could not delete item " +
                              oItem.referencedocumentitem +
                              " [" +
                              oXHR.status +
                              "] — continuing.",
                          );
                          resolveDel();
                        },
                      });
                    });
                  });
                });

                pDelete.then(function () {
                  resolve(oHdrs);
                });
              },
              error: function () {
                resolve(oHdrs);
              },
            });
          });
        })
        .then(function (oHdrs) {
          // ── Step 3: Post Recipient items to the (now-cleared) draft ───
          var pChain = Promise.resolve();
          aItemPayloads.forEach(function (oItem) {
            pChain = pChain.then(function () {
              return new Promise(function (resolve, reject) {
                jQuery.ajax({
                  url: sRoot + sDraftKeyFrag + "/_Item",
                  method: "POST",
                  headers: oHdrs,
                  contentType: "application/json",
                  data: JSON.stringify(oItem),
                  success: function () {
                    resolve();
                  },
                  error: function (oXHR) {
                    reject(
                      new Error(
                        "Recipient item " +
                          oItem.referencedocumentitem +
                          " creation failed [" +
                          oXHR.status +
                          "]: " +
                          parseError(oXHR),
                      ),
                    );
                  },
                });
              });
            });
          });
          return pChain.then(function () {
            return oHdrs;
          });
        })
        .then(function (oHdrs) {
          // ── Step 4: Activate the draft → recipient data persisted ─────
          var sActivateUrl =
            sRoot +
            sDraftKeyFrag +
            "/com.sap.gateway.srvd.zsd_interco_app.v0001.Activate";
          return new Promise(function (resolve, reject) {
            jQuery.ajax({
              url: sActivateUrl,
              method: "POST",
              headers: oHdrs,
              contentType: "application/json",
              data: "{}",
              success: function (oData, sStatus, oXHR) {
                if (isSamlRedirect(oXHR)) {
                  reject(new Error("Session expired during activation."));
                  return;
                }
                resolve(oHdrs);
              },
              error: function (oXHR) {
                reject(
                  new Error(
                    "Activation failed [" +
                      oXHR.status +
                      "]: " +
                      parseError(oXHR),
                  ),
                );
              },
            });
          });
        })
        .then(function (oHdrs) {
          // ── Step 5: PostJournalEntry on the active entity ─────────────
          var sActionUrl =
            sRoot +
            sActiveKeyFrag +
            "/com.sap.gateway.srvd.zsd_interco_app.v0001.RequestApproval";
          return new Promise(function (resolve, reject) {
            jQuery.ajax({
              url: sActionUrl,
              method: "POST",
              headers: oHdrs,
              contentType: "application/json",
              data: "{}",
              success: function (oData, sStatus, oXHR) {
                var sSAPMsgs = oXHR.getResponseHeader("SAP-Messages");
                if (sSAPMsgs) {
                  try {
                    var aMsgs = JSON.parse(sSAPMsgs);
                    var aErrors = aMsgs.filter(function (m) {
                      return m.numericSeverity >= 3 || m.severity === "error";
                    });
                    if (aErrors.length) {
                      reject(
                        new Error(
                          "RequestApproval returned errors:\n" +
                            aErrors
                              .map(function (m) {
                                return (
                                  "• " +
                                  (m.longText || m.message || JSON.stringify(m))
                                );
                              })
                              .join("\n"),
                        ),
                      );
                      return;
                    }
                  } catch (e) {
                    /* ignore malformed header */
                  }
                }
                resolve({
                  accountingdocument_temp: sDocId,
                  in_accountingdocument: oData.in_accountingdocument || "",
                  rec_accountingdocument: oData.rec_accountingdocument || "",
                  result: oData,
                });
              },
              error: function (oXHR) {
                reject(
                  new Error(
                    "RequestApproval failed [" +
                      oXHR.status +
                      "]: " +
                      parseError(oXHR),
                  ),
                );
              },
            });
          });
        });
    },

    // Reads the full RAP draft (header + all items) for a given
    // accountingdocument_temp, for reopening it into the edit form.
    // Mirrors the proven pattern from Main.controller.js's _loadJEItems:
    // filter by accountingdocument_temp only (never combine IsActiveEntity
    // into the $filter alongside $expand — known backend limitation), then
    // pick the draft sibling (IsActiveEntity === false) client-side.
    // $select is explicit on both header and item — a generic/no-$select
    // request against this service has previously caused an ABAP
    // SYNTAX_ERROR, so every field must be named.
    getDraftForEdit: function (sDocId) {
      var sRoot = "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";
      var sDocIdSafe = String(sDocId || "").replace(/'/g, "");

      if (!sDocIdSafe) {
        return Promise.reject(new Error("getDraftForEdit: missing document id."));
      }

      var aHeaderSelect = [
        "accountingdocument_temp",
        "IsActiveEntity",
        "in_companycode",
        "rec_companycode",
        "documentreferenceid",
        "documentheadertext",
        "documentdate",
        "postingdate",
        "accountingdocumenttype",
        "taxcode",
        "tax_amount",
        "amount",
        "currencycode",
        "in_accountingdocument",
        "rec_accountingdocument",
        "createdby",
        "approval_status",
      ];
      var aItemSelect = [
        "accountingdocument_temp",
        "referencedocumentitem",
        "initiator_recipient_ind",
        "business_partner",
        "documentitemtext",
        "assignmentreference",
        "glaccount",
        "currencycode",
        "amountintransactioncurrency",
        "debitcreditcode",
        "profitcenter",
        "costcenter",
        "taxcode",
        "tax_amount",
        "IsActiveEntity",
      ];

      var sUrl =
        sRoot +
        "ZC_INTERCO_JE_HEADER?$select=" +
        aHeaderSelect.join(",") +
        "&$filter=accountingdocument_temp eq '" +
        sDocIdSafe +
        "'&$expand=_Item($select=" +
        aItemSelect.join(",") +
        ")";

      return fetch(sUrl, { method: "GET", headers: { Accept: "application/json" } })
        .then(function (oResponse) {
          if (!oResponse.ok) {
            return oResponse.text().then(function (sText) {
              var sMsg;
              try {
                var oErr = JSON.parse(sText);
                sMsg = (oErr.error && oErr.error.message) || sText;
              } catch (e) {
                sMsg = sText || oResponse.statusText;
              }
              throw new Error(sMsg);
            });
          }
          return oResponse.json();
        })
        .then(function (oBody) {
          var aResults = (oBody && oBody.value) || [];
          var oDraft = aResults.find(function (r) {
            return r.IsActiveEntity === false;
          });
          if (!oDraft) {
            throw new Error(
              "No draft (IsActiveEntity=false) found for document " + sDocIdSafe + ".",
            );
          }
          return {
            header: oDraft,
            items: Array.isArray(oDraft._Item) ? oDraft._Item : [],
          };
        });
    },

    saveDraftAndSimulate: function (
      oHeader,
      aInitiatorLines,
      aRecipientLines,
      sExistingDocId,
      sValidationSide,
      bSkipSimulate,
    ) {
      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      // ---------------------------------------------------------
      // Convert UI5 date to OData V4 Edm.Date
      // ---------------------------------------------------------
      function toODataDate(s) {
        if (!s) {
          return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          return s;
        }

        var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

        if (m) {
          return (
            m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0")
          );
        }

        m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

        if (m) {
          return (
            m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0")
          );
        }

        return null;
      }

      // ---------------------------------------------------------
      // Parse SAP OData error
      // ---------------------------------------------------------
      function parseError(oXHR) {
        try {
          var oErr = JSON.parse(oXHR.responseText);

          var sMessage =
            oErr.error && oErr.error.message
              ? oErr.error.message
              : oXHR.responseText;

          // Include RAP details if available
          if (oErr.error && oErr.error.details) {
            sMessage +=
              "\n\n" +
              oErr.error.details
                .map(function (oDetail) {
                  return "• " + oDetail.message;
                })
                .join("\n");
          }

          return sMessage;
        } catch (e) {
          return oXHR.responseText || oXHR.statusText;
        }
      }

      // ---------------------------------------------------------
      // Build item payload
      // ---------------------------------------------------------
      function buildItemPayload(oLine, iSeq, sIndicator) {
        return {
          referencedocumentitem: String(iSeq * 10),

          initiator_recipient_ind: sIndicator,

          documentitemtext: (oLine.itemText || "").slice(0, 25),

          assignmentreference: (oLine.assignment || "").slice(0, 16),

          glaccount: (oLine.glAccount || "").slice(0, 10),

          business_partner: (oLine.businessPartner || "").slice(0, 10),

          currencycode: (oHeader.currency || "USD").slice(0, 5),

          amountintransactioncurrency: parseFloat(oLine.amountDC) || 0,

          debitcreditcode: oLine.debitCredit || "S",

          profitcenter: (oLine.profitCenter || "").slice(0, 10),

          taxcode: (oLine.taxCode || "").slice(0, 2),

          tax_amount: parseFloat(oLine.taxAmount) || 0,

          costcenter: (oLine.costCenter || "").slice(0, 10),
        };
      }

      // ---------------------------------------------------------
      // Header payload
      // ---------------------------------------------------------
      var oHdrPayload = {
        in_companycode: (oHeader.initiatorCC || "").slice(0, 4),

        rec_companycode: (oHeader.recipientCC || "").slice(0, 4),

        documentreferenceid: (oHeader.reference || "").slice(0, 16),

        documentheadertext: (oHeader.headerText || "").slice(0, 25),

        documentdate: toODataDate(oHeader.documentDate),

        postingdate: toODataDate(oHeader.postingDate),

        accountingdocumenttype: oHeader.documentTypeCode,

        mail_notif_ind: "X",

        currencycode: (oHeader.currency || "USD").slice(0, 5),

        amount: parseFloat(oHeader.totalIntercoAmount) || 0,

        tax_amount: parseFloat(oHeader.taxAmount) || 0,

        taxcode: (
          (sValidationSide === "I"
            ? oHeader.initiatorTaxCode
            : oHeader.recipientTaxCode) || ""
        ).slice(0, 2),
      };

      // ---------------------------------------------------------
      // Build BOTH Initiator + Recipient items
      // ---------------------------------------------------------
      // var aItemPayloads = [];

      // (aInitiatorLines || []).forEach(function (oLine, i) {

      //     aItemPayloads.push(
      //         buildItemPayload(
      //             oLine,
      //             i + 1,
      //             "I"
      //         )
      //     );
      // });

      // var iInitiatorCount = aItemPayloads.length;

      // (aRecipientLines || []).forEach(function (oLine, i) {

      //     aItemPayloads.push(
      //         buildItemPayload(
      //             oLine,
      //             iInitiatorCount + i + 1,
      //             "R"
      //         )
      //     );
      // });

      // ---------------------------------------------------------
      // Build items only for the side being validated
      // ---------------------------------------------------------
      var aItemPayloads = [];

      // ---------------------------------------------------------
      // Recipient items are offset by a fixed block so their
      // referencedocumentitem numbers never collide with the
      // Initiator items preserved alongside them in the same draft
      // (referencedocumentitem is the only item key — it is not
      // qualified by initiator_recipient_ind).
      // ---------------------------------------------------------
      var RECIPIENT_SEQ_OFFSET = 900;

      if (sValidationSide === "I") {
        // -----------------------------
        // INITIATOR VALIDATION
        // The system-generated Tax GL line gets "IT" instead of "I"
        // so it is distinguishable from regular Initiator lines.
        // -----------------------------
        (aInitiatorLines || []).forEach(function (oLine, i) {
          var sInd = oLine.isTaxGLLine ? "IT" : "I";
          aItemPayloads.push(buildItemPayload(oLine, i + 1, sInd));
        });
      } else if (sValidationSide === "R") {
        // -----------------------------
        // RECIPIENT VALIDATION
        // The system-generated Tax GL line gets "RT" instead of "R"
        // so it is distinguishable from regular Recipient lines.
        // -----------------------------
        (aRecipientLines || []).forEach(function (oLine, i) {
          var sInd = oLine.isTaxGLLine ? "RT" : "R";
          aItemPayloads.push(
            buildItemPayload(oLine, RECIPIENT_SEQ_OFFSET + i + 1, sInd),
          );
        });
      }

      console.log("[Validate] Validation Side:", sValidationSide);

      console.log("[Validate] Item payloads:", aItemPayloads);

      console.log("[Validate] Header payload:", oHdrPayload);

      console.log("[Validate] Item payloads:", aItemPayloads);

      // ---------------------------------------------------------
      // STEP 1
      // Fetch CSRF token
      // ---------------------------------------------------------
      return (
        this._fetchCsrfToken(sRoot)

          .then(function (sToken) {
            var oHdrs = {
              Accept: "application/json",

              "Content-Type": "application/json",

              "OData-Version": "4.0",

              "OData-MaxVersion": "4.0",

              "X-CSRF-Token": sToken,
            };

            // -------------------------------------------------
            // STEP 2
            // Branch A — first Validate:  POST new header draft.
            // Branch B — subsequent:       reuse existing draft ID.
            // -------------------------------------------------
            if (!sExistingDocId) {
              // ── Branch A: create a new header draft ──────────
              return new Promise(function (resolve, reject) {
                console.log("[Validate] Creating new draft header...");

                jQuery.ajax({
                  url: sRoot + "ZC_INTERCO_JE_HEADER",
                  method: "POST",
                  headers: oHdrs,
                  contentType: "application/json",
                  data: JSON.stringify(oHdrPayload),
                  success: function (oData) {
                    console.log("[Validate] Draft Header created:", oData);
                    var sDocId = oData.accountingdocument_temp;
                    if (!sDocId) {
                      reject(
                        new Error(
                          "Draft Header created but accountingdocument_temp was not returned.",
                        ),
                      );
                      return;
                    }
                    resolve({
                      docId: sDocId,
                      headers: oHdrs,
                      isExistingDraft: false,
                    });
                  },
                  error: function (oXHR) {
                    reject(
                      new Error(
                        "Draft Header creation failed [" +
                          oXHR.status +
                          "]: " +
                          parseError(oXHR),
                      ),
                    );
                  },
                });
              });
            } else {
              // ── Branch B: reuse existing document ─────────────
              // The document may still be a plain (never-activated)
              // draft — e.g. only Initiator Validate has run so far —
              // or it may already be ACTIVE because Submit to
              // Recipient has run (Submit activates the draft). An
              // active document has no IsActiveEntity=false sibling
              // to post/delete items against, so it must first be
              // put into Edit (creating a fresh draft) before this
              // Validate can touch its items.
              console.log(
                "[Validate] Reusing existing document:",
                sExistingDocId,
              );

              var sActiveKeyFrag =
                "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
                sExistingDocId +
                "',IsActiveEntity=true)";

              return new Promise(function (resolve, reject) {
                jQuery.ajax({
                  url: sRoot + sActiveKeyFrag,
                  method: "GET",
                  headers: oHdrs,
                  success: function () {
                    // Document is already active → Edit to get a
                    // fresh draft to validate against.
                    console.log(
                      "[Validate] Document is active — creating edit draft:",
                      sExistingDocId,
                    );

                    // A prior Validate on this same active document may
                    // already have created and left behind an edit
                    // draft (Simulate never activates it) — Edit then
                    // correctly reports 409 "draft already exists".
                    // That draft is exactly the one we want, so treat
                    // this specific 409 as success and reuse it instead
                    // of failing the Validate.
                    jQuery.ajax({
                      url:
                        sRoot +
                        sActiveKeyFrag +
                        "/com.sap.gateway.srvd.zsd_interco_app.v0001.Edit",
                      method: "POST",
                      headers: oHdrs,
                      contentType: "application/json",
                      data: JSON.stringify({ PreserveChanges: true }),
                      success: function () {
                        resolve({
                          docId: sExistingDocId,
                          headers: oHdrs,
                          isExistingDraft: true,
                        });
                      },
                      error: function (oXHR) {
                        if (oXHR.status === 409) {
                          console.log(
                            "[Validate] Edit draft already exists — reusing it:",
                            sExistingDocId,
                          );
                          resolve({
                            docId: sExistingDocId,
                            headers: oHdrs,
                            isExistingDraft: true,
                          });
                          return;
                        }
                        reject(
                          new Error(
                            "Edit (draft creation) failed [" +
                              oXHR.status +
                              "]: " +
                              parseError(oXHR),
                          ),
                        );
                      },
                    });
                  },
                  error: function () {
                    // Not active yet — a plain draft already exists
                    // from a prior Validate; reuse it as-is.
                    resolve({
                      docId: sExistingDocId,
                      headers: oHdrs,
                      isExistingDraft: true,
                    });
                  },
                });
              });
            }
          })

          // -----------------------------------------------------
          // STEP 3A  (existing draft only)
          // Clear only the items belonging to the side being
          // validated ("I" or "R"), so the other side's previously
          // saved items are preserved in the draft untouched.
          //
          // NOTE: If the item entity set name or key fields differ
          // from ZC_INTERCO_JE_ITEM / referencedocumentitem, adjust
          // the DELETE url below to match your backend CDS view.
          // -----------------------------------------------------
          .then(function (oCtx) {
            if (!oCtx.isExistingDraft) {
              return oCtx;
            }

            var sDocId = oCtx.docId;
            var sDraftKeyFrag =
              "ZC_INTERCO_JE_HEADER(" +
              "accountingdocument_temp='" +
              sDocId +
              "'," +
              "IsActiveEntity=false)";

            console.log(
              "[Validate] Clearing existing",
              sValidationSide,
              "items for draft:",
              sDocId,
            );

            return new Promise(function (resolve) {
              jQuery.ajax({
                url:
                  sRoot +
                  sDraftKeyFrag +
                  "/_Item?$select=referencedocumentitem,initiator_recipient_ind",
                method: "GET",
                headers: oCtx.headers,
                success: function (oData) {
                  var aAllExisting = oData.value || [];
                  // Also match the Tax GL line's own indicator ("IT"/"RT")
                  // so a previously-generated tax line is replaced too,
                  // not left behind as a stale duplicate.
                  var sTaxInd = sValidationSide + "T";
                  var aExisting = aAllExisting.filter(function (oItem) {
                    var sInd = String(
                      oItem.initiator_recipient_ind || "",
                    ).trim();
                    return sInd === sValidationSide || sInd === sTaxInd;
                  });
                  console.log(
                    "[Validate] Items to delete (",
                    sValidationSide,
                    "):",
                    aExisting.length,
                    "— preserving",
                    aAllExisting.length - aExisting.length,
                    "other-side item(s)",
                  );

                  var pDelete = Promise.resolve();

                  aExisting.forEach(function (oItem) {
                    pDelete = pDelete.then(function () {
                      return new Promise(function (resolveDel) {
                        var sItemRef = oItem.referencedocumentitem;
                        jQuery.ajax({
                          url:
                            sRoot +
                            "ZC_INTERCO_JE_ITEM(" +
                            "accountingdocument_temp='" +
                            sDocId +
                            "'," +
                            "referencedocumentitem='" +
                            sItemRef +
                            "'," +
                            "IsActiveEntity=false)",
                          method: "DELETE",
                          headers: oCtx.headers,
                          success: function () {
                            console.log("[Validate] Deleted item:", sItemRef);
                            resolveDel();
                          },
                          error: function (oXHR) {
                            console.warn(
                              "[Validate] Could not delete item " +
                                sItemRef +
                                " [" +
                                oXHR.status +
                                "] — continuing.",
                            );
                            resolveDel();
                          },
                        });
                      });
                    });
                  });

                  pDelete.then(function () {
                    resolve(oCtx);
                  });
                },
                error: function (oXHR) {
                  console.warn(
                    "[Validate] Could not fetch existing items [" +
                      oXHR.status +
                      "] — proceeding without clearing.",
                  );
                  resolve(oCtx);
                },
              });
            });
          })

          // -----------------------------------------------------
          // STEP 3B
          // Post all Initiator items to the draft
          // -----------------------------------------------------
          .then(function (oCtx) {
            var sDocId = oCtx.docId;

            var sDraftKeyFrag =
              "ZC_INTERCO_JE_HEADER(" +
              "accountingdocument_temp='" +
              sDocId +
              "',IsActiveEntity=false)";

            var pChain = Promise.resolve();

            aItemPayloads.forEach(function (oItem) {
              pChain = pChain.then(function () {
                return new Promise(function (resolve, reject) {
                  console.log("[Validate] Posting draft item:", oItem);

                  jQuery.ajax({
                    url: sRoot + sDraftKeyFrag + "/_Item",
                    method: "POST",
                    headers: oCtx.headers,
                    contentType: "application/json",
                    data: JSON.stringify(oItem),
                    success: function (oData) {
                      console.log("[Validate] Draft item posted:", oData);
                      resolve();
                    },
                    error: function (oXHR) {
                      reject(
                        new Error(
                          "Draft Item " +
                            oItem.referencedocumentitem +
                            " creation failed [" +
                            oXHR.status +
                            "]: " +
                            parseError(oXHR),
                        ),
                      );
                    },
                  });
                });
              });
            });

            return pChain.then(function () {
              return {
                docId: sDocId,
                headers: oCtx.headers,
                draftKey: sDraftKeyFrag,
              };
            });
          })

          // -----------------------------------------------------
          // STEP 4
          // Execute RAP Simulate — skipped when bSkipSimulate is
          // set (plain Save Draft does not need GL/tax simulation).
          // -----------------------------------------------------
          .then(function (oCtx) {
            if (bSkipSimulate) {
              console.log(
                "[SaveDraft] Skipping Simulate for draft:",
                oCtx.docId,
              );
              return {
                accountingdocument_temp: oCtx.docId,
                result: {},
              };
            }

            var sSimulateUrl =
              sRoot +
              oCtx.draftKey +
              "/com.sap.gateway.srvd.zsd_interco_app.v0001.Simulate";     

            console.log("[Validate] Calling Simulate:", sSimulateUrl);

            return new Promise(function (resolve, reject) {
              jQuery.ajax({
                url: sSimulateUrl,

                method: "POST",

                headers: oCtx.headers,

                contentType: "application/json",

                data: "{}",

                success: function (oData, sStatus, oXHR) {
                  console.log("================================");

                  console.log("[Validate] SIMULATE SUCCESS");

                  console.log("Document:", oCtx.docId);

                  console.log("Response:", oData);

                  console.log("================================");

                  resolve({
                    accountingdocument_temp: oCtx.docId,

                    result: oData,
                  });
                },

                error: function (oXHR) {
                  console.error(
                    "[Validate] SIMULATE FAILED",
                    oXHR.status,
                    oXHR.responseText,
                  );

                  reject(
                    new Error(
                      "Simulation failed [" +
                        oXHR.status +
                        "]: " +
                        parseError(oXHR),
                    ),
                  );
                },
              });
            });
          })
      );
    },



    saveDraftAndSimulate_RES: function (
      oHeader,
      aInitiatorLines,
      aRecipientLines,
      sExistingDocId,
      sValidationSide,
      bSkipSimulate,
    ) {
      var sRoot =
        "/sap/opu/odata4/sap/zsb_interco_app/srvd/sap/zsd_interco_app/0001/";

      // ---------------------------------------------------------
      // Convert UI5 date to OData V4 Edm.Date
      // ---------------------------------------------------------
      function toODataDate(s) {
        if (!s) {
          return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          return s;
        }

        var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

        if (m) {
          return (
            m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0")
          );
        }

        m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

        if (m) {
          return (
            m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0")
          );
        }

        return null;
      }

      // ---------------------------------------------------------
      // Parse SAP OData error
      // ---------------------------------------------------------
      function parseError(oXHR) {
        try {
          var oErr = JSON.parse(oXHR.responseText);

          var sMessage =
            oErr.error && oErr.error.message
              ? oErr.error.message
              : oXHR.responseText;

          // Include RAP details if available
          if (oErr.error && oErr.error.details) {
            sMessage +=
              "\n\n" +
              oErr.error.details
                .map(function (oDetail) {
                  return "• " + oDetail.message;
                })
                .join("\n");
          }

          return sMessage;
        } catch (e) {
          return oXHR.responseText || oXHR.statusText;
        }
      }

      // ---------------------------------------------------------
      // Build item payload
      // ---------------------------------------------------------
      function buildItemPayload(oLine, iSeq, sIndicator) {
        return {
          referencedocumentitem: String(iSeq * 10),

          initiator_recipient_ind: sIndicator,

          documentitemtext: (oLine.itemText || "").slice(0, 25),

          assignmentreference: (oLine.assignment || "").slice(0, 16),

          glaccount: (oLine.glAccount || "").slice(0, 10),

          business_partner: (oLine.businessPartner || "").slice(0, 10),

          currencycode: (oHeader.currency || "USD").slice(0, 5),

          amountintransactioncurrency: parseFloat(oLine.amountDC) || 0,

          debitcreditcode: oLine.debitCredit || "S",

          profitcenter: (oLine.profitCenter || "").slice(0, 10),

          taxcode: (oLine.taxCode || "").slice(0, 2),

          tax_amount: parseFloat(oLine.taxAmount) || 0,

          costcenter: (oLine.costCenter || "").slice(0, 10),
        };
      }

      // ---------------------------------------------------------
      // Header payload
      // ---------------------------------------------------------
      var oHdrPayload = {
        in_companycode: (oHeader.initiatorCC || "").slice(0, 4),

        rec_companycode: (oHeader.recipientCC || "").slice(0, 4),

        documentreferenceid: (oHeader.reference || "").slice(0, 16),

        documentheadertext: (oHeader.headerText || "").slice(0, 25),

        documentdate: toODataDate(oHeader.documentDate),

        postingdate: toODataDate(oHeader.postingDate),

        accountingdocumenttype: oHeader.documentTypeCode,

        mail_notif_ind: "X",

        currencycode: (oHeader.currency || "USD").slice(0, 5),

        amount: parseFloat(oHeader.totalIntercoAmount) || 0,

        tax_amount: parseFloat(oHeader.taxAmount) || 0,

        taxcode: (
          (sValidationSide === "I"
            ? oHeader.initiatorTaxCode
            : oHeader.recipientTaxCode) || ""
        ).slice(0, 2),
      };

      // ---------------------------------------------------------
      // Build BOTH Initiator + Recipient items
      // ---------------------------------------------------------
      // var aItemPayloads = [];

      // (aInitiatorLines || []).forEach(function (oLine, i) {

      //     aItemPayloads.push(
      //         buildItemPayload(
      //             oLine,
      //             i + 1,
      //             "I"
      //         )
      //     );
      // });

      // var iInitiatorCount = aItemPayloads.length;

      // (aRecipientLines || []).forEach(function (oLine, i) {

      //     aItemPayloads.push(
      //         buildItemPayload(
      //             oLine,
      //             iInitiatorCount + i + 1,
      //             "R"
      //         )
      //     );
      // });

      // ---------------------------------------------------------
      // Build items only for the side being validated
      // ---------------------------------------------------------
      var aItemPayloads = [];

      // ---------------------------------------------------------
      // Recipient items are offset by a fixed block so their
      // referencedocumentitem numbers never collide with the
      // Initiator items preserved alongside them in the same draft
      // (referencedocumentitem is the only item key — it is not
      // qualified by initiator_recipient_ind).
      // ---------------------------------------------------------
      var RECIPIENT_SEQ_OFFSET = 900;

      if (sValidationSide === "I") {
        // -----------------------------
        // INITIATOR VALIDATION
        // The system-generated Tax GL line gets "IT" instead of "I"
        // so it is distinguishable from regular Initiator lines.
        // -----------------------------
        (aInitiatorLines || []).forEach(function (oLine, i) {
          var sInd = oLine.isTaxGLLine ? "IT" : "I";
          aItemPayloads.push(buildItemPayload(oLine, i + 1, sInd));
        });
      } else if (sValidationSide === "R") {
        // -----------------------------
        // RECIPIENT VALIDATION
        // The system-generated Tax GL line gets "RT" instead of "R"
        // so it is distinguishable from regular Recipient lines.
        // -----------------------------
        (aRecipientLines || []).forEach(function (oLine, i) {
          var sInd = oLine.isTaxGLLine ? "RT" : "R";
          aItemPayloads.push(
            buildItemPayload(oLine, RECIPIENT_SEQ_OFFSET + i + 1, sInd),
          );
        });
      }

      console.log("[Validate] Validation Side:", sValidationSide);

      console.log("[Validate] Item payloads:", aItemPayloads);

      console.log("[Validate] Header payload:", oHdrPayload);

      console.log("[Validate] Item payloads:", aItemPayloads);

      // ---------------------------------------------------------
      // STEP 1
      // Fetch CSRF token
      // ---------------------------------------------------------
      return (
        this._fetchCsrfToken(sRoot)

          .then(function (sToken) {
            var oHdrs = {
              Accept: "application/json",

              "Content-Type": "application/json",

              "OData-Version": "4.0",

              "OData-MaxVersion": "4.0",

              "X-CSRF-Token": sToken,
            };

            // -------------------------------------------------
            // STEP 2
            // Branch A — first Validate:  POST new header draft.
            // Branch B — subsequent:       reuse existing draft ID.
            // -------------------------------------------------
            if (!sExistingDocId) {
              // ── Branch A: create a new header draft ──────────
              return new Promise(function (resolve, reject) {
                console.log("[Validate] Creating new draft header...");

                jQuery.ajax({
                  url: sRoot + "ZC_INTERCO_JE_HEADER",
                  method: "POST",
                  headers: oHdrs,
                  contentType: "application/json",
                  data: JSON.stringify(oHdrPayload),
                  success: function (oData) {
                    console.log("[Validate] Draft Header created:", oData);
                    var sDocId = oData.accountingdocument_temp;
                    if (!sDocId) {
                      reject(
                        new Error(
                          "Draft Header created but accountingdocument_temp was not returned.",
                        ),
                      );
                      return;
                    }
                    resolve({
                      docId: sDocId,
                      headers: oHdrs,
                      isExistingDraft: false,
                    });
                  },
                  error: function (oXHR) {
                    reject(
                      new Error(
                        "Draft Header creation failed [" +
                          oXHR.status +
                          "]: " +
                          parseError(oXHR),
                      ),
                    );
                  },
                });
              });
            } else {
              // ── Branch B: reuse existing document ─────────────
              // The document may still be a plain (never-activated)
              // draft — e.g. only Initiator Validate has run so far —
              // or it may already be ACTIVE because Submit to
              // Recipient has run (Submit activates the draft). An
              // active document has no IsActiveEntity=false sibling
              // to post/delete items against, so it must first be
              // put into Edit (creating a fresh draft) before this
              // Validate can touch its items.
              console.log(
                "[Validate] Reusing existing document:",
                sExistingDocId,
              );

              var sActiveKeyFrag =
                "ZC_INTERCO_JE_HEADER(accountingdocument_temp='" +
                sExistingDocId +
                "',IsActiveEntity=true)";

              return new Promise(function (resolve, reject) {
                jQuery.ajax({
                  url: sRoot + sActiveKeyFrag,
                  method: "GET",
                  headers: oHdrs,
                  success: function () {
                    // Document is already active → Edit to get a
                    // fresh draft to validate against.
                    console.log(
                      "[Validate] Document is active — creating edit draft:",
                      sExistingDocId,
                    );

                    // A prior Validate on this same active document may
                    // already have created and left behind an edit
                    // draft (Simulate never activates it) — Edit then
                    // correctly reports 409 "draft already exists".
                    // That draft is exactly the one we want, so treat
                    // this specific 409 as success and reuse it instead
                    // of failing the Validate.
                    jQuery.ajax({
                      url:
                        sRoot +
                        sActiveKeyFrag +
                        "/com.sap.gateway.srvd.zsd_interco_app.v0001.Edit",
                      method: "POST",
                      headers: oHdrs,
                      contentType: "application/json",
                      data: JSON.stringify({ PreserveChanges: true }),
                      success: function () {
                        resolve({
                          docId: sExistingDocId,
                          headers: oHdrs,
                          isExistingDraft: true,
                        });
                      },
                      error: function (oXHR) {
                        if (oXHR.status === 409) {
                          console.log(
                            "[Validate] Edit draft already exists — reusing it:",
                            sExistingDocId,
                          );
                          resolve({
                            docId: sExistingDocId,
                            headers: oHdrs,
                            isExistingDraft: true,
                          });
                          return;
                        }
                        reject(
                          new Error(
                            "Edit (draft creation) failed [" +
                              oXHR.status +
                              "]: " +
                              parseError(oXHR),
                          ),
                        );
                      },
                    });
                  },
                  error: function () {
                    // Not active yet — a plain draft already exists
                    // from a prior Validate; reuse it as-is.
                    resolve({
                      docId: sExistingDocId,
                      headers: oHdrs,
                      isExistingDraft: true,
                    });
                  },
                });
              });
            }
          })

          // -----------------------------------------------------
          // STEP 3A  (existing draft only)
          // Clear only the items belonging to the side being
          // validated ("I" or "R"), so the other side's previously
          // saved items are preserved in the draft untouched.
          //
          // NOTE: If the item entity set name or key fields differ
          // from ZC_INTERCO_JE_ITEM / referencedocumentitem, adjust
          // the DELETE url below to match your backend CDS view.
          // -----------------------------------------------------
          .then(function (oCtx) {
            if (!oCtx.isExistingDraft) {
              return oCtx;
            }

            var sDocId = oCtx.docId;
            var sDraftKeyFrag =
              "ZC_INTERCO_JE_HEADER(" +
              "accountingdocument_temp='" +
              sDocId +
              "'," +
              "IsActiveEntity=false)";

            console.log(
              "[Validate] Clearing existing",
              sValidationSide,
              "items for draft:",
              sDocId,
            );

            return new Promise(function (resolve) {
              jQuery.ajax({
                url:
                  sRoot +
                  sDraftKeyFrag +
                  "/_Item?$select=referencedocumentitem,initiator_recipient_ind",
                method: "GET",
                headers: oCtx.headers,
                success: function (oData) {
                  var aAllExisting = oData.value || [];
                  // Also match the Tax GL line's own indicator ("IT"/"RT")
                  // so a previously-generated tax line is replaced too,
                  // not left behind as a stale duplicate.
                  var sTaxInd = sValidationSide + "T";
                  var aExisting = aAllExisting.filter(function (oItem) {
                    var sInd = String(
                      oItem.initiator_recipient_ind || "",
                    ).trim();
                    return sInd === sValidationSide || sInd === sTaxInd;
                  });
                  console.log(
                    "[Validate] Items to delete (",
                    sValidationSide,
                    "):",
                    aExisting.length,
                    "— preserving",
                    aAllExisting.length - aExisting.length,
                    "other-side item(s)",
                  );

                  var pDelete = Promise.resolve();

                  aExisting.forEach(function (oItem) {
                    pDelete = pDelete.then(function () {
                      return new Promise(function (resolveDel) {
                        var sItemRef = oItem.referencedocumentitem;
                        jQuery.ajax({
                          url:
                            sRoot +
                            "ZC_INTERCO_JE_ITEM(" +
                            "accountingdocument_temp='" +
                            sDocId +
                            "'," +
                            "referencedocumentitem='" +
                            sItemRef +
                            "'," +
                            "IsActiveEntity=false)",
                          method: "DELETE",
                          headers: oCtx.headers,
                          success: function () {
                            console.log("[Validate] Deleted item:", sItemRef);
                            resolveDel();
                          },
                          error: function (oXHR) {
                            console.warn(
                              "[Validate] Could not delete item " +
                                sItemRef +
                                " [" +
                                oXHR.status +
                                "] — continuing.",
                            );
                            resolveDel();
                          },
                        });
                      });
                    });
                  });

                  pDelete.then(function () {
                    resolve(oCtx);
                  });
                },
                error: function (oXHR) {
                  console.warn(
                    "[Validate] Could not fetch existing items [" +
                      oXHR.status +
                      "] — proceeding without clearing.",
                  );
                  resolve(oCtx);
                },
              });
            });
          })

          // -----------------------------------------------------
          // STEP 3B
          // Post all Initiator items to the draft
          // -----------------------------------------------------
          .then(function (oCtx) {
            var sDocId = oCtx.docId;

            var sDraftKeyFrag =
              "ZC_INTERCO_JE_HEADER(" +
              "accountingdocument_temp='" +
              sDocId +
              "',IsActiveEntity=false)";

            var pChain = Promise.resolve();

            aItemPayloads.forEach(function (oItem) {
              pChain = pChain.then(function () {
                return new Promise(function (resolve, reject) {
                  console.log("[Validate] Posting draft item:", oItem);

                  jQuery.ajax({
                    url: sRoot + sDraftKeyFrag + "/_Item",
                    method: "POST",
                    headers: oCtx.headers,
                    contentType: "application/json",
                    data: JSON.stringify(oItem),
                    success: function (oData) {
                      console.log("[Validate] Draft item posted:", oData);
                      resolve();
                    },
                    error: function (oXHR) {
                      reject(
                        new Error(
                          "Draft Item " +
                            oItem.referencedocumentitem +
                            " creation failed [" +
                            oXHR.status +
                            "]: " +
                            parseError(oXHR),
                        ),
                      );
                    },
                  });
                });
              });
            });

            return pChain.then(function () {
              return {
                docId: sDocId,
                headers: oCtx.headers,
                draftKey: sDraftKeyFrag,
              };
            });
          })

          // -----------------------------------------------------
          // STEP 4
          // Execute RAP Simulate — skipped when bSkipSimulate is
          // set (plain Save Draft does not need GL/tax simulation).
          // -----------------------------------------------------
          .then(function (oCtx) {
            if (bSkipSimulate) {
              console.log(
                "[SaveDraft] Skipping Simulate for draft:",
                oCtx.docId,
              );
              return {
                accountingdocument_temp: oCtx.docId,
                result: {},
              };
            }

            var sSimulateUrl =
              sRoot +
              oCtx.draftKey +
              "/com.sap.gateway.srvd.zsd_interco_app.v0001.REC_Simulate";

            console.log("[Validate] Calling Simulate:", sSimulateUrl);

            return new Promise(function (resolve, reject) {
              jQuery.ajax({
                url: sSimulateUrl,

                method: "POST",

                headers: oCtx.headers,

                contentType: "application/json",

                data: "{}",

                success: function (oData, sStatus, oXHR) {
                  console.log("================================");

                  console.log("[Validate] SIMULATE SUCCESS");

                  console.log("Document:", oCtx.docId);

                  console.log("Response:", oData);

                  console.log("================================");

                  resolve({
                    accountingdocument_temp: oCtx.docId,

                    result: oData,
                  });
                },

                error: function (oXHR) {
                  console.error(
                    "[Validate] SIMULATE FAILED",
                    oXHR.status,
                    oXHR.responseText,
                  );

                  reject(
                    new Error(
                      "Simulation failed [" +
                        oXHR.status +
                        "]: " +
                        parseError(oXHR),
                    ),
                  );
                },
              });
            });
          })
      );
    },
  };
});
