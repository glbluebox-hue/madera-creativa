"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_2 = require("@testing-library/react");
const icon_composition_1 = require("./icon.composition");
it('should render correclty', () => {
    (0, react_2.render)(react_1.default.createElement(icon_composition_1.IconExamples, null));
});
//# sourceMappingURL=icon.spec.js.map