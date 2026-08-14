sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, History, MessageBox, MessageToast) {
    "use strict";

    /**
     * BaseController
     *
     * Extends sap/ui/core/mvc/Controller with shortcuts used across every
     * controller in the application. All project controllers extend this class
     * instead of Controller directly.
     *
     * Responsibilities:
     *  - Model access shortcuts (getModel / setModel)
     *  - i18n text retrieval
     *  - Router navigation helpers
     *  - Unified busy state management
     *  - Unified messaging (MessageBox / MessageToast wrappers)
     */
    return Controller.extend("ZFI_INTERCO.controller.BaseController", {

        // ─── Model ───────────────────────────────────────────────────────────

        /**
         * Returns the named model from the view, falling back to the component.
         * Calling getModel() with no argument returns the default (unnamed) model.
         *
         * @param {string} [sName] Model name
         * @returns {sap.ui.model.Model}
         */
        getModel: function (sName) {
            return this.getView().getModel(sName)
                || this.getOwnerComponent().getModel(sName);
        },

        /**
         * Sets a model on the view.
         *
         * @param {sap.ui.model.Model} oModel
         * @param {string} [sName] Model name
         * @returns {sap.ui.mvc.View}
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        // ─── i18n ─────────────────────────────────────────────────────────────

        /**
         * Retrieves a translated text string from the i18n resource bundle.
         *
         * @param {string} sKey   i18n key
         * @param {Array}  [aArgs] Optional placeholder values
         * @returns {string}
         */
        getI18nText: function (sKey, aArgs) {
            return this.getOwnerComponent()
                       .getModel("i18n")
                       .getResourceBundle()
                       .getText(sKey, aArgs);
        },

        // ─── Router ───────────────────────────────────────────────────────────

        /**
         * Returns the application router instance.
         *
         * @returns {sap.m.routing.Router}
         */
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },

        /**
         * Navigates to a named route.
         *
         * @param {string} sRouteName
         * @param {object} [oParameters]
         * @param {boolean} [bReplace] Replace current hash (no history entry)
         */
        navTo: function (sRouteName, oParameters, bReplace) {
            this.getRouter().navTo(sRouteName, oParameters || {}, bReplace);
        },

        /**
         * Navigates back in browser history, or to the default route if there
         * is no history entry (e.g. user opened the app via a bookmark).
         */
        navBack: function () {
            var sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.navTo("createTransaction", {}, true);
            }
        },

        // ─── Busy state ───────────────────────────────────────────────────────

        /**
         * Sets the application-level busy indicator via the model property
         * /appState/isBusy, which is bound to ObjectPageLayout's busy property.
         *
         * @param {boolean} bBusy
         */
        setBusy: function (bBusy) {
            this.getModel().setProperty("/appState/isBusy", bBusy);
        },

        // ─── Messaging ────────────────────────────────────────────────────────

        showError: function (sMessage, sTitle) {
            MessageBox.error(sMessage, { title: sTitle || "Error" });
        },

        showSuccess: function (sMessage, sTitle) {
            MessageBox.success(sMessage, { title: sTitle || "Success" });
        },

        showWarning: function (sMessage, sTitle) {
            MessageBox.warning(sMessage, { title: sTitle || "Warning" });
        },

        /**
         * Displays a confirmation dialog and invokes a callback with the user's
         * choice. Compatible with MessageBox.Action constants.
         *
         * @param {string}   sMessage
         * @param {function} fnCallback  Called with the selected action string
         * @param {object}   [oOptions]  Additional MessageBox.confirm options
         */
        showConfirm: function (sMessage, fnCallback, oOptions) {
            MessageBox.confirm(
                sMessage,
                Object.assign({ onClose: fnCallback }, oOptions || {})
            );
        },

        showToast: function (sMessage) {
            MessageToast.show(sMessage);
        }

    });
});
