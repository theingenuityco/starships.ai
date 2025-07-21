"use strict";
/// <reference types="jest" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetMockId = exports.v4 = void 0;
let mockId = 1;
exports.v4 = jest.fn(() => {
    return `test-uuid-${mockId++}`;
});
const resetMockId = () => {
    mockId = 1;
};
exports.resetMockId = resetMockId;
//# sourceMappingURL=uuid.js.map