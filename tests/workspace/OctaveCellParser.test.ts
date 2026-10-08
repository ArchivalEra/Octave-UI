import { describe, it, expect } from 'vitest';
import { OctaveCellParser } from '../../src/modules/workspace/OctaveCellParser';

describe('OctaveCellParser', () => {
  it('parses empty string into a single default cell', () => {
    const cells = OctaveCellParser.parse('');
    expect(cells.length).toBe(1);
    expect(cells[0].title).toBe('Section 1');
    expect(cells[0].code).toBe('');
    expect(cells[0].description).toBe('');
  });

  it('parses script without %% delimiter as a single section', () => {
    const script = `x = 1:10;\ny = sin(x);\nplot(x, y);`;
    const cells = OctaveCellParser.parse(script);
    expect(cells.length).toBe(1);
    expect(cells[0].title).toBe('Section 1');
    expect(cells[0].code).toBe(script);
    expect(cells[0].description).toBe('');
  });

  it('parses standard %% sections with title, description, and code', () => {
    const script = `%% Parameter Setup
% This cell initializes variables
% for the simulation.
Fs = 1000;
t = 0:1/Fs:1;

%% Signal Generation
% Generate 50Hz sine wave
x = sin(2 * pi * 50 * t);
% Inline comments inside code
y = x + 0.1 * randn(size(t));
`;

    const cells = OctaveCellParser.parse(script);
    expect(cells.length).toBe(2);

    expect(cells[0].title).toBe('Parameter Setup');
    expect(cells[0].description).toBe('This cell initializes variables\nfor the simulation.');
    expect(cells[0].code).toBe('Fs = 1000;\nt = 0:1/Fs:1;');

    expect(cells[1].title).toBe('Signal Generation');
    expect(cells[1].description).toBe('Generate 50Hz sine wave');
    expect(cells[1].code).toBe('x = sin(2 * pi * 50 * t);\n% Inline comments inside code\ny = x + 0.1 * randn(size(t));');
  });

  it('serializes cells to standard Octave .m format', () => {
    const cells = [
      {
        id: 'c1',
        title: 'Step 1',
        description: 'First description',
        code: 'a = 1;\nb = 2;',
      },
      {
        id: 'c2',
        title: 'Step 2',
        description: '',
        code: 'c = a + b;',
      },
    ];

    const serialized = OctaveCellParser.serialize(cells);
    expect(serialized).toContain('%% Step 1\n% First description\na = 1;\nb = 2;');
    expect(serialized).toContain('%% Step 2\nc = a + b;');

    // Round-trip parse
    const reparsed = OctaveCellParser.parse(serialized);
    expect(reparsed.length).toBe(2);
    expect(reparsed[0].title).toBe('Step 1');
    expect(reparsed[0].description).toBe('First description');
    expect(reparsed[0].code).toBe('a = 1;\nb = 2;');
    expect(reparsed[1].title).toBe('Step 2');
    expect(reparsed[1].description).toBe('');
    expect(reparsed[1].code).toBe('c = a + b;');
  });
});
