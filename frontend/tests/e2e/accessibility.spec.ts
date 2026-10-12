import axe from 'axe-core';
import { expect, test, type Page } from '@playwright/test';

type AxeViolation = {
  id: string;
  impact: string | null;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
};

async function expectWcagViolationsToBeEmpty(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & {
      axe?: { run: (context: Document, options: unknown) => Promise<{ violations: AxeViolation[] }> };
    }).axe;
    if (!axeApi) throw new Error('axe-core did not load in the browser page.');
    const result = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    return result.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    }));
  });

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test('primary views have no WCAG 2A or 2AA violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Big promises/i })).toBeVisible();
  await expectWcagViolationsToBeEmpty(page);

  const views = [
    { button: 'Review configuration', marker: /What promise are we testing/i },
    { button: 'My desk', marker: /Connect your investigator wallet/i },
    { button: 'Receipt wall', marker: /Waiting for the first verified receipt/i },
    { button: 'How it works', marker: /not a general security audit/i },
  ];
  for (const view of views) {
    await page.locator('.desktop-nav').getByRole('button', { name: view.button }).click();
    await expect(page.getByText(view.marker)).toBeVisible();
    await expectWcagViolationsToBeEmpty(page);
  }
});
