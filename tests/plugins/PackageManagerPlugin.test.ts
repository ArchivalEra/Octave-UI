// tests/plugins/PackageManagerPlugin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';
import { MockAssetsAdapter } from '../../src/modules/plugins/package/MockAssetsAdapter';
import type { ForgeCatalog } from '../../src/modules/plugins/package/types';

describe('PackageManagerPlugin Deep Module', () => {
  let mockAdapter: MockAssetsAdapter;
  let plugin: PackageManagerPlugin;

  const sampleCatalog: ForgeCatalog = {
    schema: 2,
    octave: '11.3.0',
    packs: [
      {
        name: 'cgi',
        version: '0.1.2',
        size: 9960,
        form: 'pkg',
        content: ['m'],
        consumer: 'octave',
        deps: [],
        description: 'Common Gateway Interface for Octave',
        versions: [
          {
            version: '0.1.2',
            stage: 'staged',
            form: 'pkg',
            content: ['m'],
            size: 9960,
          },
          {
            version: '0.1.0',
            stage: 'withheld',
            withheld_cause: 'bytes-not-staged',
            form: 'pkg',
            content: ['m'],
          },
        ],
      },
      {
        name: 'symbolic',
        version: '3.2.2',
        size: 276452,
        form: 'pkg',
        content: ['m'],
        consumer: 'octave',
        deps: ['pyodide'],
        description: 'Symbolic computations via Pyodide/SymPy',
        versions: [
          {
            version: '3.2.2',
            stage: 'staged',
            form: 'pkg',
            content: ['m'],
            size: 276452,
          },
        ],
      },
      {
        name: 'pyodide',
        version: '0.26.2',
        size: 22013349,
        form: 'tree',
        content: [], // 能力层：content 为空数组，非未知
        consumer: 'octave',
        deps: [],
        description: 'WebAssembly Python Runtime capability layer',
      },
      {
        name: 'signal',
        version: '1.4.5',
        size: 345000,
        form: 'pkg',
        content: ['m', 'src'],
        consumer: 'octave',
        deps: ['control'],
        description: 'Signal processing package',
      },
      {
        name: 'control',
        version: '4.0.1',
        size: 210000,
        form: 'pkg',
        content: ['m'],
        consumer: 'octave',
        deps: [],
        description: 'Control systems package',
      },
      {
        name: 'omc-simulator',
        version: '1.2.0',
        size: 512000,
        form: 'pkg',
        content: ['m'],
        consumer: 'omc',
        deps: [],
        description: 'OpenModelica compiler runner for Octave',
      },
    ],
  };

  beforeEach(() => {
    mockAdapter = new MockAssetsAdapter(sampleCatalog);
    plugin = new PackageManagerPlugin(mockAdapter);
  });

  it('initializes with correct plugin metadata and state', () => {
    expect(plugin.id).toBe('package-manager');
    expect(plugin.enabled).toBe(true);
    expect(plugin.getCatalog()).toBeNull();
    expect(plugin.isLoading()).toBe(false);
  });

  it('loads catalog and indexes packages by name', async () => {
    const cat = await plugin.loadCatalog();
    expect(cat.packs.length).toBe(6);
    expect(plugin.getCatalog()).toEqual(sampleCatalog);

    const symbolic = plugin.getPackage('symbolic');
    expect(symbolic).toBeDefined();
    expect(symbolic?.name).toBe('symbolic');
    expect(symbolic?.deps).toEqual(['pyodide']);

    const pyodide = plugin.getPackage('pyodide');
    expect(pyodide?.form).toBe('tree');
    expect(pyodide?.content).toEqual([]);
  });

  it('retrieves version candidates with staged and withheld states', async () => {
    await plugin.loadCatalog();
    const cgiVersions = plugin.getVersions('cgi');
    expect(cgiVersions.length).toBe(2);

    const vLatest = cgiVersions.find((v) => v.version === '0.1.2');
    expect(vLatest?.stage).toBe('staged');

    const vOld = cgiVersions.find((v) => v.version === '0.1.0');
    expect(vOld?.stage).toBe('withheld');
    expect(vOld?.withheld_cause).toBe('bytes-not-staged');
  });

  it('computes dependency closure accurately without infinite loops', async () => {
    await plugin.loadCatalog();
    const closure = plugin.computeDependencyClosure('symbolic');
    expect(closure.has('symbolic')).toBe(true);
    expect(closure.has('pyodide')).toBe(true);

    const signalClosure = plugin.computeDependencyClosure('signal');
    expect(signalClosure.has('signal')).toBe(true);
    expect(signalClosure.has('control')).toBe(true);
  });

  it('calculates extra download estimate by summing form:tree items in closure', async () => {
    await plugin.loadCatalog();
    // symbolic depends on pyodide (form: tree, size: 22013349)
    const extraForSymbolic = plugin.estimateExtraDownload('symbolic');
    expect(extraForSymbolic).toBe(22013349);

    // signal depends on control (form: pkg, not tree) => extra tree bytes is 0
    const extraForSignal = plugin.estimateExtraDownload('signal');
    expect(extraForSignal).toBe(0);

    // cgi has no deps => extra is 0
    const extraForCgi = plugin.estimateExtraDownload('cgi');
    expect(extraForCgi).toBe(0);
  });

  it('delegates status checks to port without inventing UI secondary truth', async () => {
    await plugin.loadCatalog();

    // Mock initial status
    mockAdapter.setStatus('cgi', {
      compatible: true,
      fromSource: false,
      installed: false,
    });
    mockAdapter.setStatus('signal', {
      compatible: true,
      fromSource: true,
      installed: true,
    });

    const cgiStatus = plugin.getStatus('cgi');
    expect(cgiStatus.compatible).toBe(true);
    expect(cgiStatus.fromSource).toBe(false);
    expect(cgiStatus.installed).toBe(false);

    const signalStatus = plugin.getStatus('signal');
    expect(signalStatus.installed).toBe(true);
    expect(signalStatus.fromSource).toBe(true);
  });

  it('handles planOnly resolution through engine port', async () => {
    await plugin.loadCatalog();
    mockAdapter.setInstallPlan('symbolic', {
      bytes: 22289801,
      layers: ['pyodide'],
    });

    const plan = await plugin.planInstall('symbolic');
    expect(plan.name).toBe('symbolic');
    expect(plan.bytes).toBe(22289801);
    expect(plan.layers).toEqual(['pyodide']);
    expect(plan.extraSize).toBe(22013349);
  });

  it('tracks installation progress and updates installed state', async () => {
    await plugin.loadCatalog();
    expect(plugin.isInstalling('cgi')).toBe(false);

    let notifyCount = 0;
    const unsub = plugin.subscribe(() => {
      notifyCount++;
    });

    const installPromise = plugin.installPackage('cgi');
    expect(plugin.isInstalling('cgi')).toBe(true);

    const result = await installPromise;
    expect(result.state).toBe('ok');
    expect(plugin.isInstalling('cgi')).toBe(false);
    expect(plugin.getStatus('cgi').installed).toBe(true);
    expect(notifyCount).toBeGreaterThanOrEqual(2);

    unsub();
  });

  it('correctly maps four-state install verdicts (ok, failed, not-found, cannot-know)', async () => {
    await plugin.loadCatalog();

    mockAdapter.setInstallResult('not_exist', {
      state: 'not-found',
      cause: 'package-not-in-catalog',
      message: 'Package not found',
    });

    const notFoundRes = await plugin.installPackage('not_exist');
    expect(notFoundRes.state).toBe('not-found');
    expect(notFoundRes.cause).toBe('package-not-in-catalog');

    mockAdapter.setInstallResult('broken', {
      state: 'failed',
      cause: 'download-checksum-mismatch',
      message: 'Checksum error',
    });

    const failedRes = await plugin.installPackage('broken');
    expect(failedRes.state).toBe('failed');
    expect(failedRes.cause).toBe('download-checksum-mismatch');
  });

  it('filters packages by consumer engine, form, installed state, and search query', async () => {
    await plugin.loadCatalog();
    mockAdapter.setStatus('cgi', { installed: true });

    // 1. Consumer filter
    const octaveOnly = plugin.filterPackages({ consumer: 'octave' });
    expect(octaveOnly.map((p) => p.name)).toEqual(['cgi', 'symbolic', 'pyodide', 'signal', 'control']);

    const omcOnly = plugin.filterPackages({ consumer: 'omc' });
    expect(omcOnly.map((p) => p.name)).toEqual(['omc-simulator']);

    // 2. Form filter
    const treeOnly = plugin.filterPackages({ form: 'tree' });
    expect(treeOnly.map((p) => p.name)).toEqual(['pyodide']);

    const pkgOnly = plugin.filterPackages({ form: 'pkg' });
    expect(pkgOnly.map((p) => p.name)).toEqual(['cgi', 'symbolic', 'signal', 'control', 'omc-simulator']);

    // 3. Installed only
    const installed = plugin.filterPackages({ installedOnly: true });
    expect(installed.map((p) => p.name)).toEqual(['cgi']);

    // 4. Query string
    const searchSym = plugin.filterPackages({ query: 'sympy' });
    expect(searchSym.map((p) => p.name)).toEqual(['symbolic']);

    const searchDep = plugin.filterPackages({ query: 'pyodide' });
    // matches pyodide itself and symbolic (which has pyodide in deps)
    expect(searchDep.map((p) => p.name)).toContain('symbolic');
    expect(searchDep.map((p) => p.name)).toContain('pyodide');
  });
});
