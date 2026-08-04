"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuccessButton = exports.DangerDisabledButton = exports.LargeDangerButton = exports.DangerButton = exports.CtaDisableButton = exports.LargeCtaButton = exports.CtaButtonWithIcon = exports.CtaButton = exports.GhostDisableButton = exports.DefaultButton = exports.SmallActiveIconOnlyWithOverrideSize = exports.ActiveWithIconButtonExample = exports.ActiveButtonExample = exports.LoadingButtonExample = exports.TextOnlyButtonExample = exports.IconOnlyButtonExample = exports.IconButtonDisabled = exports.IconButtonExample = void 0;
const react_1 = __importDefault(require("react"));
const base_ui_theme_accent_color_1 = require("@teambit/base-ui.theme.accent-color");
const icon_button_1 = require("./icon-button");
function IconButtonExample() {
    return (react_1.default.createElement(icon_button_1.IconButton, { id: "icon-and-text", icon: "error-circle" }, "Terminate"));
}
exports.IconButtonExample = IconButtonExample;
function IconButtonDisabled() {
    return (react_1.default.createElement(icon_button_1.IconButton, { id: "disabled-icon-button", icon: "error-circle", disabled: true }, "Terminate"));
}
exports.IconButtonDisabled = IconButtonDisabled;
function IconOnlyButtonExample() {
    return react_1.default.createElement(icon_button_1.IconButton, { id: "icon-only", icon: "error-circle" });
}
exports.IconOnlyButtonExample = IconOnlyButtonExample;
function TextOnlyButtonExample() {
    return react_1.default.createElement(icon_button_1.IconButton, null, "Terminate");
}
exports.TextOnlyButtonExample = TextOnlyButtonExample;
function LoadingButtonExample() {
    return react_1.default.createElement(icon_button_1.IconButton, { loading: true });
}
exports.LoadingButtonExample = LoadingButtonExample;
function ActiveButtonExample() {
    return react_1.default.createElement(icon_button_1.IconButton, { active: true }, "Terminate");
}
exports.ActiveButtonExample = ActiveButtonExample;
function ActiveWithIconButtonExample() {
    return (react_1.default.createElement(icon_button_1.IconButton, { active: true, icon: "error-circle" }, "Terminate"));
}
exports.ActiveWithIconButtonExample = ActiveWithIconButtonExample;
function SmallActiveIconOnlyWithOverrideSize() {
    return react_1.default.createElement(icon_button_1.IconButton, { icon: "plus", active: true, size: null, style: { width: 24, height: 24, justifyContent: 'center' } });
}
exports.SmallActiveIconOnlyWithOverrideSize = SmallActiveIconOnlyWithOverrideSize;
function DefaultButton() {
    return react_1.default.createElement(icon_button_1.IconButton, { priority: "ghost" }, "Update");
}
exports.DefaultButton = DefaultButton;
function GhostDisableButton() {
    return (react_1.default.createElement(icon_button_1.IconButton, { priority: "ghost", disabled: true }, "Update"));
}
exports.GhostDisableButton = GhostDisableButton;
function CtaButton() {
    return react_1.default.createElement(icon_button_1.IconButton, { priority: "cta" }, "Save");
}
exports.CtaButton = CtaButton;
function CtaButtonWithIcon() {
    return (react_1.default.createElement(icon_button_1.IconButton, { priority: "cta", icon: "download" }, "Save"));
}
exports.CtaButtonWithIcon = CtaButtonWithIcon;
function LargeCtaButton() {
    return (react_1.default.createElement(icon_button_1.IconButton, { priority: "cta", size: "l" }, "Save"));
}
exports.LargeCtaButton = LargeCtaButton;
function CtaDisableButton() {
    return (react_1.default.createElement(icon_button_1.IconButton, { priority: "cta", disabled: true }, "Delete"));
}
exports.CtaDisableButton = CtaDisableButton;
function DangerButton() {
    return (react_1.default.createElement(icon_button_1.IconButton, { priority: "cta", className: base_ui_theme_accent_color_1.colorPalette.error }, "Delete"));
}
exports.DangerButton = DangerButton;
function LargeDangerButton() {
    return (react_1.default.createElement(icon_button_1.IconButton, { priority: "cta", size: "l", className: base_ui_theme_accent_color_1.colorPalette.error }, "Delete"));
}
exports.LargeDangerButton = LargeDangerButton;
function DangerDisabledButton() {
    return (react_1.default.createElement(icon_button_1.IconButton, { priority: "cta", disabled: true, className: base_ui_theme_accent_color_1.colorPalette.error }, "Delete"));
}
exports.DangerDisabledButton = DangerDisabledButton;
function SuccessButton() {
    return (react_1.default.createElement(icon_button_1.IconButton, { priority: "cta", className: base_ui_theme_accent_color_1.colorPalette.success }, "Saved!"));
}
exports.SuccessButton = SuccessButton;
// export function WarningButton() {
//   return (
//     <IconButton priority="cta" className={colorPalette.warning}>
//       Make Admin?
//     </IconButton>
//   );
// }
//# sourceMappingURL=icon-button.compositions.js.map