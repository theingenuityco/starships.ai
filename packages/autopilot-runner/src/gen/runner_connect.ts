import type { DescMethod } from '@bufbuild/protobuf';

export const RunnerService = {
  methods: {
    Execute: { name: 'runner.Runner.Execute' } as unknown as DescMethod,
    ExecuteStream: { name: 'runner.Runner.ExecuteStream' } as unknown as DescMethod,
  },
};
