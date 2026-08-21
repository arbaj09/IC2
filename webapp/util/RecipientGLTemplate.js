sap.ui.define([], function () {
    "use strict";

    // ── Sheet / file identity ──────────────────────────────────────────────────
    var SHEET_NAME = "Recipient GL";
    var FILE_NAME  = "Recipient_GL_Template.xlsx";

    // ── Header cell style ──────────────────────────────────────────────────────
    var HEADER_STYLE = {
        font: {
            bold:  true,
            size:  11,
            color: { argb: "FFFFFFFF" }
        },
        fill: {
            type:    "pattern",
            pattern: "solid",
            fgColor: { argb: "FF2E75B6" }
        },
        alignment: {
            vertical:   "middle",
            horizontal: "center",
            wrapText:   false
        },
        border: {
            top:    { style: "thin", color: { argb: "FF1F4E79" } },
            left:   { style: "thin", color: { argb: "FF1F4E79" } },
            bottom: { style: "thin", color: { argb: "FF1F4E79" } },
            right:  { style: "thin", color: { argb: "FF1F4E79" } }
        }
    };

    // ── Column definitions (Recipient-specific) ────────────────────────────────
    // To add / remove / reorder Recipient columns, edit ONLY this array.
    // Changes here have ZERO effect on InitiatorGLTemplate.js.
    //
    // type "string" → exported as text (preserves leading zeroes on SAP IDs)
    // type "number" → exported as numeric value
    var COLUMNS = [
        { header: "D/C",           key: "debitCredit",     width: 8,  type: "string" },
        { header: "GL Account",    key: "glAccount",       width: 15, type: "string" },
        { header: "Bus.Partner",   key: "businessPartner", width: 14, type: "string" },
        { header: "Amount (DC)",   key: "amountDC",        width: 15, type: "number" },
        { header: "Tax Code",      key: "taxCode",         width: 11, type: "string" },
        { header: "Trdg Ptnr",    key: "tradingPartner",  width: 12, type: "string" },
        { header: "Ptnr PrCtr",   key: "partnerPrCtr",    width: 12, type: "string" },
        { header: "WBS Element",   key: "wbsElement",      width: 14, type: "string" },
        { header: "Cost Center",   key: "costCenter",      width: 14, type: "string" },
        { header: "Profit Center", key: "profitCenter",    width: 14, type: "string" },
        { header: "Int.Order",     key: "internalOrder",   width: 12, type: "string" },
        { header: "Personnel",     key: "personnel",       width: 11, type: "string" },
        { header: "Contract",      key: "contract",        width: 12, type: "string" },
        { header: "Ctr Type",      key: "contractType",    width: 10, type: "string" },
        { header: "Assignment",    key: "assignment",      width: 14, type: "string" },
        { header: "Item Text",     key: "itemText",        width: 22, type: "string" },
        { header: "LineRef1",      key: "lineRef1",        width: 12, type: "string" },
        { header: "LineRef2",      key: "lineRef2",        width: 12, type: "string" },
        { header: "LineRef3",      key: "lineRef3",        width: 12, type: "string" }
    ];

    // ── Internal: build workbook and trigger browser download ──────────────────
    function _buildAndDownload(aLines) {
        var workbook = new window.ExcelJS.Workbook();
        var sheet    = workbook.addWorksheet(SHEET_NAME);

        // Column widths + header text + key mapping
        sheet.columns = COLUMNS.map(function (oCol) {
            return { header: oCol.header, key: oCol.key, width: oCol.width };
        });

        // Bold + styled header row (row 1 is created by sheet.columns above)
        sheet.getRow(1).height = 22;
        sheet.getRow(1).eachCell(function (oCell) {
            oCell.font      = HEADER_STYLE.font;
            oCell.fill      = HEADER_STYLE.fill;
            oCell.alignment = HEADER_STYLE.alignment;
            oCell.border    = HEADER_STYLE.border;
        });

        // Data rows
        // ── To exclude rows later, add a .filter() here before the forEach ──
        aLines.forEach(function (oLine) {
            var oRow = {};
            COLUMNS.forEach(function (oCol) {
                var vVal = oLine[oCol.key];
                if (oCol.type === "number") {
                    var nVal = parseFloat(vVal);
                    oRow[oCol.key] = isNaN(nVal) ? 0 : nVal;
                } else {
                    oRow[oCol.key] =
                        (vVal === null || vVal === undefined) ? "" : String(vVal);
                }
            });
            sheet.addRow(oRow);
        });

        // Write to buffer → Blob → anchor-click download
        return workbook.xlsx.writeBuffer().then(function (oBuffer) {
            var oBlob = new Blob(
                [oBuffer],
                { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
            );
            var sUrl  = URL.createObjectURL(oBlob);
            var oLink = document.createElement("a");
            oLink.href     = sUrl;
            oLink.download = FILE_NAME;
            oLink.style.display = "none";
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            URL.revokeObjectURL(sUrl);
        });
    }

    // ── Public API ─────────────────────────────────────────────────────────────
    return {

        /**
         * Reads /recipientLines from the model and downloads Recipient_GL_Template.xlsx.
         * All rows exported — no filtering at this stage.
         *
         * @param {Array} aLines  Current /recipientLines array from the JSON model.
         */
        download: function (aLines) {
            if (!aLines || aLines.length === 0) {
                sap.m.MessageToast.show(
                    "No Recipient GL lines available for download."
                );
                return;
            }

            if (!window.ExcelJS) {
                sap.m.MessageToast.show(
                    "ExcelJS library is not loaded. Cannot generate Excel file."
                );
                console.error("RecipientGLTemplate: window.ExcelJS is not defined.");
                return;
            }

            _buildAndDownload(aLines).catch(function (oError) {
                console.error(
                    "RecipientGLTemplate: Excel generation failed:", oError
                );
                sap.m.MessageToast.show(
                    "Failed to generate Recipient Excel file."
                );
            });
        }

    };
});
