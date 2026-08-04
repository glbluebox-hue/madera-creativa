"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// the '.' can be in the middle, not at the beginning and not at the end and only once.
const validationRegExp = /^[$\-_!a-z0-9]+[.]?[$\-_!a-z0-9]+$/;
function isValidScopeName(val) {
    if (typeof val !== 'string')
        return false;
    return validationRegExp.test(val);
}
exports.default = isValidScopeName;
//# sourceMappingURL=is-valid-scope-name.js.map