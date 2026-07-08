import { describe, it, expect } from 'vitest';
import { createSourceFile } from '../../src/source/source-file';
import { parseFiles } from '../../src/parser/parser';

function parse(text: string) {
  const source = createSourceFile('/tmp/test.lsp', text);
  return parseFiles([source]);
}

describe('syntax errors', () => {
  it('reports unclosed Inicio/Fim block', () => {
    const { parseErrors } = parseFiles([
      createSourceFile('/tmp/test.lsp', 'Inicio\n  Definir Numero n;\n')
    ]);
    const hasBlockError = parseErrors.some((e) => e.message.toLowerCase().includes('bloco'));
    expect(hasBlockError).toBe(true);
  });

  it('reports unclosed brace block', () => {
    const { parseErrors } = parse('{ Definir Numero n;\n');
    const hasBlockError = parseErrors.some((e) => e.message.toLowerCase().includes('bloco'));
    expect(hasBlockError).toBe(true);
  });

  it('reports unclosed parenthesis', () => {
    const { parseErrors } = parse('Se (a = 1\n');
    const hasParenError = parseErrors.some((e) => e.message.toLowerCase().includes('parêntese'));
    expect(hasParenError).toBe(true);
  });

  it('reports unclosed bracket', () => {
    const { parseErrors } = parse('a = lista[1\n');
    const hasBracketError = parseErrors.some((e) => e.message.toLowerCase().includes('colchete'));
    expect(hasBracketError).toBe(true);
  });

  it("reports SYN_MISSING_EQUALS for an identifier without '='", () => {
    const { parseErrors } = parse('nValor;\n');
    const missingEquals = parseErrors.find((e) => e.code === 'SYN_MISSING_EQUALS');

    expect(missingEquals).toBeTruthy();
    expect(missingEquals?.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 6 }
    });
  });
});
