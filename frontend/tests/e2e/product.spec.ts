/** Browser integration smoke tests only. Test-only injected wallet never ships to runtime. */
import { test, expect } from '@playwright/test';

test('product renders without fictional on-chain cases', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', {name:/Big promises/i})).toBeVisible();
  await expect(page.getByText(/No cases on the board yet/i)).toBeVisible();
});

test('deployment state is explicit and never fictional', async ({page}) => {
  await page.goto('/');
  const configured = page.getByText(/V2 funding is unavailable/i);
  const unconfigured = page.getByText(/V2 deployment not configured/i);
  if (await configured.count()) {
    await expect(configured).toBeVisible();
    await expect(page.getByText(/frontend configuration does not currently agree/i)).toBeVisible();
  } else {
    await expect(unconfigured).toBeVisible();
    await expect(page.getByText(/not a simulated chain/i)).toBeVisible();
  }
});

test('funding configuration keeps value-bearing writes explicit without hiding the workflow', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.desktop-nav').getByRole('button',{name:'Review configuration'})).toBeVisible();
  await page.locator('.desktop-nav').getByRole('button',{name:'Review configuration'}).click();
  await expect(page.getByText(/What promise are we testing/i)).toBeVisible();
  await expect(page.getByText(/Bounty in GEN/i)).toBeVisible();
  await expect(page.getByText(/Funding is not enabled in this frontend/i)).toBeVisible();
  await expect(page.getByRole('button',{name:'Fund & publish'})).toHaveCount(0);
  await page.getByRole('button',{name:'Receipt home'}).click();
  await expect(page.getByText(/Read the configured deployment state/i)).toBeVisible();
  await expect(page.getByText(/Validators decide, you collect/i)).toHaveCount(0);
});

test('investigator desk demands a wallet', async ({page}) => {
  await page.goto('/');
  await page.locator('.desktop-nav').getByRole('button',{name:'My desk'}).click();
  await expect(page.getByText(/Connect your investigator wallet/i)).toBeVisible();
});

test('receipt wall does not invent confirmations', async ({page}) => {
  await page.goto('/');
  await page.locator('.desktop-nav').getByRole('button',{name:'Receipt wall'}).click();
  await expect(page.getByText(/Waiting for the first verified receipt/i)).toBeVisible();
});

test('historical V1 viewer is explicit and read-only', async ({page}) => {
  await page.goto('/');
  await page.locator('.desktop-nav').getByRole('button', {name:'V1 history'}).click();
  const configured = page.getByText(/Read-only history/i);
  const unconfigured = page.getByText(/Historical V1 viewer is not configured/i);
  expect(await configured.count() + await unconfigured.count()).toBeGreaterThan(0);
  if (await configured.count()) {
    await expect(configured).toBeVisible();
    await expect(page.getByText(/V1 credits remain at the historical PromiseVault/i)).toBeVisible();
  } else {
    await expect(unconfigured).toBeVisible();
  }
});

test('about page disclaims universal audit guarantees', async ({page}) => {
  await page.goto('/');
  await page.locator('.desktop-nav').getByRole('button',{name:'How it works'}).click();
  await expect(page.getByText(/not a general security audit/i)).toBeVisible();
});

test('wallet displays wrong-chain blocking, not pretend 61999', async ({page}) => {
  await page.addInitScript(() => {
    const fakeWallet: NonNullable<Window['ethereum']> = {
      request: async ({method}: {method:string}) => {
        if (method==='eth_accounts'||method==='eth_requestAccounts') return ['0x'+'1'.repeat(40)];
        if (method==='eth_chainId') return '0xf22d';
        throw Error('Test wallet intentionally rejects signing and chain switching');
      }, on:()=>{}, removeListener:()=>{},
    };
    window.ethereum = fakeWallet;
  });
  await page.goto('/');
  await expect(page.getByText(/Writes are blocked until Studionet 61999/i)).toBeVisible();
});

test('transaction drawer does not display fictitious successful hashes', async ({page}) => {
  await page.goto('/');
  await page.getByTitle('Transactions').click();
  await expect(page.getByText(/Your real contract interactions show up here/i)).toBeVisible();
});

test('mobile navigation exposes the whole product', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.locator('.mobile-nav').getByRole('button',{name:'Receipt wall'}).click();
  await expect(page.getByText(/Waiting for the first verified receipt/i)).toBeVisible();
});

test('build-info reports provenance without inventing a source commit', async ({request}) => {
  const r=await request.get('/api/build-info'); expect(r.ok()).toBeTruthy();
  const info=await r.json(); expect(info.chain_id).toBe(61999);
  expect(info.project).toBe('RECEIPT!');
  expect(info.provenance).toContain('environment-claimed');
});
