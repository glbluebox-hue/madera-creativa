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
exports.Icon = void 0;
const react_1 = __importDefault(require("react"));
const base_ui_elements_icon_1 = require("@teambit/base-ui.elements.icon");
const iconSetPrefix = 'bitcon';
/**
 * Placeholder for an icon, from Bit.dev's icon font.
 *
 * @name Icon
 * @example
 * // Embed icon at the document root:
 * <EvaIconFont query="sdfj4k2d"/>
 *
 * // Then use icon anywhere in the document:
 * <Icon of="spinner"/>
 */
function Icon(_a) {
    var { className, of: iconName } = _a, rest = __rest(_a, ["className", "of"]);
    return (react_1.default.createElement(base_ui_elements_icon_1.BaseIcon, Object.assign({ of: `${iconSetPrefix}-${iconName}`, className: className, "data-bit-id": "teambit.evangelist/elements/icon" }, rest)));
}
exports.Icon = Icon;
//# sourceMappingURL=icon.js.map