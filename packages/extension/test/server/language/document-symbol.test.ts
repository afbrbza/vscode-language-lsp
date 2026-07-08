import { describe, expect, it } from 'vitest';
import { SymbolKind } from 'vscode-languageserver/node';
import { compileSingleFile, type SymbolInfo } from '@lsp/compiler';

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
        detail: 'Implementação',
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
        kind: SymbolKind.Function,
        range: declarationRange,
        selectionRange: declarationRange,
        detail: 'Declaração',
        children: []
      }
    ]);
  });

  it('uses identifier ranges for symbol selection', () => {
    const functionRange = range(1, 5);
    const functionNameRange = {
      start: { line: 1, character: 7 },
      end: { line: 1, character: 15 }
    };
    const variableRange = range(3);
    const variableNameRange = {
      start: { line: 3, character: 17 },
      end: { line: 3, character: 23 }
    };

    const result = buildDocumentSymbolTree([
      symbol({
        kind: 'function',
        name: 'Calcular',
        implemented: true,
        range: functionRange,
        nameRange: functionNameRange
      }),
      symbol({
        kind: 'variable',
        name: 'nLocal',
        range: variableRange,
        nameRange: variableNameRange,
        scopeId: 'function:calcular'
      })
    ], sourcePath);

    expect(result[0]?.selectionRange).toEqual(functionNameRange);
    expect(result[0]?.children?.[0]?.selectionRange).toEqual(variableNameRange);
  });

  it('keeps same-named variables from different function scopes', async () => {
    const result = await compileSingleFile({
      filePath: sourcePath,
      system: 'HCM',
      text: [
        'Funcao Primeira()',
        'Inicio',
        '  Definir Numero nLocal;',
        'Fim;',
        'Funcao Segunda()',
        'Inicio',
        '  Definir Numero nLocal;',
        'Fim;'
      ].join('\n'),
      includeSemantics: false
    });

    const tree = buildDocumentSymbolTree(result.symbols ?? [], sourcePath);
    const functions = tree.filter((item) => item.kind === SymbolKind.Function);

    expect(functions).toHaveLength(2);
    expect(functions.map((item) => item.children?.map((child) => child.name))).toEqual([
      ['nLocal'],
      ['nLocal']
    ]);
  });

  it('shows declaration and implementation as separate function symbols', () => {
    const declarationRange = range(0);
    const implementationRange = range(2, 5);
    const symbols: SymbolInfo[] = [
      symbol({ kind: 'function', name: 'Calcular', declared: true, range: declarationRange }),
      symbol({ kind: 'function', name: 'Calcular', implemented: true, range: implementationRange })
    ];

    const result = buildDocumentSymbolTree(symbols, sourcePath);

    expect(result).toEqual([
      expect.objectContaining({
        name: 'Calcular',
        kind: SymbolKind.Function,
        range: implementationRange,
        detail: 'Implementação'
      }),
      expect.objectContaining({
        name: 'Calcular',
        kind: SymbolKind.Function,
        range: declarationRange,
        detail: 'Declaração'
      })
    ]);
  });
});
