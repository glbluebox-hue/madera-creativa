"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validationRegExp = /^[-_a-z0-9/]+$/;
const validationRegExpDisallowSlash = /^[-_a-z0-9]+$/;
function isValidIdChunk(val, allowSlash = true) {
    if (typeof val !== 'string')
        return false;
    if (val.includes('//'))
        return false;
    const regex = allowSlash ? validationRegExp : validationRegExpDisallowSlash;
    return regex.test(val);
}
exports.default = isValidIdChunk;
//# sourceMappingURL=is-valid-id-chunk.js.map