// A minimal, lenient parser for partially streamed JSON objects.
// It attempts JSON.parse first. If that fails, it tries to "repair"
// common incomplete patterns by closing quotes/braces and removing a trailing backslash.
// If parsing still fails, it returns an empty object.

export function parsePartialJSONObject(input: string): unknown {
  if (!input || typeof input !== 'string') return {};

  const trimmed = input.trim();
  if (trimmed.length === 0) return {};

  // Fast path
  try {
    return JSON.parse(trimmed);
  } catch (_e) {
    void _e; /* ignore parse error, attempt repair */
  }

  // Tokenize
  type Token =
    | { type: 'brace'; value: '{' | '}' }
    | { type: 'paren'; value: '[' | ']' }
    | { type: 'separator'; value: ':' }
    | { type: 'delimiter'; value: ',' }
    | { type: 'string'; value: string }
    | { type: 'number'; value: string }
    | { type: 'name'; value: 'true' | 'false' | 'null' };

  const tokenize = (inputStr: string): Token[] => {
    let current = 0;
    const tokens: Token[] = [];

    while (current < inputStr.length) {
      let char = inputStr[current];

      if (char === '\\') {
        current++;
        continue;
      }

      if (char === '{' || char === '}') {
        tokens.push({ type: 'brace', value: char as '{' | '}' });
        current++;
        continue;
      }

      if (char === '[' || char === ']') {
        tokens.push({ type: 'paren', value: char as '[' | ']' });
        current++;
        continue;
      }

      if (char === ':') {
        tokens.push({ type: 'separator', value: ':' });
        current++;
        continue;
      }

      if (char === ',') {
        tokens.push({ type: 'delimiter', value: ',' });
        current++;
        continue;
      }

      if (char === '"') {
        let value = '';
        let danglingQuote = false;
        char = inputStr[++current];
        while (char !== '"') {
          if (current === inputStr.length) {
            danglingQuote = true;
            break;
          }
          if (char === '\\') {
            current++;
            if (current === inputStr.length) {
              danglingQuote = true;
              break;
            }
            value += char + inputStr[current];
            char = inputStr[++current];
          } else {
            value += char;
            char = inputStr[++current];
          }
        }
        char = inputStr[++current];
        if (!danglingQuote) {
          tokens.push({ type: 'string', value });
        }
        continue;
      }

      const WHITESPACE = /\s/;
      if (WHITESPACE.test(char)) {
        current++;
        continue;
      }

      const NUMBERS = /[0-9]/;
      if (NUMBERS.test(char) || char === '-' || char === '.') {
        let value = '';
        if (char === '-') {
          value += char;
          char = inputStr[++current];
        }
        while (NUMBERS.test(char) || char === '.') {
          value += char;
          char = inputStr[++current];
        }
        tokens.push({ type: 'number', value });
        continue;
      }

      const LETTERS = /[a-z]/i;
      if (LETTERS.test(char)) {
        let value = '';
        while (LETTERS.test(char)) {
          if (current === inputStr.length) break;
          value += char;
          char = inputStr[++current];
        }
        if (value === 'true' || value === 'false' || value === 'null') {
          tokens.push({ type: 'name', value: value as 'true' | 'false' | 'null' });
        } else {
          // Invalid token; stop consuming further to avoid throwing during streaming
          break;
        }
        continue;
      }

      // Skip unknown characters gracefully
      current++;
    }

    return tokens;
  };

  const strip = (tokens: Token[]): Token[] => {
    if (tokens.length === 0) return tokens;
    const lastToken = tokens[tokens.length - 1];
    switch (lastToken.type) {
      case 'separator': {
        const t = tokens.slice(0, tokens.length - 1);
        return strip(t);
      }
      case 'number': {
        const lastChar = lastToken.value[lastToken.value.length - 1];
        if (lastChar === '.' || lastChar === '-') {
          const t = tokens.slice(0, tokens.length - 1);
          return strip(t);
        }
        break;
      }
      case 'string': {
        const before = tokens[tokens.length - 2];
        if (before && (before.type === 'delimiter' || (before.type === 'brace' && before.value === '{'))) {
          const t = tokens.slice(0, tokens.length - 1);
          return strip(t);
        }
        break;
      }
      case 'delimiter': {
        const t = tokens.slice(0, tokens.length - 1);
        return strip(t);
      }
    }
    return tokens;
  };

  const unstrip = (tokens: Token[]): Token[] => {
    const tail: Array<'}' | ']'> = [];
    tokens.forEach((token) => {
      if (token.type === 'brace') {
        if (token.value === '{') tail.push('}');
        else {
          const idx = tail.lastIndexOf('}');
          if (idx !== -1) tail.splice(idx, 1);
        }
      }
      if (token.type === 'paren') {
        if (token.value === '[') tail.push(']');
        else {
          const idx = tail.lastIndexOf(']');
          if (idx !== -1) tail.splice(idx, 1);
        }
      }
    });

    if (tail.length > 0) {
      tail.reverse().forEach((item) => {
        if (item === '}') tokens.push({ type: 'brace', value: '}' });
        else if (item === ']') tokens.push({ type: 'paren', value: ']' });
      });
    }
    return tokens;
  };

  const generate = (tokens: Token[]): string => {
    let output = '';
    tokens.forEach((token) => {
      switch (token.type) {
        case 'string':
          output += '"' + token.value + '"';
          break;
        default:
          output += token.value;
          break;
      }
    });
    return output;
  };

  try {
    const toks = tokenize(trimmed);
    const repaired = generate(unstrip(strip(toks)));
    return JSON.parse(repaired);
  } catch (_e) {
    void _e;
    return {};
  }
}
