// src/modules/plugins/index.ts
// Octave-UI 插件生态总入口

import { PluginRegistry } from './PluginRegistry';
import { PretextLayoutPlugin } from './pretext/PretextLayoutPlugin';
import { GallerySearchPlugin } from './search/GallerySearchPlugin';
import { P5FigureOverlayPlugin } from './figure/P5FigureOverlayPlugin';
import { PackageManagerPlugin } from './package/PackageManagerPlugin';

import { WebMcpPlugin } from './webmcp/WebMcpPlugin';

export * from './types';
export { PluginRegistry } from './PluginRegistry';
export {
  PretextLayoutPlugin,
  distributeCards,
  columnCount,
  predictedHeight,
  formatCodeLines,
  type TypesetCodeLine,
  type CardLayoutMetrics,
} from './pretext/PretextLayoutPlugin';
export {
  GallerySearchPlugin,
  type SearchHit,
  foldSearchText,
  queryGrams,
  escapeHtml,
  highlightMatches,
} from './search/GallerySearchPlugin';
export {
  P5FigureOverlayPlugin,
  type P5FigureRenderEvent,
  type FigureRenderListener,
} from './figure/P5FigureOverlayPlugin';
export {
  PackageManagerPlugin,
} from './package/PackageManagerPlugin';
export * from './package/types';
export * from './package/AssetsPort';
export { WebMcpPlugin } from './webmcp/WebMcpPlugin';
export * from './webmcp/types';

export const pluginRegistry = new PluginRegistry();
export const pretextPlugin = new PretextLayoutPlugin();
export const searchPlugin = new GallerySearchPlugin();
export const p5FigureOverlayPlugin = new P5FigureOverlayPlugin();
export const packageManagerPlugin = new PackageManagerPlugin();
export const webMcpPlugin = new WebMcpPlugin();

// 自动注册核心开箱即用插件
pluginRegistry.register(pretextPlugin);
pluginRegistry.register(searchPlugin);
pluginRegistry.register(p5FigureOverlayPlugin);
pluginRegistry.register(packageManagerPlugin);
pluginRegistry.register(webMcpPlugin);

p5FigureOverlayPlugin.init();
webMcpPlugin.init();



