"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasComponentMeta = exports.componentMetaProperties = exports.componentMetaField = void 0;
exports.componentMetaField = '__bit_component';
exports.componentMetaProperties = {
    componentId: 'id',
    homepageUrl: 'homepage',
    isExported: 'exported',
};
function hasComponentMeta(component) {
    return component && typeof component.__bit_component === 'object' && typeof component.__bit_component.id === 'string';
}
exports.hasComponentMeta = hasComponentMeta;
//# sourceMappingURL=component-meta.js.map