import { describe, expect, it } from 'vitest';
import { SymbolKind } from 'vscode-languageserver/node';
import type { SymbolInfo } from '@lsp/compiler';

import { buildDocumentSymbolTree } from '../../../src/server/register-language-handlers';

const sourcePath = '/tmp/test.lspt';

function range(startLine: number, endLine = startLine) {
  return {
    start: { line: startLine, character: 0 },
    end: { line: endLine, character: 10 }
  };
}

function symbol(overrides: Partial<SymbolInfo> & Pick<SymbolInfo, 'kind' | 'name'>): SymbolInfo {
  return {
    nameNormalized: overrides.name.toLowerCase(),
    typeName: 'Desconhecido',
    sourcePath,
    ...overrides
  };
}

describe('document symbols', () => {
  it('builds a function tree with parameters and local variables', () => {
    const functionRange = range(2, 8);
    const parameterRange = range(2);
    const localRange = range(4);
    const globalRange = range(0);
    const symbols: SymbolInfo[] = [
      symbol({
        kind: 'function',
        name: 'Calcular',
        typeName: 'Numero',
        implemented: true,
        range: functionRange,
        params: [{ name: 'nValor', typeName: 'Numero', range: parameterRange }] as NonNullable<SymbolInfo['params']>
      }),
      symbol({ kind: 'variable', name: 'nLocal', typeName: 'Numero', range: localRange }),
      symbol({ kind: 'variable', name: 'nGlobal', typeName: 'Numero', range: globalRange })
    ];

    expect(buildDocumentSymbolTree(symbols, sourcePath)).toEqual([
      {
        name: 'Calcular',
        kind: SymbolKind.Function,
        range: functionRange,
        selectionRange: functionRange,
        detail: 'Numero',
        children: [
          {
            name: 'nValor',
            kind: SymbolKind.Variable,
            range: parameterRange,
            selectionRange: parameterRange,
            detail: 'Numero'
          },
          {
            name: 'nLocal',
            kind: SymbolKind.Variable,
            range: localRange,
            selectionRange: localRange,
            detail: 'Numero'
          }
        ]
      },
      {
        name: 'nGlobal',
        kind: SymbolKind.Variable,
        range: globalRange,
        selectionRange: globalRange,
        detail: 'Numero'
      }
    ]);
  });

  it('represents declarations as top-level variables and filters unrelated symbols', () => {
    const declarationRange = range(1);
    const symbols: SymbolInfo[] = [
      symbol({ kind: 'function', name: 'Declarada', declared: true, range: declarationRange }),
      symbol({ kind: 'variable', name: 'SemIntervalo' }),
      symbol({ kind: 'variable', name: 'OutroArquivo', range: range(3), sourcePath: '/tmp/other.lspt' })
    ];

    expect(buildDocumentSymbolTree(symbols, sourcePath)).toEqual([
      {
        name: 'Declarada',
        kind: SymbolKind.Variable,
        range: declarationRange,
        selectionRange: declarationRange,
        detail: 'Funcao'
      }
    ]);
  });
});
