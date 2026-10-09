// src/modules/plugins/index.ts
// Octave-UI 插件生态总入口

import { PluginRegistry } from './PluginRegistry';
import { PretextLayoutPlugin } from './pretext/PretextLayoutPlugin';
import { GallerySearchPlugin } from './search/GallerySearchPlugin';

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

export const pluginRegistry = new PluginRegistry();
export const pretextPlugin = new PretextLayoutPlugin();
export const searchPlugin = new GallerySearchPlugin();

// 自动注册核心开箱即用插件
pluginRegistry.register(pretextPlugin);
pluginRegistry.register(searchPlugin);
