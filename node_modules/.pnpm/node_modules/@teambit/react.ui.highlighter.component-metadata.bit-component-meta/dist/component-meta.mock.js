"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockedComponentWithMeta = void 0;
const react_1 = __importDefault(require("react"));
const component_meta_1 = require("./component-meta");
function MockedComponentWithMeta(props) {
    return react_1.default.createElement("button", Object.assign({ type: "button" }, props));
}
exports.MockedComponentWithMeta = MockedComponentWithMeta;
MockedComponentWithMeta[component_meta_1.componentMetaField] = {
    // could use a non-bit-id to render the "default" bubble
    id: 'teambit.base-ui/input/button',
};
//# sourceMappingURL=component-meta.mock.js.map