/// <reference types="jest" />

let mockId = 1;

export const v4 = jest.fn(() => {
  return `test-uuid-${mockId++}`;
});

export const resetMockId = () => {
  mockId = 1;
};