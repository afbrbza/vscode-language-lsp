import { describe, it, expect } from 'vitest';
import { getContextSymbols, getProgramSymbols } from '../../src';
import { parseFiles } from '../../src/parser/parser';
import { createSourceFile } from '../../src/source/source-file';

describe('symbol index', () => {
  it('extracts cursor fields from Cursor.SQL SELECT', async () => {
    const symbols = await getContextSymbols({
      name: 'cursor',
      rootDir: 'test/fixtures',
      filePattern: 'cursor-select.lsp',
      includeSubdirectories: false,
      system: 'HCM'
    });

    const cursor = symbols.find((s) => s.kind === 'variable' && s.nameNormalized === 'cur');
    expect(cursor).toBeTruthy();
    expect(cursor?.cursorFields).toEqual(expect.arrayContaining(['campo1', 'Alias']));
  });

  it('extracts table schema metadata from structured declaration', async () => {
    const symbols = await getContextSymbols({
      name: 'table',
      rootDir: 'test/fixtures',
      filePattern: 'table-decl.lsp',
      includeSubdirectories: false,
      system: 'HCM'
    });

    const table = symbols.find((s) => s.kind === 'variable' && s.nameNormalized === 've_codhor');
    expect(table).toBeTruthy();
    expect(table?.tableOccurrences).toBe(100);
    expect(table?.tableColumns).toEqual(
      expect.arrayContaining([
        { name: 'Nome', typeName: 'Alfa', size: 30 },
        { name: 'Codigo', typeName: 'Numero', size: undefined }
      ])
    );
  });

  it('extracts table schema metadata from declaration inside function body', async () => {
    const symbols = await getContextSymbols({
      name: 'table-local',
      rootDir: 'test/fixtures',
      filePattern: 'table-decl-local.lsp',
      includeSubdirectories: false,
      system: 'HCM'
    });

    const table = symbols.find((s) => s.kind === 'variable' && s.nameNormalized === 've_codhor');
    expect(table).toBeTruthy();
    expect(table?.typeName).toBe('Tabela');
    expect(table?.tableOccurrences).toBe(100);
    expect(table?.tableColumns?.length).toBe(2);
  });
  it('deduplicates variables by lexical scope', () => {
    const source = createSourceFile('/tmp/scoped-symbols.lsp', [
      'Funcao Primeira()',
      'Inicio',
      '  Definir Numero nLocal;',
      '  Definir Numero nLocal;',
      'Fim;',
      'Funcao Segunda()',
      'Inicio',
      '  Definir Numero nLocal;',
      'Fim;'
    ].join('\n'));
    const { program } = parseFiles([source]);

    const locals = getProgramSymbols(program)
      .filter((symbol) => symbol.kind === 'variable' && symbol.nameNormalized === 'nlocal');

    expect(locals).toHaveLength(2);
    expect(new Set(locals.map((symbol) => symbol.scopeId)).size).toBe(2);
  });
});
