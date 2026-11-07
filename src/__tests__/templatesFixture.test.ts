/**
 * python/tests/fixtures/templates.json mirrors the model templates so the
 * engine tests (model-script round trip) can use them without a TS parser.
 * Regenerate with:  UPDATE_FIXTURES=1 npx vitest run templatesFixture
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { templates } from '../components/factory-builder/TemplateSelector';

const FIXTURE = path.resolve(__dirname, '../../python/tests/fixtures/templates.json');

describe('template fixture for the engine tests', () => {
  it('matches the templates in the app', () => {
    const current = JSON.stringify(
      templates.map(t => ({ id: t.id, name: t.name, template: t.template })),
      null,
      1,
    ) + '\n';
    if (process.env.UPDATE_FIXTURES || !fs.existsSync(FIXTURE)) {
      fs.writeFileSync(FIXTURE, current);
    }
    expect(fs.readFileSync(FIXTURE, 'utf-8')).toBe(current);
  });
});
