#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function loadJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function findFiles(dir, pattern) {
  const files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        files.push(...await findFiles(join(dir, entry.name), pattern));
      } else if (entry.isFile() && entry.name.match(pattern)) {
        files.push(join(dir, entry.name));
      }
    }
  } catch (error) {
    // Directory doesn't exist, skip
  }
  return files;
}

async function resolveReference(refObj, basePath) {
  if (!refObj['...']) return refObj;
  
  const ref = refObj['...'];
  const [pathPart, jsonPointer] = ref.split('#/');
  
  // Handle glob patterns
  if (pathPart.includes('*')) {
    const pathSegments = pathPart.split('/');
    let searchDir = basePath;
    let pattern = /^_.*\.json$/;
    
    // Navigate to the right directory
    for (const segment of pathSegments) {
      if (segment === '..') {
        searchDir = dirname(searchDir);
      } else if (segment === '.' || segment === '') {
        continue;
      } else if (segment.includes('*')) {
        // This is the pattern segment
        if (segment === '*') {
          // Search all subdirectories
        } else if (segment === '_*.json') {
          pattern = /^_.*\.json$/;
        }
      } else {
        searchDir = join(searchDir, segment);
      }
    }
    
    const files = await findFiles(searchDir, pattern);
    const results = [];
    
    for (const file of files) {
      try {
        const json = await loadJson(file);
        const part = jsonPointer || 'definitions';
        if (json[part]) {
          if (Array.isArray(json[part])) {
            results.push(...json[part]);
          } else {
            results.push(json[part]);
          }
        }
      } catch (error) {
        console.error(`Error loading ${file}:`, error.message);
      }
    }
    return results;
  }
  
  // Handle single file reference
  const fullPath = resolve(basePath, pathPart);
  try {
    const json = await loadJson(fullPath);
    const part = jsonPointer || 'definitions';
    return json[part];
  } catch (error) {
    console.error(`Error loading ${fullPath}:`, error.message);
    return null;
  }
}

async function expandReferences(obj, basePath) {
  if (Array.isArray(obj)) {
    const expanded = [];
    for (const item of obj) {
      if (item && typeof item === 'object' && item['...']) {
        const resolved = await resolveReference(item, basePath);
        if (Array.isArray(resolved)) {
          expanded.push(...resolved);
        } else if (resolved) {
          expanded.push(resolved);
        }
      } else if (item && typeof item === 'object') {
        expanded.push(await expandReferences(item, basePath));
      } else {
        expanded.push(item);
      }
    }
    return expanded;
  }
  
  if (obj && typeof obj === 'object') {
    const expanded = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && value['...']) {
        expanded[key] = await resolveReference(value, basePath);
      } else if (value && typeof value === 'object') {
        expanded[key] = await expandReferences(value, basePath);
      } else {
        expanded[key] = value;
      }
    }
    return expanded;
  }
  
  return obj;
}

async function buildDefinitions() {
  const definitionFile = join(projectRoot, 'models', '_component-definition.json');
  const json = await loadJson(definitionFile);
  const basePath = dirname(definitionFile);
  
  const expanded = await expandReferences(json, basePath);
  return expanded;
}

async function buildFilters() {
  const filterFile = join(projectRoot, 'models', '_component-filters.json');
  const json = await loadJson(filterFile);
  const basePath = dirname(filterFile);
  
  const expanded = await expandReferences(json, basePath);
  return expanded;
}

async function buildModels() {
  const modelFile = join(projectRoot, 'models', '_component-models.json');
  const json = await loadJson(modelFile);
  const basePath = dirname(modelFile);
  
  const expanded = await expandReferences(json, basePath);
  return expanded;
}

async function build() {
  try {
    console.log('Building component models...');
    const models = await buildModels();
    await writeFile(
      join(projectRoot, 'component-models.json'),
      JSON.stringify(models, null, 2)
    );
    console.log(`✓ component-models.json (${models.length} models)`);
    
    console.log('Building component definitions...');
    const definitions = await buildDefinitions();
    await writeFile(
      join(projectRoot, 'component-definition.json'),
      JSON.stringify(definitions, null, 2)
    );
    console.log(`✓ component-definition.json (${definitions.groups.length} groups)`);
    
    console.log('Building component filters...');
    const filters = await buildFilters();
    await writeFile(
      join(projectRoot, 'component-filters.json'),
      JSON.stringify(filters, null, 2)
    );
    console.log(`✓ component-filters.json (${filters.length} filters)`);
    
    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
