import readline from 'node:readline';

export async function promptYesNo(args: { question: string; defaultYes?: boolean }): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = args.defaultYes === true ? ' [Y/n] ' : args.defaultYes === false ? ' [y/N] ' : ' [y/n] ';
    const answer = await new Promise<string>((resolve) => rl.question(args.question + suffix, resolve));
    const raw = answer.trim().toLowerCase();
    if (!raw) {
      if (args.defaultYes === true) return true;
      if (args.defaultYes === false) return false;
      return false;
    }
    if (raw === 'y' || raw === 'yes') return true;
    if (raw === 'n' || raw === 'no') return false;
    return false;
  } finally {
    rl.close();
  }
}

