sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, Device, JSONModel) {
    "use strict";

    return UIComponent.extend("ZFI_INTERCO.Component", {

        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Device model — enables {device>/system/desktop} bindings in XML views.
            // OneWay because Device properties are read-only at runtime.
            var oDeviceModel = new JSONModel(Device);
            oDeviceModel.setDefaultBindingMode("OneWay");
            this.setModel(oDeviceModel, "device");

            // Initialise router declared in manifest.json sap.ui5/routing.
            // Routes are empty for now; will be populated when view refactoring begins.
            this.getRouter().initialize();
        }
    });
});
