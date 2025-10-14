import type { DescMethod } from '@bufbuild/protobuf';

// Minimal method descriptors with embedded service reference (typeName required by Connect)
const serviceRef = { typeName: 'runner.Runner' } as const;

export const RunnerService = {
  methods: {
    Execute: { name: 'Execute', service: serviceRef } as unknown as DescMethod,
    ExecuteStream: { name: 'ExecuteStream', service: serviceRef } as unknown as DescMethod,
  },
};
