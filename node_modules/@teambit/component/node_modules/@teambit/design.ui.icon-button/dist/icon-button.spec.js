"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_2 = require("@testing-library/react");
const icon_button_compositions_1 = require("./icon-button.compositions");
describe('IconButton', () => {
    it('should render the text in the button', () => {
        const { getByText } = (0, react_2.render)(react_1.default.createElement(icon_button_compositions_1.IconButtonExample, null));
        const result = getByText('Terminate');
        expect(result).toBeInTheDocument();
    });
    it('should render a disabled button', () => {
        const { getByText } = (0, react_2.render)(react_1.default.createElement(icon_button_compositions_1.IconButtonDisabled, { "data-testId": "target" }));
        const result = getByText('Terminate');
        expect(result).toHaveProperty('disabled');
    });
});
//# sourceMappingURL=icon-button.spec.js.map