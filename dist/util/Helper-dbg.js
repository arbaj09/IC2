sap.ui.define([], function () {
    "use strict";

    // ── Private calendar helpers ─────────────────────────────────────────────────

    function _isLeapYear(nYear) {
        return (nYear % 4 === 0 && nYear % 100 !== 0) || (nYear % 400 === 0);
    }

    function _daysInMonth(nMonth, nYear) {
        var aDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (nMonth === 2 && _isLeapYear(nYear)) return 29;
        return aDays[nMonth] || 0;
    }

    function _isValidDate(nDay, nMonth, nYear) {
        if (nYear < 1 || nMonth < 1 || nMonth > 12 || nDay < 1) return false;
        return nDay <= _daysInMonth(nMonth, nYear);
    }

    // ── Public API ───────────────────────────────────────────────────────────────

    return Object.freeze({

        /**
         * Parses a date string in three formats:
         *   "DD.MM.YYYY"  — SAP / European notation
         *   "MM/DD/YYYY"  — US notation
         *   "YYYY-MM-DD"  — ISO 8601
         *
         * Returns { day, month, year } (all numbers), or null when:
         *   - input is falsy or contains no recognised separator
         *   - the resulting calendar date is invalid (e.g. "32.13.2024")
         *
         * @param {string} sDateStr
         * @returns {{ day: number, month: number, year: number } | null}
         */
        parseDate: function (sDateStr) {
            if (!sDateStr) return null;
            var parts, nDay, nMonth, nYear;

            if (sDateStr.indexOf(".") > -1) {
                parts = sDateStr.split(".");
                if (parts.length !== 3) return null;
                nDay = +parts[0]; nMonth = +parts[1]; nYear = +parts[2];
            } else if (sDateStr.indexOf("/") > -1) {
                parts = sDateStr.split("/");
                if (parts.length !== 3) return null;
                nDay = +parts[1]; nMonth = +parts[0]; nYear = +parts[2];
            } else if (sDateStr.indexOf("-") > -1) {
                parts = sDateStr.split("-");
                if (parts.length !== 3) return null;
                nDay = +parts[2]; nMonth = +parts[1]; nYear = +parts[0];
            } else {
                return null;
            }

            if (!_isValidDate(nDay, nMonth, nYear)) return null;
            return { day: nDay, month: nMonth, year: nYear };
        },

        /**
         * Converts a byte count to a human-readable file size string.
         *
         * Returns null for zero, negative, or non-numeric input.
         * The caller is responsible for any display placeholder (e.g. "—").
         *
         * @param {number} nBytes
         * @returns {string | null}  e.g. "512 B", "48.0 KB", "2.1 MB", "1.2 GB"
         */
        formatFileSize: function (nBytes) {
            if (!nBytes || nBytes < 0) return null;
            if (nBytes >= 1073741824) return (nBytes / 1073741824).toFixed(1) + " GB";
            if (nBytes >= 1048576)    return (nBytes / 1048576).toFixed(1) + " MB";
            if (nBytes >= 1024)       return (nBytes / 1024).toFixed(1) + " KB";
            return nBytes + " B";
        }

    });
});
