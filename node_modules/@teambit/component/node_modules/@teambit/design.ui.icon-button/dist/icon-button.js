"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IconButton = void 0;
const react_1 = __importDefault(require("react"));
const classnames_1 = __importDefault(require("classnames"));
const base_ui_input_button_1 = __importDefault(require("@teambit/base-ui.input.button"));
const base_ui_elements_icon_1 = require("@teambit/base-ui.elements.icon");
const icon_button_module_scss_1 = __importDefault(require("./icon-button.module.scss"));
const sizes_module_scss_1 = __importDefault(require("./sizes.module.scss"));
/**
 *
 * Generic button that supports text, icon and integration of both
 */
function IconButton(_a) {
    var { icon, className, children, iconClass, active, priority = 'ghost', size = 'm' } = _a, rest = __rest(_a, ["icon", "className", "children", "iconClass", "active", "priority", "size"]);
    return (react_1.default.createElement(base_ui_input_button_1.default, Object.assign({}, rest, { className: (0, classnames_1.default)(icon_button_module_scss_1.default.iconButton, sizes_module_scss_1.default.buttonSizes, active && icon_button_module_scss_1.default.active, icon && !children && icon_button_module_scss_1.default.iconOnly, className), "data-priority": priority, "data-size": size }),
        icon && (react_1.default.createElement(base_ui_elements_icon_1.BaseIcon, { className: (0, classnames_1.default)(icon_button_module_scss_1.default.icon, active && icon_button_module_scss_1.default.active, children && icon_button_module_scss_1.default.margin, iconClass), of: `bitcon-${icon}` })),
        children));
}
exports.IconButton = IconButton;
//# sourceMappingURL=icon-button.js.map